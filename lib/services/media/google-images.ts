/**
 * Google Images Provider (via SerpApi)
 *
 * Queries Google Images using SerpApi for high-quality images.
 * Part of the MediaManager system (IMAGE_RETRIEVAL_SYSTEM.md §2).
 *
 * Env vars required:
 *   SERPAPI_KEY
 */

import { getJson } from 'serpapi';

const GOOGLE_IMAGE_SEARCH_TIMEOUT_MS = Number(process.env.SERPAPI_IMAGE_SEARCH_TIMEOUT_MS ?? '8000');
const GOOGLE_IMAGE_SEARCH_MAX_ATTEMPTS = 2;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoogleImageResult {
    title: string;
    imageUrl: string;
    thumbnailUrl: string;
    contextUrl: string;
    width: number;
    height: number;
}

export interface GoogleImageSearchResponse {
    results: GoogleImageResult[];
    query: string;
    totalResults: number;
}

// ─── Search Function ──────────────────────────────────────────────────────────

export async function searchGoogleImages(
    query: string,
    // We fetch a batch since some links might 404, we want options
    count: number = 20,
    sizeSize: 'l' | 'm' | 'any' = 'l'
): Promise<GoogleImageSearchResponse> {
    const apiKey = process.env.SERPAPI_KEY;

    if (!apiKey) {
        throw new Error('Missing SERPAPI_KEY environment variable');
    }

    const executeSearch = async (): Promise<any> => {
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`SerpApi Image Search timed out after ${GOOGLE_IMAGE_SEARCH_TIMEOUT_MS}ms`)), GOOGLE_IMAGE_SEARCH_TIMEOUT_MS);
        });

        return Promise.race([
            getJson({
                engine: 'google_images',
                q: query,
                api_key: apiKey,
                // Requesting size based on param
                ...(sizeSize !== 'any' ? { tbs: `isz:${sizeSize}` } : {}),
                safe: 'active',
            }),
            timeoutPromise,
        ]);
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= GOOGLE_IMAGE_SEARCH_MAX_ATTEMPTS; attempt += 1) {
        try {
            const response = await executeSearch();

            // The images_results array contains the parsed image data
            const rawResults = response.images_results || [];

            const results: GoogleImageResult[] = rawResults
                .slice(0, count)
                .map((item: any) => ({
                    title: item.title || query,
                    imageUrl: item.original || '',
                    thumbnailUrl: item.thumbnail || '',
                    contextUrl: item.link || '',
                    width: typeof item.original_width === 'number' ? item.original_width : 1920,
                    height: typeof item.original_height === 'number' ? item.original_height : 1080,
                }))
                .filter((res: GoogleImageResult) => res.imageUrl.length > 0);

            return {
                results,
                query,
                totalResults: results.length,
            };
        } catch (error: any) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const isTimeout = lastError.message.includes('timed out');
            if (!isTimeout || attempt === GOOGLE_IMAGE_SEARCH_MAX_ATTEMPTS) {
                break;
            }
        }
    }

    throw new Error(`SerpApi Image Search failed: ${lastError?.message || 'Unknown error'}`);
}

