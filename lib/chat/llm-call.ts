import OpenAI from 'openai';
import type { ChatMessage } from './types';

export async function callChatLlm(input: {
    history: ChatMessage[];
}): Promise<string> {
    const openai = new OpenAI();

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: input.history.map((message) => ({
            role: message.role,
            content: message.content,
        })),
        max_tokens: 500,
        temperature: 0.8,
    });

    const rawReply = completion.choices[0]?.message?.content;
    if (!rawReply) {
        throw new Error('LLM returned an empty assistant response.');
    }

    return rawReply;
}
