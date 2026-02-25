import { z } from 'zod';

// ─── Output Schema ────────────────────────────────────────────────────────────

const ExcursionResultSchema = z.object({
    name: z.string(),
    priceRange: z.string(),
    duration: z.string(),
    difficulty: z.string(),
    highlights: z.string(),
});

type ExcursionResult = z.infer<typeof ExcursionResultSchema>;

const PerplexityResponseSchema = z.object({
    choices: z.array(
        z.object({
            message: z.object({
                content: z.string(),
            }),
        })
    ),
});

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildExcursionSystemPrompt(): string {
    return [
        'You are a cruise excursion research specialist.',
        'For each excursion you find, return a JSON array of objects with these fields:',
        '  name (string) — excursion title',
        '  priceRange (string) — e.g. "$60–$120 per person"',
        '  duration (string) — e.g. "4 hours"',
        '  difficulty (string) — one of: Easy, Moderate, Strenuous',
        '  highlights (string) — 1-sentence summary of the experience',
        '',
        'Return ONLY a valid JSON array. No markdown, no commentary.',
        'If you find fewer than 3 excursions, return what you find.',
        'Return at most 6 excursions, prioritizing the most popular and well-reviewed.',
    ].join('\n');
}

function buildExcursionUserPrompt(input: {
    port: string;
    interests: string | null;
    cruiseLine: string | null;
}): string {
    const lines: string[] = [
        `Port of call: ${input.port}`,
    ];

    if (input.interests) {
        lines.push(`Guest interests: ${input.interests}`);
    }

    if (input.cruiseLine) {
        lines.push(`Cruise line: ${input.cruiseLine} (check if they offer exclusive excursions here)`);
    }

    lines.push('Find the best shore excursions available at this port.');

    return lines.join('\n');
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseExcursionsFromResponse(rawContent: string): ExcursionResult[] {
    const trimmed = rawContent.trim();

    // Try to extract JSON array from the response (LLM may wrap it in markdown fences)
    const jsonArrayMatch = trimmed.match(/\[[\s\S]*\]/);
    if (!jsonArrayMatch) {
        return [];
    }

    try {
        const parsed: unknown = JSON.parse(jsonArrayMatch[0]);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((item: unknown) => {
                const result = ExcursionResultSchema.safeParse(item);
                return result.success ? result.data : null;
            })
            .filter((item): item is ExcursionResult => item !== null);
    } catch {
        return [];
    }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function runExcursionFinder(input: {
    port: string;
    interests: string | null;
    cruiseLine: string | null;
}): Promise<{
    excursionSummary: string;
    excursions: ExcursionResult[];
}> {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
        throw new Error('Missing PERPLEXITY_API_KEY environment variable.');
    }

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'sonar',
            messages: [
                { role: 'system', content: buildExcursionSystemPrompt() },
                { role: 'user', content: buildExcursionUserPrompt(input) },
            ],
            temperature: 0.2,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Perplexity request failed (${response.status}): ${errorBody}`);
    }

    const parsedResponse = PerplexityResponseSchema.parse(await response.json());
    const rawContent = parsedResponse.choices[0]?.message.content?.trim();

    if (!rawContent) {
        throw new Error('Perplexity returned an empty excursion research response.');
    }

    const excursions = parseExcursionsFromResponse(rawContent);

    // Build a human-readable summary for inline injection into the conversation
    const excursionSummary = excursions.length > 0
        ? excursions
            .map((excursion, index) =>
                `${index + 1}. **${excursion.name}** — ${excursion.priceRange} | ${excursion.duration} | ${excursion.difficulty}\n   ${excursion.highlights}`
            )
            .join('\n')
        : rawContent; // Fall back to raw Perplexity prose if structured parsing fails

    return {
        excursionSummary,
        excursions,
    };
}
