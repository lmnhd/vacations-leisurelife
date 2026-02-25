import { z } from 'zod';
import { runPricingComparator } from '@/lib/chat/tools/pricing-comparator';

const PricingComparatorTestRequestSchema = z.object({
    baseFare: z.number(),
    taxesFeesPortExpenses: z.number(),
    gratuities: z.number().default(0),
    numberOfGuests: z.number().min(1),
    numberOfNights: z.number().min(1),
    clientTotalBudget: z.number()
});

export async function handlePricingComparatorTestRequest(
    body: unknown
): Promise<{ status: number; data: Record<string, unknown> }> {
    try {
        const parsed = PricingComparatorTestRequestSchema.parse(body);

        const result = await runPricingComparator({
            baseFare: parsed.baseFare,
            taxesFeesPortExpenses: parsed.taxesFeesPortExpenses,
            gratuities: parsed.gratuities,
            numberOfGuests: parsed.numberOfGuests,
            numberOfNights: parsed.numberOfNights,
            clientTotalBudget: parsed.clientTotalBudget
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
