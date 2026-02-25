import { z } from 'zod';
import { resolveOnboardingStage } from '@/lib/chat/onboarding-flow';

const OnboardingStageRequestSchema = z.object({
    activeContextPath: z.string().min(1, 'activeContextPath is required'),
    conversationText: z.string().default(''),
});

export async function handleOnboardingGuidanceRequest(body: unknown): Promise<{
    status: number;
    data: {
        stage?: 'welcome' | 'travel_history' | 'logistics_basics' | 'soft_close';
        contextPath?: string;
        error?: string;
    };
}> {
    const parsed = OnboardingStageRequestSchema.safeParse(body);
    if (!parsed.success) {
        return {
            status: 400,
            data: {
                error: parsed.error.errors.map((errorItem) => errorItem.message).join(', '),
            },
        };
    }

    const result = resolveOnboardingStage(parsed.data);
    if (!result) {
        return {
            status: 200,
            data: {},
        };
    }

    return {
        status: 200,
        data: {
            stage: result.stage,
            contextPath: result.contextPath,
        },
    };
}
