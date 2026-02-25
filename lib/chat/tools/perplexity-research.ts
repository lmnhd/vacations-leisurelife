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

export async function runPerplexityCruiseResearch(input: {
    query: string;
    destination: string | null;
    departureMonth: string | null;
}): Promise<{
    researchSummary: string;
    offers: string[];
}> {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
        throw new Error('Missing PERPLEXITY_API_KEY environment variable.');
    }

    const destinationLine = input.destination ? `Destination: ${input.destination}` : 'Destination: any';
    const departureMonthLine = input.departureMonth
        ? `Departure month: ${input.departureMonth}`
        : 'Departure month: flexible';

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
                    content:
                        'You are a cruise market research assistant. Return concise, factual cruise availability and pricing guidance.',
                },
                {
                    role: 'user',
                    content: [
                        `Research request: ${input.query}`,
                        destinationLine,
                        departureMonthLine,
                        'Provide practical cruise options, likely price ranges, and notable caveats.',
                    ].join('\n'),
                },
            ],
            temperature: 0.2,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Perplexity request failed (${response.status}): ${errorBody}`);
    }

    const parsedResponse = PerplexityResponseSchema.parse(await response.json());
    const researchSummary = parsedResponse.choices[0]?.message.content?.trim();
    if (!researchSummary) {
        throw new Error('Perplexity returned an empty research summary.');
    }

    return {
        researchSummary,
        offers: [],
    };
}
