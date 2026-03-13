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

function log(model: ModelName, provider: string, apiId: string, scores: Record<string, number>) {
  if (process.env.LLM_GATEWAY_VERBOSE === 'true') {
    console.log(
      `[AI Gateway] → ${model} (${provider}) apiId:${apiId} | coding:${scores.coding} logic:${scores.logic} speed:${scores.speed}`
    );
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Route a prompt to the correct provider and return a normalised LLMResponse.
 *
 * @param model   A value from the ModelName enum.
 * @param prompt  The user / task prompt (or full conversation as a string).
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

  log(model, config.provider, apiId, config.scores);

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
 * Stream tokens from an OpenAI/Groq-compatible endpoint.
 * Returns an async generator you can iterate over.
 *
 * @example
 *   for await (const chunk of streamLLM(ModelName.CLAUDE_4_SONNET, prompt)) {
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
    const { default: OpenAI } = config.provider === 'openai'
      ? await import('openai')
      // @ts-ignore — optional dependency; install groq-sdk to activate
      : await import('groq-sdk');
    const client = new (OpenAI as new (opts: { apiKey: string }) => InstanceType<typeof OpenAI>)({
      apiKey: config.provider === 'openai' ? process.env.OPENAI_API_KEY! : process.env.GROQ_API_KEY!,
    });

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });
    messages.push({ role: 'user', content: prompt });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await (client as any).chat.completions.create({
      model:       apiId,
      messages,
      max_tokens:  maxTokens,
      temperature,
      stream:      true,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const chunk of (stream as AsyncIterable<any>)) {
      yield chunk.choices?.[0]?.delta?.content ?? '';
    }
  } else {
    // Non-streaming fallback for providers without native streaming here
    const { content } = await callLLM(model, prompt, options);
    yield content;
  }
}
