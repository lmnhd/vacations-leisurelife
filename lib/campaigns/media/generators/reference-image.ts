// lib/campaigns/media/generators/reference-image.ts
//
// Shared reference-image plumbing for every image backend that accepts input
// imagery (Nano-Banana `inline_data` parts, gpt-image-2 `images/edits` parts).
//
// Extracted from stability-generator.ts, which had the only hardened
// implementation. Both behaviours below were learned the expensive way and are
// preserved verbatim:
//
//   • Fetch is LOUD. It tries every candidate URL and throws ReferenceFetchError
//     with the full attempt list. It never returns null on failure — a silent
//     null is what let scene generation fall through to text-only output while
//     the manifest still looked complete (IMAGE_GEN_REVAMP_5-26, Phase 8).
//   • Normalization is TOLERANT. An unusable buffer yields null so the caller can
//     drop that one reference and still generate, rather than failing the batch.

import sharp from 'sharp';

/** Longest edge sent to an image API. Larger inputs are downscaled, never enlarged. */
export const REFERENCE_MAX_DIMENSION = 1280;
const REFERENCE_JPEG_QUALITY = 70;
const REMOTE_FETCH_TIMEOUT_MS = 90_000;

export interface NormalizedReferenceImage {
    buffer: Buffer;
    mimeType: string;
}

export class ReferenceFetchError extends Error {
    readonly attemptedUrls: string[];
    constructor(attemptedUrls: string[], lastError: unknown) {
        const last = lastError instanceof Error ? lastError.message : String(lastError);
        super(`Reference image fetch failed for all ${attemptedUrls.length} URL(s). Last error: ${last}. Attempted: ${attemptedUrls.join(' | ')}`);
        this.name = 'ReferenceFetchError';
        this.attemptedUrls = attemptedUrls;
    }
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Download the first usable image from an ordered candidate list.
 * @throws ReferenceFetchError when no candidate yields an image response.
 */
export async function fetchUsableReferenceImage(
    primaryUrl: string,
    fallbackUrl?: string,
): Promise<NormalizedReferenceImage> {
    const candidateUrls = [primaryUrl, fallbackUrl]
        .filter((u): u is string => typeof u === 'string' && u.length > 0)
        // r2://pending: placeholders are not fetchable URLs.
        .filter((u) => !u.startsWith('r2://pending:'));

    if (candidateUrls.length === 0) {
        throw new ReferenceFetchError([], new Error('no usable URL on reference asset'));
    }

    let lastError: unknown = new Error('unknown');
    for (const url of candidateUrls) {
        try {
            const response = await fetchWithTimeout(url, {}, REMOTE_FETCH_TIMEOUT_MS);
            if (!response.ok) {
                lastError = new Error(`HTTP ${response.status} from ${url}`);
                continue;
            }
            const mimeType = response.headers.get('content-type')?.split(';')[0] ?? '';
            if (!mimeType.startsWith('image/')) {
                lastError = new Error(`Non-image content-type "${mimeType}" from ${url}`);
                continue;
            }
            return { buffer: Buffer.from(await response.arrayBuffer()), mimeType };
        } catch (error) {
            lastError = error;
            console.warn('[reference-image] fetch attempt failed', {
                url,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    throw new ReferenceFetchError(candidateUrls, lastError);
}

/**
 * Downscale and re-encode a reference so an image API will accept it.
 *
 * Returns null (rather than throwing) when the buffer isn't a usable image, so
 * one bad reference degrades to "generate without it" instead of failing the run.
 */
export async function normalizeReferenceImage(
    sourceBuffer: Buffer,
    sourceMimeType?: string,
    maxDimension: number = REFERENCE_MAX_DIMENSION,
): Promise<NormalizedReferenceImage | null> {
    if (!sourceMimeType?.startsWith('image/')) {
        return null;
    }

    try {
        const pipeline = sharp(sourceBuffer).rotate();
        const metadata = await pipeline.metadata();
        const width = metadata.width ?? maxDimension;
        const height = metadata.height ?? maxDimension;

        const needsResize = Math.max(width, height) > maxDimension;
        const normalizedPipeline = needsResize
            ? pipeline.resize({
                width: maxDimension,
                height: maxDimension,
                fit: 'inside',
                withoutEnlargement: true,
            })
            : pipeline;

        // Preserve transparency only when the source actually carries it;
        // otherwise JPEG keeps the upload small.
        const hasAlpha = metadata.hasAlpha === true;
        if (hasAlpha && sourceMimeType === 'image/png') {
            return {
                buffer: await normalizedPipeline.png({ compressionLevel: 9, palette: true }).toBuffer(),
                mimeType: 'image/png',
            };
        }

        return {
            buffer: await normalizedPipeline.jpeg({ quality: REFERENCE_JPEG_QUALITY, mozjpeg: true }).toBuffer(),
            mimeType: 'image/jpeg',
        };
    } catch (error) {
        console.warn('[reference-image] skipping unusable reference', {
            sourceMimeType,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

/** Fetch + normalize in one step. Returns null when the bytes are unusable. */
export async function loadNormalizedReference(
    primaryUrl: string,
    fallbackUrl?: string,
    maxDimension: number = REFERENCE_MAX_DIMENSION,
): Promise<NormalizedReferenceImage | null> {
    const fetched = await fetchUsableReferenceImage(primaryUrl, fallbackUrl);
    return normalizeReferenceImage(fetched.buffer, fetched.mimeType, maxDimension);
}
