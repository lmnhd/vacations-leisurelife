/**
 * Realtime Tool Definitions
 *
 * Converts the available tool IDs (from the context resolver) into
 * OpenAI Realtime API function definitions for the session session.
 * These match the JSON schema format expected by the Realtime API.
 */

// ─── OpenAI Realtime function definition shape ────────────────────────────────

interface RealtimeFunctionParameter {
    type: string;
    description?: string;
    enum?: string[];
    items?: { type: string };
}

interface RealtimeFunctionDefinition {
    type: 'function';
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, RealtimeFunctionParameter>;
        required: string[];
    };
}

// ─── Per-tool definitions ─────────────────────────────────────────────────────

const TOOL_DEFINITIONS: Record<string, RealtimeFunctionDefinition> = {
    perplexity_cruise_research: {
        type: 'function',
        name: 'perplexity_cruise_research',
        description: 'Research cruise availability, pricing ranges, and destination trends using live web data.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The research question or topic' },
                destination: { type: 'string', description: 'Cruise destination or region (optional)' },
                departure_month: { type: 'string', description: 'Preferred departure month e.g. "June 2025" (optional)' },
            },
            required: ['query'],
        },
    },

    cruise_brothers_knowledge: {
        type: 'function',
        name: 'cruise_brothers_knowledge',
        description: 'Look up Cruise Brothers agent policies, supplier procedures, commission details, and Agent Perks.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The knowledge base question' },
            },
            required: ['query'],
        },
    },

    excursion_finder: {
        type: 'function',
        name: 'excursion_finder',
        description: 'Research shore excursions at a specific cruise port — pricing, duration, and booking tips.',
        parameters: {
            type: 'object',
            properties: {
                port: { type: 'string', description: 'Port of call name e.g. "Cozumel"' },
                interests: { type: 'string', description: 'Traveler interests e.g. "snorkeling, history" (optional)' },
                cruise_line: { type: 'string', description: 'Cruise line name for line-specific options (optional)' },
            },
            required: ['port'],
        },
    },

    cruise_brothers_scraper: {
        type: 'function',
        name: 'cruise_brothers_scraper',
        description: 'Search current cruise deals, promotions, and Agent Perks from the Cruise Brothers agent portal.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Deal search query' },
                cruise_line: { type: 'string', description: 'Filter by cruise line (optional)' },
                destination: { type: 'string', description: 'Filter by destination (optional)' },
            },
            required: ['query'],
        },
    },

    social_media_insights: {
        type: 'function',
        name: 'social_media_insights',
        description: 'Analyze social media sentiment for a specific cruise line, ship, or destination.',
        parameters: {
            type: 'object',
            properties: {
                cruise_line: { type: 'string', description: 'Cruise line name' },
                ship_name: { type: 'string', description: 'Ship name (optional)' },
                destination: { type: 'string', description: 'Destination or itinerary (optional)' },
            },
            required: ['cruise_line'],
        },
    },

    cruise_trend_analysis: {
        type: 'function',
        name: 'cruise_trend_analysis',
        description: 'Broad cruise industry trend research — what travelers are saying, what is trending positively or negatively, and emerging patterns. Supports filtering by traveler demographic.',
        parameters: {
            type: 'object',
            properties: {
                category: {
                    type: 'string',
                    description: 'Topic category to focus on',
                    enum: ['overall_industry', 'dining_and_food', 'onboard_entertainment', 'shore_excursions', 'value_and_pricing', 'sustainability', 'technology_and_connectivity', 'health_and_wellness'],
                },
                perspective: {
                    type: 'string',
                    description: 'Traveler demographic lens (optional)',
                    enum: ['gen_z', 'millennial', 'gen_x', 'boomer', 'family', 'solo', 'luxury', 'budget'],
                },
                cruise_line: { type: 'string', description: 'Focus on a specific cruise line (optional)' },
                timeframe: { type: 'string', description: 'Time window e.g. "last 3 months" (optional)' },
            },
            required: ['category'],
        },
    },
};

// ─── Spoken acknowledgment labels (matches thoughts_stream_label in tool JSON) ─

const TOOL_THINKING_LABELS: Record<string, string> = {
    perplexity_cruise_research: 'Give me a moment, I\'m looking that up for you.',
    cruise_brothers_knowledge: 'Let me check our agent resources on that.',
    excursion_finder: 'I\'m pulling up excursion options for that port.',
    cruise_brothers_scraper: 'Hold on, I\'m scanning current deals and promotions.',
    social_media_insights: 'I\'m checking what travelers are saying about that.',
    cruise_trend_analysis: 'Let me research the latest trends on that.',
    odysseus_search: 'I\'m searching live cruise availability right now.',
    pricing_comparator: 'Give me a second to run those numbers.',
};

export function getToolThinkingLabel(toolId: string): string {
    return TOOL_THINKING_LABELS[toolId] ?? 'Give me a moment while I look that up.';
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function buildRealtimeToolDefinitions(
    allowedToolIds: string[]
): RealtimeFunctionDefinition[] {
    return allowedToolIds
        .map((id) => TOOL_DEFINITIONS[id])
        .filter((def): def is RealtimeFunctionDefinition => def !== undefined);
}
