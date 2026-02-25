import { z } from 'zod';
import { runCruiseBrothersScraper } from '@/lib/chat/tools/cruise-brothers-scraper';

const CbScraperTestRequestSchema = z.object({
    query: z.string().min(1),
    cruiseLine: z.string().nullable().optional(),
    destination: z.string().nullable().optional(),
});

export async function handleCbScraperTestRequest(
    body: unknown
): Promise<{ status: number; data: Record<string, unknown> }> {
    try {
        const parsed = CbScraperTestRequestSchema.parse(body);

        const result = await runCruiseBrothersScraper({
            query: parsed.query,
            cruiseLine: parsed.cruiseLine ?? null,
            destination: parsed.destination ?? null,
        });

        return {
            status: 200,
            data: {
                query: parsed.query,
                dealsSummary: result.dealsSummary,
                deals: result.deals,
                dealCount: result.deals.length,
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
