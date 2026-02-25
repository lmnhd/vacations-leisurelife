import { z } from 'zod';
import { extractMemoryFacts } from '@/lib/chat/memory-extractor';

const MemoryExtractorRequestSchema = z.object({
    sessionId: z.string().min(1, 'sessionId is required'),
    activeContextPath: z.string().min(1, 'activeContextPath is required'),
    userMessage: z.string().min(1, 'userMessage is required'),
    assistantReply: z.string().default(''),
});

export async function handleMemoryExtractorTestRequest(body: unknown): Promise<{
    status: number;
    data: {
        extractedFacts?: Record<string, unknown>;
        error?: string;
    };
}> {
    const parsed = MemoryExtractorRequestSchema.safeParse(body);
    if (!parsed.success) {
        return {
            status: 400,
            data: {
                error: parsed.error.errors.map((errorItem) => errorItem.message).join(', '),
            },
        };
    }

    const extractedFacts = await extractMemoryFacts(parsed.data);
    return {
        status: 200,
        data: {
            extractedFacts,
        },
    };
}
