import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const CACHE_FILE_PATH = path.join(process.cwd(), '.github', 'data', 'cb-knowledge-cache.json');

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

function normalizeQueryTerms(query: string): string[] {
    return query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3);
}

function scoreKnowledgeEntry(input: {
    queryTerms: string[];
    entry: z.infer<typeof KnowledgeEntrySchema>;
}): number {
    const searchText = [
        input.entry.title,
        input.entry.content,
        ...(input.entry.tags ?? []),
    ]
        .join(' ')
        .toLowerCase();

    return input.queryTerms.reduce((score, queryTerm) => {
        return searchText.includes(queryTerm) ? score + 1 : score;
    }, 0);
}

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

    const queryTerms = normalizeQueryTerms(input.query);
    if (queryTerms.length === 0) {
        throw new Error('Cruise Brothers query must include at least one 3+ character term.');
    }

    const rankedEntries = entries
        .map((entry) => ({
            entry,
            score: scoreKnowledgeEntry({
                queryTerms,
                entry,
            }),
        }))
        .filter((rankedEntry) => rankedEntry.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 3);

    if (rankedEntries.length === 0) {
        throw new Error(`No Cruise Brothers knowledge match found for query: ${input.query}`);
    }

    const knowledgeSummary = rankedEntries
        .map((rankedEntry) => `- ${rankedEntry.entry.title}: ${rankedEntry.entry.content}`)
        .join('\n');

    return {
        knowledgeSummary,
        matches: rankedEntries.map((rankedEntry) => ({
            title: rankedEntry.entry.title,
            source: rankedEntry.entry.source,
            url: rankedEntry.entry.url,
        })),
    };
}
