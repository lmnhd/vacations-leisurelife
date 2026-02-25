import { z } from 'zod';
import { resolveOnboardingGuidance } from '@/lib/chat/onboarding-flow';

const OnboardingGuidanceRequestSchema = z.object({
    activeContextPath: z.string().min(1, 'activeContextPath is required'),
    conversationText: z.string().default(''),
});

export async function handleOnboardingGuidanceRequest(body: unknown): Promise<{
    status: number;
    data: {
        stage?: 'welcome' | 'travel_history' | 'logistics_basics' | 'soft_close';
        instructions?: string[];
        error?: string;
    };
}> {
    const parsed = OnboardingGuidanceRequestSchema.safeParse(body);
    if (!parsed.success) {
        return {
            status: 400,
            data: {
                error: parsed.error.errors.map((errorItem) => errorItem.message).join(', '),
            },
        };
    }

    const guidance = resolveOnboardingGuidance(parsed.data);
    if (!guidance) {
        return {
            status: 200,
            data: {
                instructions: [],
            },
        };
    }

    return {
        status: 200,
        data: {
            stage: guidance.stage,
            instructions: guidance.instructions,
        },
    };
}
