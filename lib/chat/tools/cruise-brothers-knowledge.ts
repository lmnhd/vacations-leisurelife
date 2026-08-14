import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod/v3';
import { callLLM, modelForTask } from '@/lib/ai/llm-gateway';
import {
    KnowledgeCacheSchema,
    assessFreshness,
    entriesFromCache,
    type KnowledgeEntry,
} from '@/lib/chat/tools/cb-knowledge-schema';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const AiMatchSchema = z.object({
    indices: z.array(z.number()),
    reasoning: z.string(),
});

const CACHE_FILE_PATH = path.join(process.cwd(), '.github', 'data', 'cb-knowledge-cache.json');

// ─── AI semantic selection ────────────────────────────────────────────────────

async function selectRelevantEntries(
    query: string,
    entries: KnowledgeEntry[]
): Promise<number[]> {
    // Build a compact index: "0: Title [kind/jurisdiction] — first 80 chars of content"
    const index = entries
        .map((entry, i) => {
            const facets = [entry.sectionKind, entry.jurisdiction]
                .filter(Boolean)
                .join('/');
            const facetLabel = facets ? ` [${facets}]` : '';
            return `${i}: ${entry.title}${facetLabel} — ${entry.content.slice(0, 80)}`;
        })
        .join('\n');

    const systemPrompt = [
        'You are a knowledge retrieval assistant for Cruise Brothers travel agents.',
        'Given a query and an index of knowledge entries, return the indices of the 1-3 entries that genuinely answer the query.',
        'Prefer entries whose section kind and jurisdiction match the query (e.g. an insurance question about Florida should match an insurance entry scoped to FL).',
        'Only return entries with directly relevant content. Never match on incidental word overlap.',
        'Respond with JSON: { "indices": [<number>, ...], "reasoning": "<one sentence>" }',
    ].join(' ');

    // Route through semantic task mapping so legacy/fast decision model stays centralized.
    const { content } = await callLLM(modelForTask('legacy_decision'), `QUERY: ${query}\n\nINDEX:\n${index}`, {
        systemPrompt,
        temperature: 0,
        maxTokens:   200,
    });

    const parsed = AiMatchSchema.safeParse(JSON.parse(content));

    if (!parsed.success || parsed.data.indices.length === 0) {
        return [];
    }

    return parsed.data.indices.filter((idx) => idx >= 0 && idx < entries.length);
}

// ─── Attribution rendering ──────────────────────────────────────────────────────

/**
 * Builds a one-line attribution/freshness suffix so the copilot can separate
 * confirmed dated guidance from stale or authority-unclear material, per the
 * plan's source-and-freshness rules.
 */
function attributionLine(entry: KnowledgeEntry): string {
    const facets: string[] = [];
    if (entry.supplier) facets.push(`supplier: ${entry.supplier}`);
    if (entry.jurisdiction) facets.push(`jurisdiction: ${entry.jurisdiction}`);
    if (entry.effectiveDate) facets.push(`effective: ${entry.effectiveDate}`);
    if (entry.retrievedAtIso) facets.push(`retrieved: ${entry.retrievedAtIso.slice(0, 10)}`);

    const freshness = assessFreshness(entry);
    if (freshness.state === 'stale') {
        facets.push(`STALE (${freshness.ageDays}d old; verify with supplier)`);
    } else if (freshness.state === 'unknown') {
        facets.push('date/authority unclear — treat as operational guidance');
    }

    return facets.length > 0 ? ` [${facets.join('; ')}]` : ' [date/authority unclear — treat as operational guidance]';
}

// ─── Public handler ───────────────────────────────────────────────────────────

export interface CruiseBrothersKnowledgeMatch {
    title: string;
    source?: string;
    url?: string;
    supplier?: string;
    jurisdiction?: string;
    sectionKind?: string;
    docType?: string;
    effectiveDate?: string;
    retrievedAtIso?: string;
    freshness: 'fresh' | 'stale' | 'unknown';
}

export async function runCruiseBrothersKnowledgeLookup(input: {
    query: string;
}): Promise<{
    knowledgeSummary: string;
    matches: CruiseBrothersKnowledgeMatch[];
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
    const entries = entriesFromCache(parsedCache);

    if (!input.query.trim()) {
        throw new Error('Cruise Brothers query must not be empty.');
    }

    const selectedIndices = await selectRelevantEntries(input.query, entries);

    if (selectedIndices.length === 0) {
        throw new Error(`No relevant Cruise Brothers knowledge found for query: "${input.query}"`);
    }

    const selectedEntries = selectedIndices.map((idx) => entries[idx]!);

    const knowledgeSummary = selectedEntries
        .map((entry) => `- ${entry.title}${attributionLine(entry)}: ${entry.content}`)
        .join('\n');

    return {
        knowledgeSummary,
        matches: selectedEntries.map((entry) => ({
            title: entry.title,
            source: entry.source,
            url: entry.url,
            supplier: entry.supplier,
            jurisdiction: entry.jurisdiction,
            sectionKind: entry.sectionKind,
            docType: entry.docType,
            effectiveDate: entry.effectiveDate,
            retrievedAtIso: entry.retrievedAtIso,
            freshness: assessFreshness(entry).state,
        })),
    };
}
