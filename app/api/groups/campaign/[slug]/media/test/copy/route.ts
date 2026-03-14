import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { assertAestheticBriefReadyForMedia } from '@/lib/campaigns/aesthetic-red-team';
import { uploadAsset } from '@/lib/campaigns/media/r2-client';
import { saveAssetRecord, upsertManifestCopy } from '@/lib/campaigns/media/media-store';
import { generatePlatformCopy } from '@/lib/campaigns/media/generators/copy-generator';
import { MEDIA_LLM_CONFIG, modelNameToGeneratorService } from '@/lib/campaigns/media/media-pipeline-config';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/test/copy
// Model: MEDIA_LLM_CONFIG.platformCopy (currently CLAUDE_4_OPUS via creative task)
// Generate copy → upload JSON to R2 → save AssetRecord → return CDN URL + copy.
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

    try {
        assertAestheticBriefReadyForMedia(brief, slug);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Brief failed release gate.';
        return NextResponse.json({ error: message }, { status: 400 });
    }

    const activeModel = MEDIA_LLM_CONFIG.platformCopy;
    const generatorService = modelNameToGeneratorService(activeModel);

    try {
        const copy = await generatePlatformCopy(brief);
        const copyJson = JSON.stringify(copy, null, 2);
        const copyBuffer = Buffer.from(copyJson, 'utf-8');
        const assetId = `copy_platform_${randomUUID().slice(0, 8)}`;
        const fileName = `copy/platform_copy_batch.json`;

        const cdnUrl = await uploadAsset(slug, fileName, copyBuffer, 'application/json');
        await saveAssetRecord(slug, {
            assetId,
            assetType: 'copy_batch',
            url: cdnUrl,
            generator: generatorService,
            promptUsed: `Platform copy batch for ${brief.themeName}`,
            fileSizeBytes: copyBuffer.length,
            mimeType: 'application/json',
            tags: ['copy', 'platform-batch'],
            createdAt: new Date().toISOString(),
            reviewStatus: 'needs_review',
            version: 1,
            active: true,
        });
        await upsertManifestCopy(slug, copy);

        return NextResponse.json({
            generator: generatorService,
            model: activeModel,
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
