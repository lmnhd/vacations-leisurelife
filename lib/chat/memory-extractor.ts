function normalizeText(value: string): string {
    return value.toLowerCase();
}

function extractVibe(normalizedText: string): string | null {
    if (normalizedText.includes('relax') || normalizedText.includes('chill')) {
        return 'relaxing';
    }

    if (normalizedText.includes('adventure') || normalizedText.includes('excursion')) {
        return 'adventure';
    }

    if (normalizedText.includes('luxury') || normalizedText.includes('premium')) {
        return 'luxury';
    }

    if (normalizedText.includes('family') || normalizedText.includes('kids')) {
        return 'family';
    }

    if (normalizedText.includes('party') || normalizedText.includes('nightlife')) {
        return 'social';
    }

    return null;
}

function extractDiningPreference(normalizedText: string): string | null {
    if (normalizedText.includes('vegan')) {
        return 'vegan';
    }

    if (normalizedText.includes('vegetarian')) {
        return 'vegetarian';
    }

    if (normalizedText.includes('seafood')) {
        return 'seafood';
    }

    if (normalizedText.includes('steak')) {
        return 'steakhouse';
    }

    if (normalizedText.includes('buffet')) {
        return 'buffet';
    }

    return null;
}

function extractDeparturePort(normalizedText: string): string | null {
    const knownPorts: ReadonlyArray<string> = [
        'miami',
        'port canaveral',
        'fort lauderdale',
        'tampa',
        'galveston',
        'los angeles',
        'seattle',
        'new york',
        'new orleans',
    ];

    for (const port of knownPorts) {
        if (normalizedText.includes(port)) {
            return port;
        }
    }

    return null;
}

function extractBudgetPerPerson(normalizedText: string): number | null {
    const budgetMatch = normalizedText.match(/\$\s?(\d{3,5})/);
    if (budgetMatch && budgetMatch[1]) {
        return Number(budgetMatch[1]);
    }

    const underMatch = normalizedText.match(/under\s+(\d{3,5})/);
    if (underMatch && underMatch[1]) {
        return Number(underMatch[1]);
    }

    return null;
}

function extractTravelerCount(normalizedText: string): number | null {
    const travelerMatch = normalizedText.match(/(\d{1,2})\s+(travelers|guests|people|adults|kids)/);
    if (!travelerMatch || !travelerMatch[1]) {
        return null;
    }

    return Number(travelerMatch[1]);
}

export async function extractMemoryFacts(input: {
    sessionId: string;
    activeContextPath: string;
    userMessage: string;
    assistantReply: string;
}): Promise<Record<string, unknown>> {
    const normalizedUserMessage = normalizeText(input.userMessage);

    const vibe = extractVibe(normalizedUserMessage);
    const diningPreference = extractDiningPreference(normalizedUserMessage);
    const departurePort = extractDeparturePort(normalizedUserMessage);
    const budgetPerPerson = extractBudgetPerPerson(normalizedUserMessage);
    const travelerCount = extractTravelerCount(normalizedUserMessage);

    const facts: Record<string, unknown> = {
        metadata: {
            sessionId: input.sessionId,
            activeContextPath: input.activeContextPath,
            extractedAtIso: new Date().toISOString(),
        },
        preferences: {},
        logistics: {},
        group: {},
        financials: {},
    };

    if (vibe) {
        (facts.preferences as Record<string, unknown>).vibe = vibe;
    }

    if (diningPreference) {
        (facts.preferences as Record<string, unknown>).dining = diningPreference;
    }

    if (departurePort) {
        (facts.logistics as Record<string, unknown>).departure_port = departurePort;
    }

    if (travelerCount !== null) {
        (facts.group as Record<string, unknown>).total_travelers = travelerCount;
    }

    if (budgetPerPerson !== null) {
        (facts.financials as Record<string, unknown>).budget_per_person = budgetPerPerson;
    }

    return facts;
}
