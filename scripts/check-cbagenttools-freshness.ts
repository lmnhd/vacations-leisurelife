import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
    KnowledgeCacheSchema,
    assessFreshness,
    entriesFromCache,
    type KnowledgeSectionKind,
} from '../lib/chat/tools/cb-knowledge-schema';

// ─────────────────────────────────────────────────────────────────────────────
// Freshness check for the authenticated CB Agent Tools knowledge cache.
//
// Reports stale and undated entries so the operator knows when a re-ingest is due.
// Per-kind staleness thresholds live in `cb-knowledge-schema.ts` so the retrieval
// tool, the copilot labels, and this report all agree.
//
// Exit code:
//   0  no stale entries
//   1  cache missing / unreadable
//   2  one or more stale entries found (use in CI or a scheduled check)
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_FILE_PATH = path.join(process.cwd(), '.github', 'data', 'cb-knowledge-cache.json');

async function main(): Promise<void> {
    let raw: string;
    try {
        raw = await readFile(CACHE_FILE_PATH, 'utf-8');
    } catch {
        console.error(`[freshness] knowledge cache missing at ${CACHE_FILE_PATH}. Run: npm run ingest:cbagenttools`);
        process.exitCode = 1;
        return;
    }

    const entries = entriesFromCache(KnowledgeCacheSchema.parse(JSON.parse(raw)));
    const now = new Date();

    const stale: string[] = [];
    const unknown: string[] = [];
    const byKindStale: Partial<Record<KnowledgeSectionKind, number>> = {};

    for (const entry of entries) {
        const { state, ageDays, maxAgeDays } = assessFreshness(entry, now);
        const kind = entry.sectionKind ?? 'other';
        if (state === 'stale') {
            stale.push(`  [STALE] (${kind}, ${ageDays}d > ${maxAgeDays}d) ${entry.title} — ${entry.url ?? 'no url'}`);
            byKindStale[kind] = (byKindStale[kind] ?? 0) + 1;
        } else if (state === 'unknown') {
            unknown.push(`  [UNDATED] (${kind}) ${entry.title} — ${entry.url ?? 'no url'}`);
        }
    }

    console.log(`CB Agent Tools knowledge freshness — ${entries.length} entries, checked ${now.toISOString()}`);
    console.log('');

    if (stale.length > 0) {
        console.log(`STALE entries (${stale.length}):`);
        console.log(stale.join('\n'));
        console.log('');
        console.log('Stale by kind:', JSON.stringify(byKindStale));
        console.log('');
    } else {
        console.log('No stale entries. ✅');
        console.log('');
    }

    if (unknown.length > 0) {
        console.log(`Undated entries treated as operational guidance (${unknown.length}):`);
        console.log(unknown.slice(0, 25).join('\n'));
        if (unknown.length > 25) {
            console.log(`  … and ${unknown.length - 25} more.`);
        }
        console.log('');
    }

    if (stale.length > 0) {
        console.log('Action: re-run `npm run ingest:cbagenttools` to refresh stale sections.');
        process.exitCode = 2;
    }
}

main().catch((error: unknown) => {
    console.error(`[freshness] ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exitCode = 1;
});
