import { z } from 'zod';

// ─── Perplexity shared types ───────────────────────────────────────────────────

const PerplexityResponseSchema = z.object({
    choices: z.array(
        z.object({
            message: z.object({
                content: z.string(),
            }),
        })
    ),
});

// ─── Shared Perplexity caller ──────────────────────────────────────────────────

async function callPerplexity(query: string): Promise<string> {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) throw new Error('Missing PERPLEXITY_API_KEY environment variable.');

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'sonar',
            messages: [
                {
                    role: 'system',
                    content: 'You are a cruise industry research and sentiment analysis engine. You output strictly raw JSON without markdown or conversational filler.',
                },
                { role: 'user', content: query },
            ],
            temperature: 0.1,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Perplexity request failed (${response.status}): ${errorBody}`);
    }

    const parsed = PerplexityResponseSchema.parse(await response.json());
    let rawContent = parsed.choices[0]?.message.content?.trim();

    if (!rawContent) throw new Error('Perplexity returned an empty response.');

    // Strip markdown code fences if the model ignored instructions
    if (rawContent.startsWith('```json')) {
        rawContent = rawContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (rawContent.startsWith('```')) {
        rawContent = rawContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    return rawContent;
}

// ─── Function 1: Specific cruise sentiment ────────────────────────────────────

const SocialMediaInsightsOutputSchema = z.object({
    common_highlights: z.array(z.string()),
    common_complaints: z.array(z.string()),
    sentiment_summary: z.string(),
});

export type SocialMediaInsightsOutput = z.infer<typeof SocialMediaInsightsOutputSchema>;

export async function runSocialMediaInsights(input: {
    cruiseLine: string;
    shipName: string | null;
    destination: string | null;
}): Promise<SocialMediaInsightsOutput> {
    const shipLine = input.shipName ? `Ship: ${input.shipName}` : '';
    const destinationLine = input.destination ? `Destination/Itinerary: ${input.destination}` : '';

    const query = [
        `Analyze recent social media reviews (YouTube, TikTok, Reddit, Instagram, Facebook, and cruise forums) for the following cruise:`,
        `Cruise Line: ${input.cruiseLine}`,
        shipLine,
        destinationLine,
        `Identify the most common highlights and complaints from real passengers. Synthesize the overall sentiment.`,
        `Return EXACTLY this raw JSON structure with NO markdown, NO backticks, NO extra text:`,
        `{"common_highlights":["string"],"common_complaints":["string"],"sentiment_summary":"string"}`,
    ].filter(Boolean).join('\n');

    const rawContent = await callPerplexity(query);

    try {
        return SocialMediaInsightsOutputSchema.parse(JSON.parse(rawContent));
    } catch (e) {
        throw new Error(`Failed to parse insights JSON: ${e instanceof Error ? e.message : String(e)}\nRaw: ${rawContent}`);
    }
}

// ─── Function 2: Broad cruise trend analysis (perspective-filtered) ───────────

export type TravelerPerspective = 'gen_z' | 'millennial' | 'gen_x' | 'boomer' | 'family' | 'solo' | 'luxury' | 'budget';

export type TrendCategory =
    | 'overall_industry'
    | 'dining_and_food'
    | 'onboard_entertainment'
    | 'shore_excursions'
    | 'value_and_pricing'
    | 'sustainability'
    | 'technology_and_connectivity'
    | 'health_and_wellness';

const CruiseTrendOutputSchema = z.object({
    trending_positives: z.array(z.string()),
    trending_negatives: z.array(z.string()),
    emerging_trends: z.array(z.string()),
    perspective_insights: z.array(z.string()),
    key_cruise_lines_mentioned: z.array(z.string()),
    trend_summary: z.string(),
});

export type CruiseTrendOutput = z.infer<typeof CruiseTrendOutputSchema>;

const PERSPECTIVE_LABELS: Record<TravelerPerspective, string> = {
    gen_z: 'Gen Z travelers (born 1997–2012): value authenticity, social media moments, unique experiences, and sustainability',
    millennial: 'Millennial travelers (born 1981–1996): value experiences over things, seek work-life balance, family-oriented, price-conscious',
    gen_x: 'Gen X travelers (born 1965–1980): value quality and reliability, less swayed by social media, appreciate privacy and flexibility',
    boomer: 'Baby Boomer travelers (born 1946–1964): value comfort, traditional dining, shore excursions, and loyalty programs',
    family: 'Family groups traveling with children: value kid-friendly activities, safety, convenience, and multi-generational appeal',
    solo: 'Solo travelers: value safety, social opportunities, solo cabin availability, and value-for-money',
    luxury: 'Luxury travelers: value ultra-premium amenities, personalized service, exclusive itineraries, and all-inclusive pricing',
    budget: 'Budget-conscious travelers: value price, included perks, repositioning sailings, and last-minute deals',
};

const CATEGORY_FOCUS: Record<TrendCategory, string> = {
    overall_industry: 'the cruise industry as a whole, including demand, fleet expansions, and industry-wide sentiment',
    dining_and_food: 'onboard dining quality, specialty restaurants, food trends, and complaints about meal options',
    onboard_entertainment: 'shows, activities, pool experiences, nightlife, and enrichment programming',
    shore_excursions: 'port destinations, excursion quality, independent vs cruise-line excursions, and new itineraries',
    value_and_pricing: 'ticket prices, hidden fees, nickel-and-diming complaints, and all-inclusive value perception',
    sustainability: 'environmental concerns, carbon footprint, plastic use, and eco-friendly cruise initiatives',
    technology_and_connectivity: 'Wi-Fi quality, app experiences, contactless features, and onboard tech innovations',
    health_and_wellness: 'spa facilities, fitness options, mental wellness programs, and health protocol sentiment',
};

export async function runCruiseTrendAnalysis(input: {
    perspective: TravelerPerspective | null;
    category: TrendCategory;
    cruiseLine: string | null;
    timeframe: string | null;
}): Promise<CruiseTrendOutput> {
    const perspectiveContext = input.perspective
        ? `Filter this analysis specifically through the lens of: ${PERSPECTIVE_LABELS[input.perspective]}.`
        : 'Analyze across all traveler demographics.';

    const cruiseLineScope = input.cruiseLine
        ? `Focus on ${input.cruiseLine} specifically, but note comparisons to competitors where relevant.`
        : 'Analyze across all major cruise lines (Royal Caribbean, Carnival, Norwegian, MSC, Celebrity, Princess, Holland America, Virgin Voyages, etc.).';

    const timeframeContext = input.timeframe
        ? `Focus on the timeframe: ${input.timeframe}.`
        : 'Focus on the last 6–12 months of social media discussions.';

    const categoryFocus = CATEGORY_FOCUS[input.category];

    const query = [
        `Analyze current cruise industry trends on social media (Reddit, TikTok, YouTube, Facebook groups, cruise forums like CruiseCritic, and travel blogs).`,
        `Category focus: ${categoryFocus}.`,
        perspectiveContext,
        cruiseLineScope,
        timeframeContext,
        `Identify what is trending positively (people raving about), trending negatively (common frustrations), and any emerging patterns not yet mainstream.`,
        `Return EXACTLY this raw JSON structure with NO markdown, NO backticks, NO extra text:`,
        `{"trending_positives":["string"],"trending_negatives":["string"],"emerging_trends":["string"],"perspective_insights":["string"],"key_cruise_lines_mentioned":["string"],"trend_summary":"string"}`,
    ].join('\n');

    const rawContent = await callPerplexity(query);

    try {
        return CruiseTrendOutputSchema.parse(JSON.parse(rawContent));
    } catch (e) {
        throw new Error(`Failed to parse trend analysis JSON: ${e instanceof Error ? e.message : String(e)}\nRaw: ${rawContent}`);
    }
}
