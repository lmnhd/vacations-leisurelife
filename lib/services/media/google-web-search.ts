/**
 * Google Web Search Provider (via SerpApi)
 *
 * Queries organic Google search results (not images) via SerpApi — used to
 * find real, verifiable pages (subreddits, YouTube channels, forums) rather
 * than having an LLM imagine plausible-sounding community names. Mirrors
 * google-images.ts's request shape, swapping `engine: 'google_images'` for
 * the organic `engine: 'google'`.
 *
 * Env vars required:
 *   SERPAPI_KEY
 */

import { getJson } from 'serpapi';

const GOOGLE_WEB_SEARCH_TIMEOUT_MS = Number(process.env.SERPAPI_WEB_SEARCH_TIMEOUT_MS ?? '8000');
const GOOGLE_WEB_SEARCH_MAX_ATTEMPTS = 2;

export interface GoogleWebSearchResult {
    title: string;
    url: string;
    snippet: string;
}

export interface GoogleWebSearchResponse {
    results: GoogleWebSearchResult[];
    query: string;
    totalResults: number;
}

export async function searchGoogleWeb(
    query: string,
    count: number = 10,
): Promise<GoogleWebSearchResponse> {
    const apiKey = process.env.SERPAPI_KEY;

    if (!apiKey) {
        throw new Error('Missing SERPAPI_KEY environment variable');
    }

    const executeSearch = async (): Promise<any> => {
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`SerpApi Web Search timed out after ${GOOGLE_WEB_SEARCH_TIMEOUT_MS}ms`)), GOOGLE_WEB_SEARCH_TIMEOUT_MS);
        });

        return Promise.race([
            getJson({
                engine: 'google',
                q: query,
                api_key: apiKey,
                safe: 'active',
            }),
            timeoutPromise,
        ]);
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= GOOGLE_WEB_SEARCH_MAX_ATTEMPTS; attempt += 1) {
        try {
            const response = await executeSearch();

            const rawResults = response.organic_results || [];

            const results: GoogleWebSearchResult[] = rawResults
                .slice(0, count)
                .map((item: any) => ({
                    title: item.title || query,
                    url: item.link || '',
                    snippet: item.snippet || '',
                }))
                .filter((res: GoogleWebSearchResult) => res.url.length > 0);

            return {
                results,
                query,
                totalResults: results.length,
            };
        } catch (error: any) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const isTimeout = lastError.message.includes('timed out');
            if (!isTimeout || attempt === GOOGLE_WEB_SEARCH_MAX_ATTEMPTS) {
                break;
            }
        }
    }

    throw new Error(`SerpApi Web Search failed: ${lastError?.message || 'Unknown error'}`);
}
