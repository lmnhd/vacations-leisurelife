import { z } from 'zod';
import { dispatchTools } from '@/lib/chat/tool-dispatcher';

const DispatchToolsRequestSchema = z.object({
    llmResponseText: z.string().min(1, 'llmResponseText is required'),
    activeContextPath: z.string().min(1, 'activeContextPath is required'),
    allowedToolIds: z.array(z.string().min(1)).default([]),
});

export async function handleToolDispatcherTestRequest(body: unknown): Promise<{
    status: number;
    data: {
        finalLlmText?: string;
        toolCallsLog?: Array<{
            toolId: string;
            payload: unknown;
            status: 'executed' | 'validated_not_implemented';
        }>;
        error?: string;
    };
}> {
    const parsed = DispatchToolsRequestSchema.safeParse(body);
    if (!parsed.success) {
        return {
            status: 400,
            data: {
                error: parsed.error.errors.map((errorItem) => errorItem.message).join(', '),
            },
        };
    }

    try {
        const result = await dispatchTools(parsed.data);
        return {
            status: 200,
            data: {
                finalLlmText: result.finalLlmText,
                toolCallsLog: result.toolCallsLog,
            },
        };
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : 'Tool dispatcher test request failed';

        return {
            status: 500,
            data: {
                error: errorMessage,
            },
        };
    }
}
