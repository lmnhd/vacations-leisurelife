/**
 * LLM GATEWAY - OPENAI PROVIDER
 * Thin wrapper around the OpenAI SDK (or Vercel AI SDK).
 * All token/temp concerns are resolved BEFORE this is called.
 */

import type { LLMCallOptions, LLMResponse } from '../types';

/**
 * Execute an OpenAI chat completion.
 * Requires env: OPENAI_API_KEY
 */
export async function callOpenAI(
  apiId: string,
  prompt: string,
  maxTokens: number,
  options: LLMCallOptions = {}
): Promise<LLMResponse> {
  // @ts-ignore — 'openai' is a peer dep; installed in target project, not in template dir
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
