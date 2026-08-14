/**
 * LLM GATEWAY - OPENAI PROVIDER
 * Thin wrapper around the OpenAI SDK.
 * All token/temp concerns are resolved BEFORE this is called.
 * Requires env: OPENAI_API_KEY
 */

import type {
  LLMCallOptions,
  LLMResponse,
  ToolAgentExecution,
  ToolAgentOptions,
  ToolAgentResult,
  ToolAgentSource,
} from '../types';
import type {
  ResponseInput,
  ResponseInputItem,
} from "openai/resources/responses/responses";

const COMPLETION_TOKENS_MODELS = ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5.2', 'gpt-5.2-pro', 'o1', 'o1-mini', 'o3', 'o3-mini'];

type OpenAIResponseContentPart = {
  type?: string;
  text?: string;
  refusal?: string;
};

function isNewGenerationModel(model: string): boolean {
  return COMPLETION_TOKENS_MODELS.some((prefix) => model.startsWith(prefix));
}

function tokenParam(model: string, count: number): Record<string, number> {
  return isNewGenerationModel(model)
    ? { max_completion_tokens: count }
    : { max_tokens: count };
}

function tempParam(model: string, value: number | undefined): Record<string, number> {
  if (value === undefined) {
    return {};
  }

  return isNewGenerationModel(model)
    ? {}
    : { temperature: value };
}

function extractMessageContent(
  content: string | OpenAIResponseContentPart[] | null | undefined,
): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => {
      if (typeof part?.text === 'string' && part.text.trim().length > 0) {
        return part.text;
      }
      if (typeof part?.refusal === 'string' && part.refusal.trim().length > 0) {
        return part.refusal;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function isModelAccessError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('does not exist') || message.includes('do not have access') || message.includes('model');
}

function getOpenAIFallbackModel(primaryModel: string): string {
  const configuredFallback = process.env.OPENAI_FALLBACK_MODEL?.trim();
  const fallback = configuredFallback && configuredFallback.length > 0 ? configuredFallback : 'gpt-5-mini';
  return fallback;
}

export async function callOpenAI(
  apiId: string,
  prompt: string,
  maxTokens: number,
  options: LLMCallOptions = {}
): Promise<LLMResponse> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const messages: any[] = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }

  if (options.images && options.images.length > 0) {
    const userContent: any[] = options.images.map((img) => ({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: 'low' },
    }));
    userContent.push({ type: 'text', text: prompt });
    messages.push({ role: 'user', content: userContent });
  } else {
    messages.push({ role: 'user', content: prompt });
  }

  const request = {
    model:       apiId,
    messages,
    ...(options.jsonMode && !isNewGenerationModel(apiId) ? { response_format: { type: 'json_object' as const } } : {}),
    ...tokenParam(apiId, maxTokens),
    ...tempParam(apiId, options.temperature),
  };

  let response;
  try {
    response = await client.chat.completions.create(request, { signal: options.signal });
  } catch (error) {
    if (!isModelAccessError(error)) {
      throw error;
    }

    const fallbackModel = getOpenAIFallbackModel(apiId);
    if (fallbackModel === apiId) {
      throw error;
    }

    console.warn(`[AI Gateway] OpenAI model "${apiId}" unavailable. Retrying with "${fallbackModel}".`);
    // gpt-5 family models return content:null (refusal path) when response_format:json_object
    // is requested via Chat Completions. Strip it — the system prompt handles JSON enforcement.
    const fallbackIsNewGeneration = isNewGenerationModel(fallbackModel);
    const fallbackRequest = {
      ...request,
      model: fallbackModel,
      stream: false as const,
      ...(fallbackIsNewGeneration ? { response_format: undefined } : {}),
    };
    response = await client.chat.completions.create(fallbackRequest, { signal: options.signal });
  }

  const choice = response.choices[0];
  const refusal = typeof choice?.message?.refusal === 'string' ? choice.message.refusal : null;
  if (refusal) {
    console.warn(`[AI Gateway] OpenAI model "${(response as { model: string }).model}" returned a refusal:`, refusal);
  }
  return {
    content:  extractMessageContent(choice?.message?.content),
    model:    response.model,
    usage: response.usage
      ? {
          promptTokens:     response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens:      response.usage.total_tokens,
        }
      : undefined,
    raw: response,
  };
}

function parseFunctionArguments(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

export async function runOpenAIResponsesToolAgent(
  apiId: string,
  prompt: string,
  options: ToolAgentOptions
): Promise<ToolAgentResult> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const tools = [
    ...(options.enableWebSearch === false
      ? []
      : [{ type: "web_search_preview" as const, search_context_size: "medium" as const }]),
    ...options.functions.map((definition) => ({
      type: "function" as const,
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
      strict: true,
    })),
  ];

  const input: ResponseInput = [
    { role: "user", content: prompt },
  ];
  const executions: ToolAgentExecution[] = [];
  let activeModel = apiId;
  async function createResponse() {
    try {
      return await client.responses.create({
        model: activeModel,
        instructions: options.systemPrompt,
        input,
        tools,
        tool_choice: "auto",
        parallel_tool_calls: false,
        max_output_tokens: options.maxOutputTokens ?? 4_000,
        reasoning: { effort: options.reasoningEffort ?? "medium" },
        include: ["reasoning.encrypted_content"],
        store: false,
      }, { signal: options.signal });
    } catch (error) {
      if (!isModelAccessError(error)) throw error;
      const fallbackModel = getOpenAIFallbackModel(activeModel);
      if (fallbackModel === activeModel) throw error;
      console.warn(`[AI Gateway] OpenAI Responses model "${activeModel}" unavailable. Retrying with "${fallbackModel}".`);
      activeModel = fallbackModel;
      return client.responses.create({
        model: activeModel,
        instructions: options.systemPrompt,
        input,
        tools,
        tool_choice: "auto",
        parallel_tool_calls: false,
        max_output_tokens: options.maxOutputTokens ?? 4_000,
        reasoning: { effort: options.reasoningEffort ?? "medium" },
        include: ["reasoning.encrypted_content"],
        store: false,
      }, { signal: options.signal });
    }
  }

  let response = await createResponse();

  const maxRounds = options.maxToolRounds ?? 4;
  for (let round = 0; round < maxRounds; round += 1) {
    const functionCalls = response.output.filter((item) => item.type === "function_call");
    if (functionCalls.length === 0) break;

    input.push(...(response.output as unknown as ResponseInputItem[]));
    for (const call of functionCalls) {
      let argumentsValue: Record<string, unknown> = {};
      let output: unknown;
      let succeeded = false;
      try {
        argumentsValue = parseFunctionArguments(call.arguments);
        output = await options.executeFunction(call.name, argumentsValue);
        succeeded = true;
      } catch (error) {
        output = {
          error: error instanceof Error ? error.message : "Tool execution failed.",
        };
      }
      executions.push({ name: call.name, arguments: argumentsValue, succeeded });
      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(output),
      });
    }

    response = await createResponse();
  }

  const sourceMap = new Map<string, ToolAgentSource>();
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const part of item.content) {
      if (part.type !== "output_text") continue;
      for (const annotation of part.annotations) {
        if (annotation.type === "url_citation") {
          sourceMap.set(annotation.url, { title: annotation.title, url: annotation.url });
        }
      }
    }
  }

  return {
    content: response.output_text.trim(),
    model: response.model,
    sources: Array.from(sourceMap.values()),
    executions,
  };
}
