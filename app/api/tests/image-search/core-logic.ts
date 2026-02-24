/**
 * Test Image Search API — Core Logic
 *
 * Validates query input, calls Google Custom Search, returns image results.
 */

import { z } from 'zod';
import { searchGoogleImages } from '@/lib/services/media/google-images';
import type { GoogleImageSearchResponse } from '@/lib/services/media/google-images';

// ─── Request Validation ───────────────────────────────────────────────────────

const ImageSearchRequestSchema = z.object({
    query: z.string().min(1, 'Query is required').max(200),
    count: z.number().int().min(1).max(10).default(3),
});

// ─── Response Type ────────────────────────────────────────────────────────────

export interface ImageSearchApiResponse {
    data?: GoogleImageSearchResponse;
    error?: string;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleImageSearch(
    body: unknown
): Promise<{ status: number; data: ImageSearchApiResponse }> {
    const parsed = ImageSearchRequestSchema.safeParse(body);
    if (!parsed.success) {
        return {
            status: 400,
            data: { error: parsed.error.errors.map((e) => e.message).join(', ') },
        };
    }

    const { query, count } = parsed.data;

    try {
        const results = await searchGoogleImages(query, count);
        return { status: 200, data: { data: results } };
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Image search failed';
        console.error('[Image Search API] Error:', errorMessage);
        return { status: 500, data: { error: errorMessage } };
    }
}
