/**
 * Odysseus Warm-up — Core Logic
 *
 * Pre-runs common cruise searches to populate the DynamoDB tool cache.
 * Call this on server startup or via a scheduled job so the first voice
 * request hits cache (~ms) instead of spinning up a cold Playwright session (~60s).
 *
 * Cache TTL: 5 minutes (300s) — live pricing changes frequently.
 */

import { runOdysseusSearch } from '@/lib/chat/tools/odysseus-search';
import { getToolCache, setToolCache } from '@/lib/chat/tool-cache';
import type { OdysseusSearchInput } from '@/lib/chat/tools/odysseus-search';

export interface WarmupResult {
    input: OdysseusSearchInput;
    status: 'cached' | 'fetched' | 'error';
    durationMs: number;
    error?: string;
}

export interface WarmupSummary {
    total: number;
    cached: number;
    fetched: number;
    errors: number;
    results: WarmupResult[];
    totalDurationMs: number;
}

const COMMON_SEARCHES: OdysseusSearchInput[] = [
    { passengers: 2, guestAges: [35, 35] },
    { passengers: 2, guestAges: [45, 45] },
    { passengers: 4, guestAges: [40, 38, 12, 10] },
    { passengers: 2, guestAges: [35, 35], startDate: getMonthStart(1), endDate: getMonthEnd(1) },
    { passengers: 2, guestAges: [35, 35], startDate: getMonthStart(2), endDate: getMonthEnd(2) },
    { passengers: 2, guestAges: [35, 35], startDate: getMonthStart(3), endDate: getMonthEnd(3) },
];

function getMonthStart(offsetMonths: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() + offsetMonths, 1);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/01/${d.getFullYear()}`;
}

function getMonthEnd(offsetMonths: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() + offsetMonths + 1, 0); // last day of target month
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

export async function runOdysseusWarmup(): Promise<WarmupSummary> {
    const wallStart = Date.now();
    const results: WarmupResult[] = [];

    for (const input of COMMON_SEARCHES) {
        const start = Date.now();

        const existing = await getToolCache('odysseus_search', input as unknown as Record<string, unknown>);
        if (existing) {
            results.push({ input, status: 'cached', durationMs: Date.now() - start });
            console.log(`[odysseus-warmup] cache hit — ${JSON.stringify(input)}`);
            continue;
        }

        try {
            const output = await runOdysseusSearch(input);
            await setToolCache('odysseus_search', input as unknown as Record<string, unknown>, output as unknown as Record<string, unknown>, 300);
            results.push({ input, status: 'fetched', durationMs: Date.now() - start });
            console.log(`[odysseus-warmup] fetched + cached — ${JSON.stringify(input)} (${Date.now() - start}ms)`);
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            results.push({ input, status: 'error', durationMs: Date.now() - start, error });
            console.error(`[odysseus-warmup] error — ${JSON.stringify(input)}: ${error}`);
        }
    }

    return {
        total: results.length,
        cached: results.filter(r => r.status === 'cached').length,
        fetched: results.filter(r => r.status === 'fetched').length,
        errors: results.filter(r => r.status === 'error').length,
        results,
        totalDurationMs: Date.now() - wallStart,
    };
}
