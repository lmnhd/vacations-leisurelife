/**
 * LLM GATEWAY - OPENAI PROVIDER
 * Thin wrapper around the OpenAI SDK.
 * All token/temp concerns are resolved BEFORE this is called.
 * Requires env: OPENAI_API_KEY
 */

import type { LLMCallOptions, LLMResponse } from '../types';

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
