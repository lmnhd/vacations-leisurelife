import { z } from 'zod';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import {
    getActiveAssetRecord,
    getMediaManifest,
    saveMediaManifest,
    saveAssetRecord,
    deactivateAssetRecord,
    updateCampaignMediaStatus,
} from '@/lib/campaigns/media/media-store';
import { storeAsset } from '@/lib/campaigns/media/storage-client';
import { generateImageFromPrompt } from '@/lib/campaigns/media/generators/stability-generator';
import { generateStoryboardVideo } from '@/lib/campaigns/media/generators/tiktok-seed-generator';
import { AssetRecord, AssetType, CampaignMediaManifest } from '@/lib/campaigns/schema';
import {
    getMediaImageGeneratorService,
    getActiveVideoGeneratorService,
} from '@/lib/campaigns/media/media-pipeline-config';
import { randomUUID } from 'crypto';

// ────────────────────────────────────────────────────────────────────────────
// Regenerate With Revision — Core Logic
// Revises the upstream prompt for an existing asset, regenerates it, and
// replaces the manifest slot.  Supports both scene images and storyboard videos.
// ────────────────────────────────────────────────────────────────────────────

const VIDEO_ASSET_TYPES = new Set<AssetType>([
    'tiktok_seed_video', 'hero_explainer_video', 'threshold_video',
    'countdown_video', 'broll_clip',
]);

const KNOWN_VIDEO_TAGS = new Set(['video', 'storyboard', 'narrated', 'revised']);

const RegenerateWithRevisionSchema = z.object({
    assetId: z.string().min(1),
    applyMode: z.enum(['append_note', 'manual_override']),
    revisionNote: z.string().optional(),
    revisedPrompt: z.string().optional(),
});

function buildRevisedSceneImagePrompt(
    existingPrompt: string,
    applyMode: 'append_note' | 'manual_override',
    revisionNote: string | undefined,
    revisedPrompt: string | undefined
): string {
    if (applyMode === 'manual_override' && revisedPrompt) return revisedPrompt;
    if (applyMode === 'append_note' && revisionNote) return `${existingPrompt}. REVISION: ${revisionNote}`;
    return existingPrompt;
}

function replaceSlotInManifest(
    manifest: CampaignMediaManifest,
    oldAssetId: string,
    newRecord: AssetRecord,
    assetType: AssetType
): CampaignMediaManifest {
    if (assetType === 'scene_image') {
        const sceneImages = [
            ...manifest.images.sceneImages.filter(r => r.assetId !== oldAssetId),
            newRecord,
        ];
        return { ...manifest, images: { ...manifest.images, sceneImages } };
    }
    if (assetType === 'tiktok_seed_video') {
        return { ...manifest, videos: { ...manifest.videos, tiktokSeed: newRecord } };
    }
    if (assetType === 'hero_explainer_video') {
        return { ...manifest, videos: { ...manifest.videos, heroExplainer: newRecord } };
    }
    if (assetType === 'threshold_video') {
        return { ...manifest, videos: { ...manifest.videos, thresholdAnnouncement: newRecord } };
    }
    if (assetType === 'countdown_video') {
        const countdown = [
            ...manifest.videos.countdown.filter(r => r.assetId !== oldAssetId),
            newRecord,
        ];
        return { ...manifest, videos: { ...manifest.videos, countdown } };
    }
    if (assetType === 'broll_clip') {
        const broll = [
            ...manifest.videos.broll.filter(r => r.assetId !== oldAssetId),
            newRecord,
        ];
        return { ...manifest, videos: { ...manifest.videos, broll } };
    }
    return manifest;
}

function countManifestAssets(manifest: CampaignMediaManifest): number {
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

export async function handleRegenerateWithRevisionRequest(
    slug: string,
    body: unknown
): Promise<{ status: number; data: unknown }> {
    const parsed = RegenerateWithRevisionSchema.safeParse(body);
    if (!parsed.success) {
        return { status: 400, data: { error: 'Invalid request body', issues: parsed.error.issues } };
    }

    const { assetId, applyMode, revisionNote, revisedPrompt } = parsed.data;

    try {
        const [existingAsset, manifest, brief] = await Promise.all([
            getActiveAssetRecord(slug, assetId),
            getMediaManifest(slug),
            getAestheticBrief(slug),
        ]);

        if (!existingAsset) {
            return { status: 404, data: { error: `Asset not found: ${assetId}` } };
        }
        if (!manifest) {
            return { status: 404, data: { error: `No manifest found for campaign: ${slug}` } };
        }
        if (!brief) {
            return { status: 404, data: { error: `No brief found for campaign: ${slug}` } };
        }

        const { assetType } = existingAsset;
        const shortId = randomUUID().slice(0, 8);
        const imageService = getMediaImageGeneratorService();
        const videoService = getActiveVideoGeneratorService();

        let newRecord: AssetRecord;

        if (assetType === 'scene_image') {
            const newPrompt = buildRevisedSceneImagePrompt(
                existingAsset.promptUsed,
                applyMode,
                revisionNote,
                revisedPrompt
            );
            const imageBuffer = await generateImageFromPrompt(newPrompt);
            const newAssetId = `img_scene_rev_${shortId}`;
            const url = await storeAsset(slug, newAssetId, `images/scenes/revised_${shortId}.png`, imageBuffer, 'image/png');
            newRecord = {
                assetId: newAssetId,
                assetType: 'scene_image',
                url,
                generator: imageService,
                promptUsed: newPrompt,
                fileSizeBytes: imageBuffer.length,
                mimeType: 'image/png',
                tags: [...existingAsset.tags, 'revised'],
                createdAt: new Date().toISOString(),
                reviewStatus: 'auto_approved',
                version: (existingAsset.version ?? 1) + 1,
                active: true,
                dimensions: { width: 1920, height: 1080 },
            };
            await saveAssetRecord(slug, newRecord);

        } else if (VIDEO_ASSET_TYPES.has(assetType)) {
            if (!brief.productionBible) {
                return { status: 422, data: { error: 'No Production Bible found — cannot regenerate storyboard video' } };
            }

            const delivId = existingAsset.tags.find(t => !KNOWN_VIDEO_TAGS.has(t));
            if (!delivId) {
                return { status: 422, data: { error: `Cannot determine storyboard deliverableId from tags: [${existingAsset.tags.join(', ')}]` } };
            }

            const storyboard = brief.productionBible.storyboards.find(sb => sb.deliverableId === delivId);
            if (!storyboard) {
                return { status: 422, data: { error: `Storyboard not found for deliverableId: ${delivId}` } };
            }

            const sceneImageMap = new Map<string, string>();
            for (const rec of manifest.images.sceneImages) {
                const sceneIdTag = rec.tags.find(t => t !== 'scene' && t !== 'revised');
                if (sceneIdTag) sceneImageMap.set(sceneIdTag, rec.url);
            }
            const fallbackUrl = manifest.images.hero[0]?.url ?? manifest.images.shipReferences[0]?.url ?? '';

            const resolvedRevisionNote = applyMode === 'append_note' ? revisionNote : undefined;
            const resolvedMotionOverride = applyMode === 'manual_override' ? (revisedPrompt ?? undefined) : undefined;

            const video = await generateStoryboardVideo(
                brief,
                storyboard,
                sceneImageMap,
                fallbackUrl,
                resolvedRevisionNote,
                resolvedMotionOverride
            );

            const newAssetId = `vid_${delivId}_rev_${shortId}`;
            const url = await storeAsset(slug, newAssetId, `video/${delivId}_revised_${shortId}.mp4`, video.buffer, 'video/mp4');
            newRecord = {
                assetId: newAssetId,
                assetType,
                url,
                generator: videoService,
                promptUsed: `${video.motionPrompt}\n\n${video.script}`,
                fileSizeBytes: video.buffer.length,
                mimeType: 'video/mp4',
                tags: [...existingAsset.tags, 'revised'],
                createdAt: new Date().toISOString(),
                reviewStatus: 'auto_approved',
                version: (existingAsset.version ?? 1) + 1,
                active: true,
                durationSeconds: video.durationSeconds,
            };
            await saveAssetRecord(slug, newRecord);

        } else {
            return { status: 422, data: { error: `Asset type '${assetType}' does not support prompt-revision regeneration` } };
        }

        await deactivateAssetRecord(slug, assetId);

        const updatedManifest = replaceSlotInManifest(manifest, assetId, newRecord, assetType);
        const finalManifest: CampaignMediaManifest = {
            ...updatedManifest,
            generatedAt: new Date().toISOString(),
            totalAssets: countManifestAssets(updatedManifest),
        };
        await saveMediaManifest(finalManifest);
        await updateCampaignMediaStatus(slug, 'partial');

        return {
            status: 200,
            data: {
                oldAssetId: assetId,
                newAssetId: newRecord.assetId,
                applyMode,
                manifest: finalManifest,
            },
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Regeneration failed';
        return { status: 500, data: { error: message } };
    }
}
