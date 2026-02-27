/**
 * Odysseus Warm-up — Core Logic
 *
 * Pre-runs common cruise searches to populate the DynamoDB tool cache.
 * Call this on server startup or via a scheduled job so the first voice
 * request hits cache (~ms) instead of spinning up a cold Playwright session (~60s).
 *
 * Cache TTL: 5 minutes (300s) — live pricing changes frequently.
 */

import { getOdysseusSession } from '@/lib/services/odysseus/OdysseusSessionManager';

export interface WarmupSummary {
    status: 'ready' | 'error';
    durationMs: number;
    message: string;
}

/**
 * The sole purpose of the warm-up is to ensure the persistent Playwright browser
 * session is initialized and logged in before the first user voice request arrives.
 * Cache hits come naturally as real user searches repeat — there is no value in
 * pre-running speculative searches with guessed parameters.
 */
export async function runOdysseusWarmup(): Promise<WarmupSummary> {
    const start = Date.now();
    try {
        console.log('[odysseus-warmup] Acquiring persistent session (browser init + login)...');
        await getOdysseusSession();
        const durationMs = Date.now() - start;
        console.log(`[odysseus-warmup] Session ready in ${durationMs}ms`);
        return { status: 'ready', durationMs, message: 'Odysseus browser session initialized and ready.' };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[odysseus-warmup] Failed: ${message}`);
        return { status: 'error', durationMs: Date.now() - start, message };
    }
}
