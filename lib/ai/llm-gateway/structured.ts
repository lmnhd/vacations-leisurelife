/**
 * Structured-output helper for feature code that needs a typed object back.
 *
 * Provider SDK details stay inside the LLM gateway. Feature modules should
 * resolve semantic task models, then call this helper rather than importing
 * provider adapters directly.
 */

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { z } from 'zod/v3';
import type {
  MessageCreateParamsNonStreaming,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages/messages';
import { getModelConfig, ModelName } from './models';
import type { ProviderName } from './types';

interface AnthropicInputSchema {
  type: 'object';
  properties?: unknown | null;
  required?: string[] | null;
  [key: string]: unknown;
}

export interface StructuredObjectOptions<TSchema extends z.ZodTypeAny> {
  model: ModelName;
  schema: TSchema;
  system: string;
  prompt: string;
  timeoutMs?: number;
  rawModelOverride?: string | null;
  /**
   * Set to `false` to disable OpenAI's strict JSON-Schema mode for this call.
   * This only affects OpenAI. Anthropic structured output is routed through
   * forced tool use and always re-validated with Zod after the model returns.
   */
  strictJsonSchema?: boolean;
}

export interface StructuredObjectResult<TSchema extends z.ZodTypeAny> {
  object: z.infer<TSchema>;
  modelId: string;
  warnings: string[];
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, modelId: string): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(() => {
      reject(new Error(`Structured LLM call timed out after ${timeoutMs}ms using model "${modelId}".`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (handle) clearTimeout(handle);
  }
}

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def as { typeName: string; [key: string]: unknown };

  switch (def.typeName) {
    case 'ZodObject': {
      const shapeSource = def.shape as (() => Record<string, z.ZodTypeAny>) | Record<string, z.ZodTypeAny>;
      const shape = typeof shapeSource === 'function' ? shapeSource() : shapeSource;
      return {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(shape).map(([key, value]) => [key, zodToJsonSchema(value)]),
        ),
        required: Object.keys(shape),
        additionalProperties: false,
      };
    }
    case 'ZodString': {
      const out: Record<string, unknown> = { type: 'string' };
      for (const check of (def.checks as Array<{ kind: string; value?: number }> | undefined) ?? []) {
        if (check.kind === 'min' && typeof check.value === 'number') out.minLength = check.value;
        if (check.kind === 'max' && typeof check.value === 'number') out.maxLength = check.value;
      }
      return out;
    }
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodEnum':
      return { type: 'string', enum: def.values as string[] };
    case 'ZodArray': {
      const out: Record<string, unknown> = { type: 'array', items: zodToJsonSchema(def.type as z.ZodTypeAny) };
      const minLength = def.minLength as { value?: number } | null | undefined;
      const maxLength = def.maxLength as { value?: number } | null | undefined;
      if (typeof minLength?.value === 'number') out.minItems = minLength.value;
      if (typeof maxLength?.value === 'number') out.maxItems = maxLength.value;
      return out;
    }
    case 'ZodRecord':
      return {
        type: 'object',
        additionalProperties: zodToJsonSchema(def.valueType as z.ZodTypeAny),
      };
    case 'ZodUnion':
      return {
        anyOf: (def.options as z.ZodTypeAny[]).map((option) => zodToJsonSchema(option)),
      };
    case 'ZodLiteral':
      return { const: def.value };
    case 'ZodOptional':
    case 'ZodNullable':
      return zodToJsonSchema(def.innerType as z.ZodTypeAny);
    default:
      throw new Error(`[AI Gateway] Structured output cannot convert Zod node "${def.typeName}" to provider JSON schema yet.`);
  }
}

async function generateOpenAIStructuredObject<TSchema extends z.ZodTypeAny>(args: {
  modelId: string;
  schema: TSchema;
  system: string;
  prompt: string;
  timeoutMs: number;
  strictJsonSchema: boolean;
}): Promise<z.infer<TSchema>> {
  const { object } = await withTimeout(
    generateObject({
      model: openai(args.modelId),
      schema: args.schema,
      system: args.system,
      prompt: args.prompt,
      providerOptions: {
        openai: { strictJsonSchema: args.strictJsonSchema },
      },
    }),
    args.timeoutMs,
    args.modelId,
  );

  return object;
}

async function generateAnthropicStructuredObject<TSchema extends z.ZodTypeAny>(args: {
  modelId: string;
  schema: TSchema;
  system: string;
  prompt: string;
  timeoutMs: number;
}): Promise<z.infer<TSchema>> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const toolName = 'return_structured_output';
  const inputSchema = zodToJsonSchema(args.schema);
  if (inputSchema.type !== 'object') {
    throw new Error('[AI Gateway] Anthropic structured output requires an object-shaped schema.');
  }

  const response = await withTimeout(
    client.messages.create({
      model: args.modelId,
      max_tokens: 8192,
      stream: false,
      system: args.system,
      messages: [{ role: 'user', content: args.prompt }],
      tools: [
        {
          name: toolName,
          description: 'Return the complete structured output object requested by the user.',
          input_schema: inputSchema as AnthropicInputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: toolName },
    } satisfies MessageCreateParamsNonStreaming),
    args.timeoutMs,
    args.modelId,
  );

  const toolUse = response.content.find(
    (part): part is ToolUseBlock => part.type === 'tool_use' && part.name === toolName,
  );
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error(`[AI Gateway] Anthropic structured output did not return required tool "${toolName}".`);
  }

  return args.schema.parse(toolUse.input);
}

function providerFromRawModelOverride(modelId: string): ProviderName | null {
  if (modelId.startsWith('claude-')) return 'anthropic';
  if (modelId.startsWith('gpt-') || modelId.startsWith('o')) return 'openai';
  return null;
}

export async function generateStructuredObject<TSchema extends z.ZodTypeAny>(
  options: StructuredObjectOptions<TSchema>,
): Promise<StructuredObjectResult<TSchema>> {
  const warnings: string[] = [];
  const timeoutMs = options.timeoutMs ?? 60_000;
  let modelId = options.rawModelOverride?.trim();
  let provider: ProviderName | null = null;

  if (modelId) {
    warnings.push(`Structured LLM call using raw model override "${modelId}". Prefer registering overrides in the gateway model registry.`);
    provider = providerFromRawModelOverride(modelId);
    if (!provider) {
      throw new Error(`[AI Gateway] Cannot infer provider for raw structured model override "${modelId}". Register it in the gateway model registry instead.`);
    }
  } else {
    const config = getModelConfig(options.model);
    provider = config.provider;
    modelId = config.apiId ?? options.model;
  }

  let object: z.infer<TSchema>;
  switch (provider) {
    case 'openai':
      object = await generateOpenAIStructuredObject({
        modelId,
        schema: options.schema,
        system: options.system,
        prompt: options.prompt,
        timeoutMs,
        strictJsonSchema: options.strictJsonSchema ?? true,
      });
      break;
    case 'anthropic':
      object = await generateAnthropicStructuredObject({
        modelId,
        schema: options.schema,
        system: options.system,
        prompt: options.prompt,
        timeoutMs,
      });
      break;
    default:
      throw new Error(`[AI Gateway] Structured output is not implemented for provider "${provider}".`);
  }

  return {
    object,
    modelId,
    warnings,
  };
}
