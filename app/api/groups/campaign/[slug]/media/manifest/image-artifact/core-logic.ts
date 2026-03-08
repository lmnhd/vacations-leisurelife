import { z } from 'zod';
import { CampaignMediaManifest } from '@/lib/campaigns/schema';
import {
    deactivateAssetRecord,
    getActiveAssetRecord,
    getMediaManifest,
    saveMediaManifest,
    updateCampaignMediaStatus,
} from '@/lib/campaigns/media/media-store';

// ────────────────────────────────────────────────────────────────────────────
// Delete Image Artifact — Core Logic
// Removes a hero_image, aesthetic_concept, platform_crop, or ship_reference
// from the manifest and deactivates its DynamoDB asset record.
// ────────────────────────────────────────────────────────────────────────────

const DeleteImageArtifactRequestSchema = z.object({
    assetId: z.string().min(1),
});

function calculateManifestAssetTotal(manifest: CampaignMediaManifest): number {
    return [
        ...manifest.images.shipReferences,
        ...manifest.images.hero,
        ...manifest.images.sceneImages,
        ...manifest.images.aestheticConcepts,
        ...Object.values(manifest.images.platformCrops).flat(),
        ...(manifest.videos.tiktokSeed ? [manifest.videos.tiktokSeed] : []),
        ...(manifest.videos.heroExplainer ? [manifest.videos.heroExplainer] : []),
        ...(manifest.videos.thresholdAnnouncement ? [manifest.videos.thresholdAnnouncement] : []),
        ...manifest.videos.countdown,
        ...manifest.videos.broll,
        ...(manifest.audio.ambientNarration ? [manifest.audio.ambientNarration] : []),
        ...(manifest.audio.hypeClip ? [manifest.audio.hypeClip] : []),
        ...(manifest.audio.themeMusic ? [manifest.audio.themeMusic] : []),
        ...manifest.merch.designs,
        ...manifest.merch.mockups,
    ].length;
}

function removeImageAssetFromManifest(
    manifest: CampaignMediaManifest,
    assetId: string
): { updatedManifest: CampaignMediaManifest; removed: boolean; slot: string } {
    // hero
    const hero = manifest.images.hero.filter(r => r.assetId !== assetId);
    if (hero.length !== manifest.images.hero.length) {
        return {
            removed: true,
            slot: 'hero',
            updatedManifest: {
                ...manifest,
                generatedAt: new Date().toISOString(),
                totalAssets: 0,
                completionStatus: 'partial',
                images: { ...manifest.images, hero },
            },
        };
    }

    // aestheticConcepts
    const aestheticConcepts = manifest.images.aestheticConcepts.filter(r => r.assetId !== assetId);
    if (aestheticConcepts.length !== manifest.images.aestheticConcepts.length) {
        return {
            removed: true,
            slot: 'aestheticConcepts',
            updatedManifest: {
                ...manifest,
                generatedAt: new Date().toISOString(),
                totalAssets: 0,
                completionStatus: 'partial',
                images: { ...manifest.images, aestheticConcepts },
            },
        };
    }

    // shipReferences
    const shipReferences = manifest.images.shipReferences.filter(r => r.assetId !== assetId);
    if (shipReferences.length !== manifest.images.shipReferences.length) {
        return {
            removed: true,
            slot: 'shipReferences',
            updatedManifest: {
                ...manifest,
                generatedAt: new Date().toISOString(),
                totalAssets: 0,
                completionStatus: 'partial',
                images: { ...manifest.images, shipReferences },
            },
        };
    }

    // platformCrops — search across all format buckets
    const updatedCrops = { ...manifest.images.platformCrops };
    for (const format of Object.keys(updatedCrops) as Array<keyof typeof updatedCrops>) {
        const before = updatedCrops[format];
        if (!before) continue;
        const after = before.filter(r => r.assetId !== assetId);
        if (after.length !== before.length) {
            updatedCrops[format] = after;
            return {
                removed: true,
                slot: `platformCrops.${format}`,
                updatedManifest: {
                    ...manifest,
                    generatedAt: new Date().toISOString(),
                    totalAssets: 0,
                    completionStatus: 'partial',
                    images: { ...manifest.images, platformCrops: updatedCrops },
                },
            };
        }
    }

    return { removed: false, slot: '', updatedManifest: manifest };
}

export async function handleDeleteImageArtifactRequest(
    slug: string,
    body: unknown
): Promise<{ status: number; data: unknown }> {
    const parsedBody = DeleteImageArtifactRequestSchema.safeParse(body);
    if (!parsedBody.success) {
        return {
            status: 400,
            data: { error: 'Invalid request body', issues: parsedBody.error.issues },
        };
    }

    try {
        const existingAsset = await getActiveAssetRecord(slug, parsedBody.data.assetId);
        if (!existingAsset) {
            return { status: 404, data: { error: `Media asset not found: ${parsedBody.data.assetId}` } };
        }

        const existingManifest = await getMediaManifest(slug);
        if (!existingManifest) {
            return { status: 404, data: { error: `No media manifest found for campaign ${slug}` } };
        }

        const removalResult = removeImageAssetFromManifest(existingManifest, parsedBody.data.assetId);
        if (!removalResult.removed) {
            return {
                status: 404,
                data: { error: `Asset ${parsedBody.data.assetId} is not attached to any image manifest slot` },
            };
        }

        const finalizedManifest: CampaignMediaManifest = {
            ...removalResult.updatedManifest,
            totalAssets: calculateManifestAssetTotal(removalResult.updatedManifest),
        };

        await deactivateAssetRecord(slug, parsedBody.data.assetId);
        await saveMediaManifest(finalizedManifest);
        await updateCampaignMediaStatus(slug, 'partial');

        return {
            status: 200,
            data: {
                assetId: parsedBody.data.assetId,
                removedFromSlot: removalResult.slot,
                manifest: finalizedManifest,
            },
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to delete image artifact';
        return { status: 500, data: { error: message } };
    }
}
