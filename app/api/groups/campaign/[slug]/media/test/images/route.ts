import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getCampaignBlueprint, getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { assertAestheticBriefReadyForMedia } from '@/lib/campaigns/aesthetic-red-team';
import { saveAssetRecord, upsertManifestAssetSection } from '@/lib/campaigns/media/media-store';
import type { AssetRecord, ImageFormat } from '@/lib/campaigns/schema';
import { getMediaImageGeneratorService } from '@/lib/campaigns/media/media-pipeline-config';
import {
    generateAestheticConcepts,
    generateSceneImages,
} from '@/lib/campaigns/media/generators/stability-generator';
import { generatePlatformCrops } from '@/lib/campaigns/media/generators/sharp-processor';
import {
    discoverShipReferenceCandidates,
    importHeroAssetsFromReferences,
    importShipReferenceAssets,
} from '@/lib/campaigns/media/ship-reference-service';
import { uploadAsset } from '@/lib/campaigns/media/r2-client';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/test/images
// Generate → upload to R2 → save AssetRecord to DynamoDB → return CDN URL.
//
// Body: {
//   generator: 'ship_reference_search' | 'real_ship_hero' | 'stability_concepts' | 'sharp_crops'
//   sourceImageCdnUrl?: string  (sharp_crops: CDN URL of uploaded hero image)
// }
// ────────────────────────────────────────────────────────────────────────────

type ImageTestGenerator = 'ship_reference_search' | 'real_ship_hero' | 'stability_concepts' | 'scene_images' | 'sharp_crops';

interface ImageTestRequestBody {
    generator: ImageTestGenerator;
    sourceImageCdnUrl?: string;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    const body = await request.json() as ImageTestRequestBody;
    const { generator, sourceImageCdnUrl } = body;

    const brief = await getAestheticBrief(slug);
    const campaign = await getCampaignBlueprint(slug);
    if (!brief) {
        return NextResponse.json({ error: `No aesthetic brief found for ${slug}` }, { status: 404 });
    }
    if (!campaign) {
        return NextResponse.json({ error: `No campaign blueprint found for ${slug}` }, { status: 404 });
    }

    try {
        assertAestheticBriefReadyForMedia(brief, slug);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Brief failed release gate.';
        return NextResponse.json({ error: message }, { status: 400 });
    }

    try {
        if (generator === 'ship_reference_search') {
            const candidates = await discoverShipReferenceCandidates(campaign, 2);
            return NextResponse.json({
                generator: 'serpapi',
                shipName: campaign.matchedShipName ?? campaign.shipTarget ?? '',
                candidateCount: candidates.length,
                candidates,
            });
        }

        if (generator === 'real_ship_hero') {
            const candidates = await discoverShipReferenceCandidates(campaign, 2);
            if (candidates.length === 0) {
                return NextResponse.json({ error: `No usable ship reference images found for ${slug}` }, { status: 404 });
            }

            const referenceRecords = await importShipReferenceAssets(slug, campaign, candidates);
            const heroRecords = await importHeroAssetsFromReferences(slug, campaign, brief, candidates, 1);
            const heroRecord = heroRecords[0];
            await upsertManifestAssetSection(slug, 'shipReferences', referenceRecords);
            await upsertManifestAssetSection(slug, 'hero', heroRecords);
            return NextResponse.json({
                generator: heroRecord.generator,
                assetId: heroRecord.assetId,
                promptUsed: heroRecord.promptUsed,
                fileSizeBytes: heroRecord.fileSizeBytes,
                cdnUrl: heroRecord.url,
                sourcePageUrl: heroRecord.sourcePageUrl,
                referenceCount: referenceRecords.length,
            });
        }

        if (generator === 'stability_concepts') {
            const images = await generateAestheticConcepts(brief, 1);
            const img = images[0];
            const cdnUrl = await uploadAsset(slug, img.fileName, img.buffer, 'image/png');
            const record: AssetRecord = {
                assetId: img.assetId,
                assetType: 'aesthetic_concept',
                url: cdnUrl,
                generator: getMediaImageGeneratorService(),
                promptUsed: img.prompt,
                fileSizeBytes: img.buffer.length,
                mimeType: 'image/png',
                tags: ['concept', 'nano-banana'],
                createdAt: new Date().toISOString(),
                reviewStatus: 'needs_review',
                version: 1,
                active: true,
            };
            await saveAssetRecord(slug, record);
            await upsertManifestAssetSection(slug, 'aestheticConcepts', [record]);
            return NextResponse.json({
                generator: getMediaImageGeneratorService(),
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
                    error: 'sourceImageCdnUrl required. Run real_ship_hero first and paste back the returned cdnUrl.'
                }, { status: 400 });
            }
            const sourceResponse = await fetch(sourceImageCdnUrl);
            if (!sourceResponse.ok) {
                return NextResponse.json({
                    error: `Failed to fetch source image from CDN (${sourceResponse.status}): ${sourceImageCdnUrl}`
                }, { status: 400 });
            }
            const sourceBuffer = Buffer.from(await sourceResponse.arrayBuffer());
            const sourceHash = createHash('sha1').update(sourceImageCdnUrl).digest('hex').slice(0, 10);
            const cropSourceId = `hero_${sourceHash}_${Date.now()}`;
            const crops = await generatePlatformCrops(sourceBuffer, cropSourceId);

            const uploadedCrops = await Promise.all(crops.map(async (crop) => {
                const cdnUrl = await uploadAsset(slug, crop.fileName, crop.buffer, 'image/webp');
                const record: AssetRecord = {
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
                };
                await saveAssetRecord(slug, record);
                return { format: crop.format, width: crop.width, height: crop.height, fileSizeBytes: crop.buffer.length, cdnUrl, record };
            }));

            const cropsByFormat = uploadedCrops.reduce((currentGroups, crop) => {
                const nextGroups = { ...currentGroups };
                const currentFormatRecords = nextGroups[crop.format] ?? [];
                nextGroups[crop.format] = [...currentFormatRecords, crop.record];
                return nextGroups;
            }, {} as Record<ImageFormat, AssetRecord[]>);
            await upsertManifestAssetSection(slug, 'platformCrops', cropsByFormat);

            return NextResponse.json({
                generator: 'sharp',
                cropCount: uploadedCrops.length,
                crops: uploadedCrops.map(({ record: _record, ...crop }) => crop),
            });
        }

        if (generator === 'scene_images') {
            if (!brief.productionBible) {
                return NextResponse.json({
                    error: 'No Production Bible found on this brief. Regenerate the aesthetic brief first.'
                }, { status: 400 });
            }
            const candidates = await discoverShipReferenceCandidates(campaign, 2);
            const shipName = campaign.matchedShipName ?? campaign.shipTarget ?? 'TBD';
            const generatedImages = await generateSceneImages(
                brief.productionBible.sceneLibrary,
                candidates,
                shipName
            );
            const records: AssetRecord[] = [];
            for (const img of generatedImages) {
                const cdnUrl = await uploadAsset(slug, img.fileName, img.buffer, 'image/png');
                const record: AssetRecord = {
                    assetId: img.assetId,
                    assetType: 'scene_image',
                    url: cdnUrl,
                    generator: getMediaImageGeneratorService(),
                    promptUsed: img.prompt,
                    fileSizeBytes: img.buffer.length,
                    mimeType: 'image/png',
                    tags: ['scene', img.sceneId],
                    createdAt: new Date().toISOString(),
                    reviewStatus: 'needs_review',
                    version: 1,
                    active: true,
                };
                await saveAssetRecord(slug, record);
                records.push(record);
            }
            await upsertManifestAssetSection(slug, 'sceneImages', records);
            return NextResponse.json({
                generator: getMediaImageGeneratorService(),
                count: records.length,
                scenes: records.map(r => ({
                    sceneId: r.tags[1] ?? r.assetId,
                    assetId: r.assetId,
                    url: r.url,
                    fileSizeBytes: r.fileSizeBytes,
                })),
            });
        }

        return NextResponse.json({ error: `Unknown generator: ${generator}` }, { status: 400 });

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
