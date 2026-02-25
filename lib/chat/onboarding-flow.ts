export type OnboardingStage = 'welcome' | 'travel_history' | 'logistics_basics' | 'soft_close';

export type OnboardingStageResult = {
    stage: OnboardingStage;
    contextPath: string;
};

function hasTravelHistorySignals(normalizedText: string): boolean {
    return (
        normalizedText.includes('cruise') ||
        normalizedText.includes('vacation') ||
        normalizedText.includes('travel')
    );
}

function hasLogisticsSignals(normalizedText: string): boolean {
    return (
        normalizedText.includes('port') ||
        normalizedText.includes('dates') ||
        normalizedText.includes('month') ||
        normalizedText.includes('from ') ||
        normalizedText.includes('travelers') ||
        normalizedText.includes('party')
    );
}

function hasCruiseExperience(normalizedText: string): boolean {
    return (
        normalizedText.includes('been on a cruise') ||
        normalizedText.includes('last cruise') ||
        normalizedText.includes('cruised before') ||
        normalizedText.includes('took a cruise')
    );
}

export function resolveOnboardingStage(input: {
    activeContextPath: string;
    conversationText: string;
}): OnboardingStageResult | null {
    if (!input.activeContextPath.startsWith('onboarding')) {
        return null;
    }

    const normalizedText = input.conversationText.toLowerCase();

    if (normalizedText.trim().length === 0) {
        return {
            stage: 'welcome',
            contextPath: 'onboarding',
        };
    }

    if (!hasTravelHistorySignals(normalizedText)) {
        return {
            stage: 'travel_history',
            contextPath: hasCruiseExperience(normalizedText)
                ? 'onboarding.cruise_experienced'
                : 'onboarding.cruise_novice',
        };
    }

    if (!hasLogisticsSignals(normalizedText)) {
        return {
            stage: 'logistics_basics',
            contextPath: 'onboarding',
        };
    }

    return {
        stage: 'soft_close',
        contextPath: 'onboarding',
    };
}
