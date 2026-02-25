/**
 * Dev Prompt Preview API — Core Logic
 */

import { z } from 'zod';
import { getPromptPreviewForSession } from '@/lib/chat/pipeline';

const PromptPreviewQuerySchema = z.object({
    sessionId: z.string().min(1, 'sessionId is required'),
    channel: z.enum(['text', 'voice']).default('text'),
});

export async function handlePromptPreviewRequest(input: {
    sessionId: string | null;
    channel: string | null;
}): Promise<{
    status: number;
    data: {
        sessionId?: string;
        channel?: 'text' | 'voice';
        activeContextPath?: string;
        systemPrompt?: string;
        error?: string;
    };
}> {
    const parsed = PromptPreviewQuerySchema.safeParse({
        sessionId: input.sessionId,
        channel: input.channel ?? 'text',
    });

    if (!parsed.success) {
        return {
            status: 400,
            data: {
                error: parsed.error.errors.map((errorItem) => errorItem.message).join(', '),
            },
        };
    }

    const { sessionId, channel } = parsed.data;

    try {
        const preview = await getPromptPreviewForSession({
            sessionId,
            channel,
        });

        return {
            status: 200,
            data: {
                sessionId,
                channel,
                activeContextPath: preview.activeContextPath,
                systemPrompt: preview.systemPrompt,
            },
        };
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : 'Prompt preview generation failed';

        return {
            status: 500,
            data: {
                sessionId,
                channel,
                error: errorMessage,
            },
        };
    }
}
