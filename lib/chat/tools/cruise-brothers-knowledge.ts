import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const CACHE_FILE_PATH = path.join(process.cwd(), '.github', 'data', 'cb-knowledge-cache.json');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const KnowledgeEntrySchema = z.object({
    title: z.string(),
    content: z.string(),
    source: z.string().optional(),
    url: z.string().optional(),
    tags: z.array(z.string()).optional(),
});

const KnowledgeCacheSchema = z.union([
    z.array(KnowledgeEntrySchema),
    z.object({
        entries: z.array(KnowledgeEntrySchema),
    }),
]);

const AiMatchSchema = z.object({
    indices: z.array(z.number()),
    reasoning: z.string(),
});

type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>;

// ─── AI semantic selection ────────────────────────────────────────────────────

async function selectRelevantEntries(
    query: string,
    entries: KnowledgeEntry[]
): Promise<number[]> {
    // Build a compact index: "0: Title — first 80 chars of content"
    const index = entries
        .map((entry, i) => `${i}: ${entry.title} — ${entry.content.slice(0, 80)}`)
        .join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: [
                        'You are a knowledge retrieval assistant for Cruise Brothers travel agents.',
                        'Given a query and an index of knowledge entries, return the indices of the 1-3 entries that genuinely answer the query.',
                        'Only return entries with directly relevant content. Never match on incidental word overlap (e.g. "group" in a phone number label does not mean the entry answers a group-booking question).',
                        'Respond with JSON: { "indices": [<number>, ...], "reasoning": "<one sentence>" }',
                    ].join(' '),
                },
                {
                    role: 'user',
                    content: `QUERY: ${query}\n\nINDEX:\n${index}`,
                },
            ],
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenAI semantic selection failed: ${response.status}`);
    }

    const json = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = json.choices[0]?.message.content ?? '{}';
    const parsed = AiMatchSchema.safeParse(JSON.parse(content));

    if (!parsed.success || parsed.data.indices.length === 0) {
        return [];
    }

    return parsed.data.indices.filter((idx) => idx >= 0 && idx < entries.length);
}

// ─── Public handler ───────────────────────────────────────────────────────────

export async function runCruiseBrothersKnowledgeLookup(input: {
    query: string;
}): Promise<{
    knowledgeSummary: string;
    matches: Array<{
        title: string;
        source?: string;
        url?: string;
    }>;
}> {
    let rawCacheFile: string;
    try {
        rawCacheFile = await readFile(CACHE_FILE_PATH, 'utf-8');
    } catch {
        throw new Error(
            `Cruise Brothers knowledge cache is missing at ${CACHE_FILE_PATH}. ` +
            'Run the ingestion workflow to generate cb-knowledge-cache.json before using this tool.'
        );
    }

    const parsedCache = KnowledgeCacheSchema.parse(JSON.parse(rawCacheFile));
    const entries = Array.isArray(parsedCache) ? parsedCache : parsedCache.entries;

    if (!input.query.trim()) {
        throw new Error('Cruise Brothers query must not be empty.');
    }

    const selectedIndices = await selectRelevantEntries(input.query, entries);

    if (selectedIndices.length === 0) {
        throw new Error(`No relevant Cruise Brothers knowledge found for query: "${input.query}"`);
    }

    const selectedEntries = selectedIndices.map((idx) => entries[idx]!);

    const knowledgeSummary = selectedEntries
        .map((entry) => `- ${entry.title}: ${entry.content}`)
        .join('\n');

    return {
        knowledgeSummary,
        matches: selectedEntries.map((entry) => ({
            title: entry.title,
            source: entry.source,
            url: entry.url,
        })),
    };
}
