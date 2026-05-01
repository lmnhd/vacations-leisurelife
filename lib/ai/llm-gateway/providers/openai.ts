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
    ...(options.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
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
    const fallbackIsNewGeneration = COMPLETION_TOKENS_MODELS.some((p) => fallbackModel.startsWith(p));
    const fallbackRequest = {
      ...request,
      model: fallbackModel,
      stream: false as const,
      ...(fallbackIsNewGeneration ? { response_format: undefined } : {}),
    };
    response = await client.chat.completions.create(fallbackRequest, { signal: options.signal });
  }

  const choice = response.choices[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refusal = (choice?.message as any)?.refusal as string | null | undefined;
  if (refusal) {
    console.warn(`[AI Gateway] OpenAI model "${(response as { model: string }).model}" returned a refusal:`, refusal);
  }
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
