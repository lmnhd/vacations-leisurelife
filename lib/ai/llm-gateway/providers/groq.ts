/**
 * LLM GATEWAY - GROQ PROVIDER  (Llama / open-source models)
 * Uses the Groq SDK (OpenAI-compatible API).
 * Requires env: GROQ_API_KEY
 */

import type { LLMCallOptions, LLMResponse } from '../types';

export async function callGroq(
  apiId: string,
  prompt: string,
  maxTokens: number,
  options: LLMCallOptions = {}
): Promise<LLMResponse> {
  // @ts-ignore — optional dependency; install groq-sdk to activate
  const Groq = (await import('groq-sdk')).default;
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const messages: { role: 'system' | 'user'; content: string }[] = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await client.chat.completions.create({
    model:       apiId,
    messages,
    max_tokens:  maxTokens,
    temperature: options.temperature,
  });

  const choice = response.choices[0];
  return {
    content: choice?.message?.content ?? '',
    model:   response.model,
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
