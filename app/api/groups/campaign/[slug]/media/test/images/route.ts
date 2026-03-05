import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { uploadAsset } from '@/lib/campaigns/media/r2-client';
import { saveAssetRecord } from '@/lib/campaigns/media/media-store';
import {
    generateHeroImages,
    generateAestheticConcepts,
} from '@/lib/campaigns/media/generators/stability-generator';
import { generatePlatformCrops } from '@/lib/campaigns/media/generators/sharp-processor';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/test/images
// Generate → upload to R2 → save AssetRecord to DynamoDB → return CDN URL.
//
// Body: {
//   generator: 'stability_hero' | 'stability_concepts' | 'sharp_crops'
//   shipName?: string           (stability_hero, defaults to 'Norwegian Gem')
//   sourceImageCdnUrl?: string  (sharp_crops: CDN URL of uploaded hero image)
// }
// ────────────────────────────────────────────────────────────────────────────

type ImageTestGenerator = 'stability_hero' | 'stability_concepts' | 'sharp_crops';

interface ImageTestRequestBody {
    generator: ImageTestGenerator;
    shipName?: string;
    sourceImageCdnUrl?: string;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    const body = await request.json() as ImageTestRequestBody;
    const { generator, shipName = 'Norwegian Gem', sourceImageCdnUrl } = body;

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
        if (generator === 'stability_hero') {
            const images = await generateHeroImages(brief, shipName, 1);
            const img = images[0];
            const cdnUrl = await uploadAsset(slug, img.fileName, img.buffer, 'image/webp');
            await saveAssetRecord(slug, {
                assetId: img.assetId,
                assetType: 'hero_image',
                url: cdnUrl,
                generator: 'stability_ai',
                promptUsed: img.prompt,
                fileSizeBytes: img.buffer.length,
                mimeType: 'image/webp',
                tags: ['hero', 'stability'],
                createdAt: new Date().toISOString(),
                reviewStatus: 'needs_review',
                version: 1,
                active: true,
            });
            return NextResponse.json({
                generator: 'stability_ai',
                assetId: img.assetId,
                fileName: img.fileName,
                promptUsed: img.prompt,
                fileSizeBytes: img.buffer.length,
                cdnUrl,
            });
        }

        if (generator === 'stability_concepts') {
            const images = await generateAestheticConcepts(brief, 1);
            const img = images[0];
            const cdnUrl = await uploadAsset(slug, img.fileName, img.buffer, 'image/webp');
            await saveAssetRecord(slug, {
                assetId: img.assetId,
                assetType: 'aesthetic_concept',
                url: cdnUrl,
                generator: 'stability_ai',
                promptUsed: img.prompt,
                fileSizeBytes: img.buffer.length,
                mimeType: 'image/webp',
                tags: ['concept', 'stability'],
                createdAt: new Date().toISOString(),
                reviewStatus: 'needs_review',
                version: 1,
                active: true,
            });
            return NextResponse.json({
                generator: 'stability_ai',
                assetId: img.assetId,
                fileName: img.fileName,
                promptUsed: img.prompt,
                fileSizeBytes: img.buffer.length,
                cdnUrl,
            });
        }

        if (generator === 'sharp_crops') {
            if (!sourceImageCdnUrl) {
                return NextResponse.json({
                    error: 'sourceImageCdnUrl required. Run stability_hero first and paste back the returned cdnUrl.'
                }, { status: 400 });
            }
            const sourceResponse = await fetch(sourceImageCdnUrl);
            if (!sourceResponse.ok) {
                return NextResponse.json({
                    error: `Failed to fetch source image from CDN (${sourceResponse.status}): ${sourceImageCdnUrl}`
                }, { status: 400 });
            }
            const sourceBuffer = Buffer.from(await sourceResponse.arrayBuffer());
            const crops = await generatePlatformCrops(sourceBuffer, 'hero_001');

            const uploadedCrops = await Promise.all(crops.map(async (crop) => {
                const cdnUrl = await uploadAsset(slug, crop.fileName, crop.buffer, 'image/webp');
                await saveAssetRecord(slug, {
                    assetId: crop.assetId,
                    assetType: 'platform_crop',
                    url: cdnUrl,
                    generator: 'sharp',
                    promptUsed: `${crop.format} ${crop.width}x${crop.height}`,
                    dimensions: { width: crop.width, height: crop.height },
                    fileSizeBytes: crop.buffer.length,
                    mimeType: 'image/webp',
                    tags: ['crop', crop.format],
                    createdAt: new Date().toISOString(),
                    reviewStatus: 'auto_approved',
                    version: 1,
                    active: true,
                });
                return { format: crop.format, width: crop.width, height: crop.height, fileSizeBytes: crop.buffer.length, cdnUrl };
            }));

            return NextResponse.json({ generator: 'sharp', cropCount: uploadedCrops.length, crops: uploadedCrops });
        }

        return NextResponse.json({ error: `Unknown generator: ${generator}` }, { status: 400 });

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
