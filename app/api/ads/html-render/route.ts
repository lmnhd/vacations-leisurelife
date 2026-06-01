import { NextRequest, NextResponse } from 'next/server';
import { generateHtmlAdArtifacts } from '@/lib/campaigns/media/generators/html-ad-generator';
import { HTML_SCREENSHOT_SUPPORTED_FORMATS } from '@/lib/ads/providers/html-screenshot';
import type { AdFormat } from '@/lib/ads/types';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/ads/html-render
//
// Triggers HTML screenshot rendering for a campaign. Screenshots each requested
// format via Playwright at /ads/render/[slug]/[format], uploads PNGs to R2,
// and writes AssetRecords as designed_ad_artifact to the campaign manifest.
//
// Body: { slug: string; formats?: AdFormat[] }
// ────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — Playwright + R2 uploads for 7 formats

export async function POST(request: NextRequest) {
    let body: { slug?: string; formats?: string[] };
    try {
        body = await request.json() as { slug?: string; formats?: string[] };
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { slug, formats: requestedFormats } = body;

    if (!slug || typeof slug !== 'string' || !slug.trim()) {
        return NextResponse.json({ error: 'slug is required' }, { status: 400 });
    }

    // Validate requested formats against the supported set
    const supported = new Set<string>(HTML_SCREENSHOT_SUPPORTED_FORMATS);
    const formats: AdFormat[] = requestedFormats
        ? requestedFormats.filter((f) => supported.has(f)) as AdFormat[]
        : [...HTML_SCREENSHOT_SUPPORTED_FORMATS];

    if (formats.length === 0) {
        return NextResponse.json(
            { error: 'No supported formats in request', supported: HTML_SCREENSHOT_SUPPORTED_FORMATS },
            { status: 400 },
        );
    }

    const progress: Array<{ format: AdFormat; index: number; total: number; startedAt: string }> = [];

    try {
        const result = await generateHtmlAdArtifacts({
            slug: slug.trim(),
            formats,
            onProgress: (format, index, total) => {
                progress.push({ format, index, total, startedAt: new Date().toISOString() });
            },
        });

        return NextResponse.json({
            slug: slug.trim(),
            requestedFormats: formats,
            renderedCount: result.designedAds.length,
            skippedFormats: result.skippedFormats,
            warnings: result.warnings,
            designedAds: result.designedAds.map((r) => ({
                assetId: r.assetId,
                url: r.url,
                format: r.tags.find((t) => t.startsWith('format:'))?.replace('format:', ''),
                dimensions: r.dimensions,
                fileSizeBytes: r.fileSizeBytes,
            })),
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message, progress }, { status: 500 });
    }
}
