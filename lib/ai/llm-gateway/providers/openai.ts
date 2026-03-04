/**
 * LLM GATEWAY - OPENAI PROVIDER
 * Thin wrapper around the OpenAI SDK.
 * All token/temp concerns are resolved BEFORE this is called.
 * Requires env: OPENAI_API_KEY
 */

import type { LLMCallOptions, LLMResponse } from '../types';

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

  const response = await client.chat.completions.create(
    {
      model:       apiId,
      messages,
      max_tokens:  maxTokens,
      temperature: options.temperature,
    },
    { signal: options.signal }
  );

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
