import { z } from 'zod';

const PerplexityResponseSchema = z.object({
    choices: z.array(
        z.object({
            message: z.object({
                content: z.string(),
            }),
        })
    ),
});

const SocialMediaInsightsOutputSchema = z.object({
    common_highlights: z.array(z.string()),
    common_complaints: z.array(z.string()),
    sentiment_summary: z.string(),
});

type SocialMediaInsightsOutput = z.infer<typeof SocialMediaInsightsOutputSchema>;

export async function runSocialMediaInsights(input: {
    cruiseLine: string;
    shipName: string | null;
    destination: string | null;
}): Promise<SocialMediaInsightsOutput> {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
        throw new Error('Missing PERPLEXITY_API_KEY environment variable.');
    }

    const shipLine = input.shipName ? `Ship: ${input.shipName}` : '';
    const destinationLine = input.destination ? `Destination/Itinerary: ${input.destination}` : '';

    const query = [
        `Analyze recent social media reviews (YouTube transcripts, TikTok, Reddit, Instagram, Facebook, and cruise forums) for the following cruise:`,
        `Cruise Line: ${input.cruiseLine}`,
        shipLine,
        destinationLine,
        `Identify the most common highlights and complaints from real passengers. Synthesize the overall sentiment.`,
        `You MUST return your analysis EXACTLY as a raw JSON object matching this schema, with NO markdown formatting, NO backticks, and NO additional text:`,
        `{
            "common_highlights": ["string"],
            "common_complaints": ["string"],
            "sentiment_summary": "string"
        }`
    ].filter(Boolean).join('\n');

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
                    content: 'You are a social media sentiment analysis engine. You output strictly raw JSON without markdown or conversational filler.',
                },
                {
                    role: 'user',
                    content: query,
                },
            ],
            temperature: 0.1,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Perplexity request failed (${response.status}): ${errorBody}`);
    }

    const parsedResponse = PerplexityResponseSchema.parse(await response.json());
    let rawContent = parsedResponse.choices[0]?.message.content?.trim();
    
    if (!rawContent) {
        throw new Error('Perplexity returned an empty sentiment summary.');
    }

    // Strip markdown code blocks if the LLM ignored instructions
    if (rawContent.startsWith('```json')) {
        rawContent = rawContent.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (rawContent.startsWith('```')) {
        rawContent = rawContent.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    try {
        const jsonContent = JSON.parse(rawContent);
        return SocialMediaInsightsOutputSchema.parse(jsonContent);
    } catch (e) {
        throw new Error(`Failed to parse Perplexity JSON response: ${e instanceof Error ? e.message : 'Unknown error'}\nRaw Content: ${rawContent}`);
    }
}
