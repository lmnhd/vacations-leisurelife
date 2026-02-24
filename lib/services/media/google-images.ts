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
    count: number = 20
): Promise<GoogleImageSearchResponse> {
    const apiKey = process.env.SERPAPI_KEY;

    if (!apiKey) {
        throw new Error('Missing SERPAPI_KEY environment variable');
    }

    try {
        // Use SerpApi's getJson to query the google_images engine
        const response = await getJson({
            engine: "google_images",
            q: query,
            api_key: apiKey,
            // Requesting large images to ensure quality for the hero canvas
            tbs: "isz:l",
            safe: "active",
        });

        // The images_results array contains the parsed image data
        const rawResults = response.images_results || [];

        const results: GoogleImageResult[] = rawResults
            // take up to requested count
            .slice(0, count)
            // map safely, filtering items lacking critical URLs
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
        throw new Error(`SerpApi Image Search failed: ${error.message || String(error)}`);
    }
}

