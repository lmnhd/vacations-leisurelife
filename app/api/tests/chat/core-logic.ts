/**
 * Test Chat API — Core Logic
 *
 * Business logic separated from the Next.js route handler.
 * Validates input with Zod, delegates to the chat pipeline.
 */

import { z } from 'zod';
import { runPipeline } from '@/lib/chat/pipeline';
import type { ChatResponse, Channel } from '@/lib/chat/types';

// ─── Request Validation ───────────────────────────────────────────────────────

const ChatRequestSchema = z.object({
    message: z.string().min(1, 'Message is required').max(2000),
    sessionId: z.string().min(1, 'Session ID is required'),
    channel: z.enum(['text', 'voice']).default('text'),
});

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleChatRequest(
    body: unknown
): Promise<{ status: number; data: ChatResponse }> {
    // Validate
    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
        return {
            status: 400,
            data: {
                reply: '',
                sessionId: '',
                error: parsed.error.errors.map((e) => e.message).join(', '),
            },
        };
    }

    const { message, sessionId, channel } = parsed.data;

    try {
        const result = await runPipeline({
            message,
            sessionId,
            channel: channel as Channel,
        });

        return {
            status: 200,
            data: {
                reply: result.reply,
                sessionId: result.sessionId,
            },
        };
    } catch (err) {
        const errorMessage =
            err instanceof Error ? err.message : 'Pipeline execution failed';
        console.error('[Chat API] Pipeline error:', errorMessage);

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
