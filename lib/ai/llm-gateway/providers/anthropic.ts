/**
 * LLM GATEWAY - ANTHROPIC PROVIDER
 * Thin wrapper around the Anthropic SDK.
 * Requires env: ANTHROPIC_API_KEY
 */

import type { LLMCallOptions, LLMResponse } from '../types';

export async function callAnthropic(
  apiId: string,
  prompt: string,
  maxTokens: number,
  options: LLMCallOptions = {}
): Promise<LLMResponse> {
  // @ts-ignore — optional dependency; install @anthropic-ai/sdk to activate
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model:       apiId,
    max_tokens:  maxTokens,
    system:      options.systemPrompt,
    messages:    [{ role: 'user', content: prompt }],
    temperature: options.temperature,
  });

  const firstBlock = response.content[0];
  const text = firstBlock?.type === 'text' ? firstBlock.text : '';

  return {
    content: text,
    model:   response.model,
    usage: {
      promptTokens:     response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      totalTokens:      response.usage.input_tokens + response.usage.output_tokens,
    },
    raw: response,
  };
}
