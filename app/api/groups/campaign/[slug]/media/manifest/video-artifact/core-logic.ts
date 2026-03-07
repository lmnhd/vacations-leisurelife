import { z } from 'zod';
import { CampaignMediaManifest } from '@/lib/campaigns/schema';
import {
    deactivateAssetRecord,
    getActiveAssetRecord,
    getMediaManifest,
    saveMediaManifest,
    updateCampaignMediaStatus,
} from '@/lib/campaigns/media/media-store';

const DeleteVideoArtifactRequestSchema = z.object({
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

function removeVideoAssetFromManifest(manifest: CampaignMediaManifest, assetId: string): { updatedManifest: CampaignMediaManifest; removed: boolean } {
    let removed = false;

    const tiktokSeed = manifest.videos.tiktokSeed?.assetId === assetId
        ? (removed = true, null)
        : manifest.videos.tiktokSeed;
    const heroExplainer = manifest.videos.heroExplainer?.assetId === assetId
        ? (removed = true, null)
        : manifest.videos.heroExplainer;
    const thresholdAnnouncement = manifest.videos.thresholdAnnouncement?.assetId === assetId
        ? (removed = true, null)
        : manifest.videos.thresholdAnnouncement;

    const countdown = manifest.videos.countdown.filter((record) => record.assetId !== assetId);
    if (countdown.length !== manifest.videos.countdown.length) {
        removed = true;
    }

    const broll = manifest.videos.broll.filter((record) => record.assetId !== assetId);
    if (broll.length !== manifest.videos.broll.length) {
        removed = true;
    }

    return {
        removed,
        updatedManifest: {
            ...manifest,
            generatedAt: new Date().toISOString(),
            totalAssets: 0,
            completionStatus: 'partial',
            videos: {
                ...manifest.videos,
                tiktokSeed,
                heroExplainer,
                thresholdAnnouncement,
                countdown,
                broll,
            },
        },
    };
}

export async function handleDeleteVideoArtifactRequest(slug: string, body: unknown): Promise<{ status: number; data: unknown; }> {
    const parsedBody = DeleteVideoArtifactRequestSchema.safeParse(body);
    if (!parsedBody.success) {
        return {
            status: 400,
            data: { error: 'Invalid request body', issues: parsedBody.error.issues },
        };
    }

    try {
        const existingAsset = await getActiveAssetRecord(slug, parsedBody.data.assetId);
        if (!existingAsset) {
            return {
                status: 404,
                data: { error: `Media asset not found: ${parsedBody.data.assetId}` },
            };
        }

        const existingManifest = await getMediaManifest(slug);
        if (!existingManifest) {
            return {
                status: 404,
                data: { error: `No media manifest found for campaign ${slug}` },
            };
        }

        const removalResult = removeVideoAssetFromManifest(existingManifest, parsedBody.data.assetId);
        if (!removalResult.removed) {
            return {
                status: 404,
                data: { error: `Asset ${parsedBody.data.assetId} is not attached to a video manifest slot` },
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
                manifest: finalizedManifest,
            },
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to delete video artifact';
        return {
            status: 500,
            data: { error: message },
        };
    }
}
