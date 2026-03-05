import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { uploadAsset } from '@/lib/campaigns/media/r2-client';
import { saveAssetRecord } from '@/lib/campaigns/media/media-store';
import { generatePlatformCopy } from '@/lib/campaigns/media/generators/copy-generator';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/test/copy
// Generate copy via GPT-4o → upload JSON to R2 → save AssetRecord → return.
// ────────────────────────────────────────────────────────────────────────────

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;

    const brief = await getAestheticBrief(slug);
    if (!brief) {
        return NextResponse.json({ error: `No aesthetic brief found for ${slug}` }, { status: 404 });
    }
    if (brief.humanReviewStatus !== 'approved') {
        return NextResponse.json({
            error: `Brief not approved (status: ${brief.humanReviewStatus}). Approve it first.`
        }, { status: 400 });
    }

    try {
        const copy = await generatePlatformCopy(brief);
        const copyJson = JSON.stringify(copy, null, 2);
        const copyBuffer = Buffer.from(copyJson, 'utf-8');
        const assetId = `copy_platform_${randomUUID().slice(0, 8)}`;
        const fileName = `copy/platform_copy_batch.json`;

        const cdnUrl = await uploadAsset(slug, fileName, copyBuffer, 'application/json');
        await saveAssetRecord(slug, {
            assetId,
            assetType: 'ad_creative',
            url: cdnUrl,
            generator: 'gpt4o',
            promptUsed: `Platform copy batch for ${brief.themeName}`,
            fileSizeBytes: copyBuffer.length,
            mimeType: 'application/json',
            tags: ['copy', 'platform-batch'],
            createdAt: new Date().toISOString(),
            reviewStatus: 'needs_review',
            version: 1,
            active: true,
        });

        return NextResponse.json({
            generator: 'gpt4o',
            campaignSlug: slug,
            themeName: brief.themeName,
            assetId,
            fileSizeBytes: copyBuffer.length,
            cdnUrl,
            copy,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
