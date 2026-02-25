export function resolveOnboardingGuidance(input: {
    activeContextPath: string;
    conversationText: string;
}): {
    stage: 'welcome' | 'travel_history' | 'logistics_basics' | 'soft_close';
    instructions: string[];
} | null {
    if (!input.activeContextPath.startsWith('onboarding')) {
        return null;
    }

    const normalizedConversationText = input.conversationText.toLowerCase();

    if (normalizedConversationText.trim().length === 0) {
        return {
            stage: 'welcome',
            instructions: [
                'Onboarding stage is welcome: explain assistant value and ask one warm opener about travel goals.',
            ],
        };
    }

    const hasTravelHistorySignal =
        normalizedConversationText.includes('cruise') ||
        normalizedConversationText.includes('vacation') ||
        normalizedConversationText.includes('travel');

    if (!hasTravelHistorySignal) {
        return {
            stage: 'travel_history',
            instructions: [
                'Onboarding stage is travel_history: ask about past trips and preferred vacation vibe before logistics.',
            ],
        };
    }

    const hasLogisticsSignal =
        normalizedConversationText.includes('port') ||
        normalizedConversationText.includes('dates') ||
        normalizedConversationText.includes('month') ||
        normalizedConversationText.includes('from ') ||
        normalizedConversationText.includes('travelers') ||
        normalizedConversationText.includes('party');

    if (!hasLogisticsSignal) {
        return {
            stage: 'logistics_basics',
            instructions: [
                'Onboarding stage is logistics_basics: capture departure flexibility and party basics with one question.',
            ],
        };
    }

    return {
        stage: 'soft_close',
        instructions: [
            'Onboarding stage is soft_close: summarize collected profile signals and ask for consent to start package search.',
        ],
    };
}
