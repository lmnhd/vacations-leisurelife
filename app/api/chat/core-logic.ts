/**
 * Chat API — Core Logic
 *
 * Business logic separated from the Next.js route handler.
 */

import { z } from 'zod';
import { runPipeline } from '@/lib/chat/pipeline';
import type { ChatResponse } from '@/lib/chat/types';

const ChatRequestSchema = z.object({
    message: z.string().min(1, 'Message is required').max(2000),
    sessionId: z.string().min(1, 'Session ID is required'),
    userId: z.string().optional(),
    channel: z.enum(['text', 'voice']).default('text'),
});

export async function handleChatRequest(
    body: unknown
): Promise<{ status: number; data: ChatResponse }> {
    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
        return {
            status: 400,
            data: {
                reply: '',
                sessionId: '',
                error: parsed.error.errors.map((errorItem) => errorItem.message).join(', '),
            },
        };
    }

    const { message, sessionId, userId, channel } = parsed.data;
    const resolvedUserId = userId ?? `anon:${sessionId}`;

    try {
        const result = await runPipeline({
            message,
            sessionId,
            userId: resolvedUserId,
            channel,
        });

        return {
            status: 200,
            data: {
                reply: result.reply,
                sessionId: result.sessionId,
                display: result.display,
                toolCallsLog: result.toolCallsLog,
            },
        };
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : 'Pipeline execution failed';

        return {
            status: 500,
            data: {
                reply: '',
                sessionId,
                error: errorMessage,
            },
        };
    }
}
