import { z } from 'zod';
import { runExcursionFinder } from '@/lib/chat/tools/excursion-finder';

const ExcursionFinderTestRequestSchema = z.object({
    port: z.string().min(1),
    interests: z.string().nullable().optional(),
    cruiseLine: z.string().nullable().optional(),
});

export async function handleExcursionFinderTestRequest(
    body: unknown
): Promise<{ status: number; data: Record<string, unknown> }> {
    try {
        const parsed = ExcursionFinderTestRequestSchema.parse(body);

        const result = await runExcursionFinder({
            port: parsed.port,
            interests: parsed.interests ?? null,
            cruiseLine: parsed.cruiseLine ?? null,
        });

        return {
            status: 200,
            data: {
                port: parsed.port,
                excursionSummary: result.excursionSummary,
                excursions: result.excursions,
                excursionCount: result.excursions.length,
            },
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
            status: 500,
            data: { error: message },
        };
    }
}
