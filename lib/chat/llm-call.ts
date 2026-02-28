import OpenAI from 'openai';
import type { ChatMessage } from './types';

const COMPLETION_TOKENS_MODELS = ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5.2', 'gpt-5.2-pro', 'o1', 'o1-mini', 'o3', 'o3-mini'];

export const MODEL_MAIN = 'gpt-5-mini';        // primary reasoning model
export const MODEL_FAST = 'gpt-4o-mini';       // lightweight tasks: classifier, summarizer
export const MODEL_VOICE = 'o3-mini';          // voice pipeline

function tokenParam(model: string, count: number): Record<string, number> {
    return COMPLETION_TOKENS_MODELS.some((m) => model.startsWith(m))
        ? { max_completion_tokens: count }
        : { max_tokens: count };
}

function tempParam(model: string, value: number): Record<string, number> {
    return COMPLETION_TOKENS_MODELS.some((m) => model.startsWith(m))
        ? {}
        : { temperature: value };
}

export async function callChatLlm(input: {
    history: ChatMessage[];
    model?: string;
}): Promise<string> {
    const openai = new OpenAI();
    const model = input.model ?? MODEL_MAIN;

    const completion = await openai.chat.completions.create({
        model,
        messages: input.history.map((message) => ({
            role: message.role,
            content: message.content,
        })),
        ...tokenParam(model, 2000),
        ...tempParam(model, 0.8),
    });

    const rawReply = completion.choices[0]?.message?.content;
    if (!rawReply) {
        throw new Error('LLM returned an empty assistant response.');
    }

    return rawReply;
}
