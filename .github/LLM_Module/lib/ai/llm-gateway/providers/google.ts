/**
 * LLM GATEWAY - GOOGLE PROVIDER
 * Thin wrapper around @google/generative-ai SDK.
 * Requires env: GOOGLE_GENERATIVE_AI_API_KEY
 */

import type { LLMCallOptions, LLMResponse } from '../types';

export async function callGoogle(
  apiId: string,
  prompt: string,
  maxTokens: number,
  options: LLMCallOptions = {}
): Promise<LLMResponse> {
  // @ts-ignore — '@google/generative-ai' is a peer dep; installed in target project, not in template dir
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '');

  const model = genAI.getGenerativeModel({
    model: apiId,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature:     options.temperature,
    },
    systemInstruction: options.systemPrompt,
  });

  const result = await model.generateContent(prompt);
  const response = result.response;

  return {
    content: response.text(),
    model:   apiId,
    usage: response.usageMetadata
      ? {
          promptTokens:     response.usageMetadata.promptTokenCount ?? 0,
          completionTokens: response.usageMetadata.candidatesTokenCount ?? 0,
          totalTokens:      response.usageMetadata.totalTokenCount ?? 0,
        }
      : undefined,
    raw: response,
  };
}
