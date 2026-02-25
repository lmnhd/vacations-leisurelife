import { z } from 'zod';
import { runOdysseusSearch } from '@/lib/chat/tools/odysseus-search';

const OdysseusSearchTestRequestSchema = z.object({
    vendorId: z.number().nullable().optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    passengers: z.number().min(1).default(2),
    guestAges: z.array(z.number()).default([35, 35])
});

export async function handleOdysseusSearchTestRequest(
    body: unknown
): Promise<{ status: number; data: Record<string, unknown> }> {
    try {
        const parsed = OdysseusSearchTestRequestSchema.parse(body);

        const result = await runOdysseusSearch({
            vendorId: parsed.vendorId,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
            passengers: parsed.passengers,
            guestAges: parsed.guestAges
        });

        return {
            status: 200,
            data: result,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
            status: 500,
            data: { error: message },
        };
    }
}
