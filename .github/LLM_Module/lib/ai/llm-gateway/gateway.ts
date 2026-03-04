/**
 * LLM GATEWAY - CORE ORCHESTRATOR  (Updated: March 2026)
 * ─────────────────────────────────────────────────────────
 * Single entry point for ALL model invocations in the app.
 *
 * RULES FOR AGENTS:
 *   ✅  import { callLLM, ModelName } from '@/lib/ai/llm-gateway'
 *   ✅  Use TASK_MODEL_MAP or ModelName enum for model selection
 *   ❌  Never instantiate an SDK client outside this module
 *   ❌  Never hardcode a raw model string (e.g. 'gpt-4o')
 */

import { getModelConfig, ModelName } from './models';
import type { LLMCallOptions, LLMResponse } from './types';
import { callOpenAI }    from './providers/openai';
import { callAnthropic } from './providers/anthropic';
import { callGoogle }    from './providers/google';
import { callGroq }      from './providers/groq';

// ─── Logging ─────────────────────────────────────────────────────────────────

function log(model: ModelName, provider: string, scores: Record<string, number>) {
  if (process.env.LLM_GATEWAY_VERBOSE === 'true') {
    console.log(
      `[AI Gateway] → ${model} (${provider}) | coding:${scores.coding} logic:${scores.logic} speed:${scores.speed}`
    );
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Route a prompt to the correct provider and return a normalised LLMResponse.
 *
 * @param model   A value from the ModelName enum.
 * @param prompt  The user / task prompt.
 * @param options Optional overrides: temperature, systemPrompt, maxTokens.
 *
 * @example
 *   const { content } = await callLLM(ModelName.CLAUDE_4_OPUS, codeReviewPrompt);
 */
export async function callLLM(
  model: ModelName,
  prompt: string,
  options: LLMCallOptions = {}
): Promise<LLMResponse> {
  const config = getModelConfig(model);

  // Resolve parameters — options always win over registry defaults
  const temperature = options.temperature  ?? config.defaultTemp;
  const maxTokens   = options.maxTokens    ?? config.maxTokens;
  const apiId       = config.apiId         ?? model;

  log(model, config.provider, config.scores);

  const resolvedOptions: LLMCallOptions = {
    ...options,
    temperature,
    maxTokens,
  };

  switch (config.provider) {
    case 'openai':
      return callOpenAI(apiId, prompt, maxTokens, resolvedOptions);

    case 'anthropic':
      return callAnthropic(apiId, prompt, maxTokens, resolvedOptions);

    case 'google':
      return callGoogle(apiId, prompt, maxTokens, resolvedOptions);

    case 'groq':
      return callGroq(apiId, prompt, maxTokens, resolvedOptions);

    default:
      throw new Error(`[AI Gateway] Unsupported provider: "${config.provider}" for model "${model}"`);
  }
}

// ─── Streaming ───────────────────────────────────────────────────────────────

/**
 * Stream tokens from an OpenAI-compatible endpoint.
 * Returns an async generator you can iterate over.
 *
 * @example
 *   for await (const chunk of streamLLM(ModelName.GPT_5_MEDIUM, prompt)) {
 *     process.stdout.write(chunk);
 *   }
 */
export async function* streamLLM(
  model: ModelName,
  prompt: string,
  options: LLMCallOptions = {}
): AsyncGenerator<string> {
  const config  = getModelConfig(model);
  const apiId   = config.apiId ?? model;
  const maxTokens = options.maxTokens ?? config.maxTokens;
  const temperature = options.temperature ?? config.defaultTemp;

  if (config.provider === 'openai' || config.provider === 'groq') {
    // @ts-ignore — peer deps; installed in target project, not in template dir
    const { default: OpenAI } = config.provider === 'openai'
      // @ts-ignore
      ? await import('openai')
      // @ts-ignore
      : await import('groq-sdk');
    const client = new (OpenAI as new (opts: { apiKey: string }) => InstanceType<typeof OpenAI>)({
      apiKey: config.provider === 'openai' ? process.env.OPENAI_API_KEY! : process.env.GROQ_API_KEY!,
    });

    // @ts-expect-error — dynamic SDK shape
    const stream = await client.chat.completions.create({
      model:       apiId,
      messages:    [{ role: 'user', content: prompt }],
      max_tokens:  maxTokens,
      temperature,
      stream:      true,
    });

    // @ts-expect-error — async iterable
    for await (const chunk of stream) {
      yield chunk.choices?.[0]?.delta?.content ?? '';
    }
  } else {
    // Non-streaming fallback for providers without native streaming support here
    const { content } = await callLLM(model, prompt, options);
    yield content;
  }
}
