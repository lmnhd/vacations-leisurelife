/**
 * LLM GATEWAY - OPENAI PROVIDER
 * Thin wrapper around the OpenAI SDK.
 * All token/temp concerns are resolved BEFORE this is called.
 * Requires env: OPENAI_API_KEY
 */

import type { LLMCallOptions, LLMResponse } from '../types';

const COMPLETION_TOKENS_MODELS = ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5.2', 'gpt-5.2-pro', 'o1', 'o1-mini', 'o3', 'o3-mini'];

function tokenParam(model: string, count: number): Record<string, number> {
  return COMPLETION_TOKENS_MODELS.some((prefix) => model.startsWith(prefix))
    ? { max_completion_tokens: count }
    : { max_tokens: count };
}

function tempParam(model: string, value: number | undefined): Record<string, number> {
  if (value === undefined) {
    return {};
  }

  return COMPLETION_TOKENS_MODELS.some((prefix) => model.startsWith(prefix))
    ? {}
    : { temperature: value };
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

  const messages: { role: 'system' | 'user'; content: string }[] = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const request = {
    model:       apiId,
    messages,
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
    response = await client.chat.completions.create(
      {
        ...request,
        model: fallbackModel,
      },
      { signal: options.signal }
    );
  }

  const choice = response.choices[0];
  return {
    content:  choice?.message?.content ?? '',
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
