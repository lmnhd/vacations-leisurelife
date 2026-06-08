import { z } from 'zod';
import { generateStructuredObject, ModelName } from '@/lib/ai/llm-gateway';
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
import { generateImageFromPrompt, generateNanoBananaImage } from '@/lib/campaigns/media/generators/stability-generator';
import { getActiveImageBackends } from '@/lib/campaigns/media/generators/image-backends';
import { generateGptImage2 } from '@/lib/campaigns/media/generators/gpt-image';
import { generateAmbientNarration, generateHypeClip } from '@/lib/campaigns/media/generators/elevenlabs-generator';
import { generateStoryboardVideo } from '@/lib/campaigns/media/generators/tiktok-seed-generator';
import { buildElevenLabsVoiceTags, isElevenLabsVoiceTag } from '@/lib/campaigns/media/elevenlabs-voices';
import { selectPreferredAssetForContext, collapseAssetVariantGroups } from '@/lib/campaigns/media/image-selection';
import { AssetRecord, AssetType, CampaignMediaManifest, GeneratorService } from '@/lib/campaigns/schema';
import {
    NANO_BANANA_CONFIG,
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

const AUDIO_ASSET_TYPES = new Set<AssetType>(['ambient_narration', 'hype_clip']);

const KNOWN_VIDEO_TAGS = new Set(['video', 'storyboard', 'narrated', 'revised']);
const PROMPT_REWRITE_MODEL = ModelName.GPT_5_INSTANT;
const PROMPT_REWRITE_SYSTEM_PROMPT = [
    'You are a prompt-composition editor for campaign media regeneration.',
    'Rewrite the original prompt and revision note into one coherent, non-contradictory generation prompt.',
    'Do not add new requirements beyond the original prompt and revision note.',
    'Return valid JSON only.',
].join(' ');

const RegenerateWithRevisionSchema = z.object({
    assetId: z.string().min(1),
    applyMode: z.enum(['append_note', 'manual_override']),
    revisionNote: z.string().optional(),
    steeringMessage: z.string().optional(),
    revisedPrompt: z.string().optional(),
});

const PromptRewriteSchema = z.object({
    rewrittenPrompt: z.string().min(1),
});

export function deterministicPromptComposition(
    existingText: string,
    revisionNote: string,
    artifactKind: 'image_prompt' | 'audio_script',
): string {
    if (artifactKind === 'audio_script') {
        return [
            'Rewrite this narration as one coherent finished script.',
            `Original script: ${existingText}`,
            `Required revision: ${revisionNote}`,
            'Apply the revision cleanly and remove any contradictory older direction.',
        ].join('\n');
    }

    return [
        'Create one coherent image-generation prompt from the original direction and required revision.',
        `Original direction: ${existingText}`,
        `Required revision: ${revisionNote}`,
        'Resolve contradictions in favor of the required revision. Keep the result concise, visual, and directly usable by the image model.',
    ].join(' ');
}

export async function composeRegenerationPrompt(
    existingText: string,
    revisionNote: string,
    artifactKind: 'image_prompt' | 'audio_script' = 'image_prompt',
): Promise<string> {
    const cleanExisting = existingText.trim();
    const cleanRevision = revisionNote.trim();
    if (!cleanRevision) return cleanExisting;

    const fallback = deterministicPromptComposition(cleanExisting, cleanRevision, artifactKind);
    try {
        const prompt = JSON.stringify({
            task: 'compose_regeneration_prompt',
            artifactKind,
            original: cleanExisting,
            revision: cleanRevision,
            outputRequirements: [
                'Return a single rewrittenPrompt string.',
                'Do not include labels such as ORIGINAL, REVISION, append_note, or override.',
                'Remove redundant or contradictory clauses.',
                'Preserve campaign, ship, subject, composition, and realism constraints unless the revision explicitly changes them.',
                artifactKind === 'image_prompt'
                    ? 'Keep it as one image-generation prompt under 1800 words.'
                    : 'Keep it as one finished script or direction under 1200 words.',
            ],
        });
        const result = await generateStructuredObject({
            model: PROMPT_REWRITE_MODEL,
            schema: PromptRewriteSchema,
            system: PROMPT_REWRITE_SYSTEM_PROMPT,
            prompt,
            timeoutMs: 30_000,
            strictJsonSchema: true,
        });
        return result.object.rewrittenPrompt.trim() || fallback;
    } catch (error) {
        console.warn('[regenerate-with-revision] prompt rewrite failed; using deterministic composition', {
            error: error instanceof Error ? error.message : String(error),
        });
        return fallback;
    }
}

async function buildRevisedSceneImagePrompt(
    existingPrompt: string,
    applyMode: 'append_note' | 'manual_override',
    revisionNote: string | undefined,
    revisedPrompt: string | undefined
): Promise<string> {
    if (applyMode === 'manual_override' && revisedPrompt) return revisedPrompt;
    if (applyMode === 'append_note' && revisionNote) {
        return composeRegenerationPrompt(existingPrompt, revisionNote, 'image_prompt');
    }
    return existingPrompt;
}

async function buildRevisedAudioScript(
    existingScript: string,
    applyMode: 'append_note' | 'manual_override',
    revisionNote: string | undefined,
    revisedPrompt: string | undefined
): Promise<string> {
    if (applyMode === 'manual_override' && revisedPrompt?.trim()) return revisedPrompt.trim();
    if (applyMode === 'append_note' && revisionNote?.trim()) {
        return composeRegenerationPrompt(existingScript, revisionNote, 'audio_script');
    }
    return existingScript;
}

function stripVoiceTags(tags: string[]): string[] {
    return tags.filter((tag) => !isElevenLabsVoiceTag(tag));
}

function buildRevisedTags(existingTags: string[], additions: string[]): string[] {
    return Array.from(new Set([...stripVoiceTags(existingTags), ...additions]));
}

async function downloadAssetBuffer(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download asset: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
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
    if (assetType === 'hero_image') {
        const hero = [
            ...manifest.images.hero.filter(r => r.assetId !== oldAssetId),
            newRecord,
        ];
        return { ...manifest, images: { ...manifest.images, hero } };
    }
    if (assetType === 'flyer_image') {
        const flyerImages = [
            ...(manifest.images.flyerImages ?? []).filter(r => r.assetId !== oldAssetId),
            newRecord,
        ];
        return { ...manifest, images: { ...manifest.images, flyerImages } };
    }
    if (assetType === 'aesthetic_concept') {
        const aestheticConcepts = [
            ...manifest.images.aestheticConcepts.filter(r => r.assetId !== oldAssetId),
            newRecord,
        ];
        return { ...manifest, images: { ...manifest.images, aestheticConcepts } };
    }
    if (assetType === 'documentary_detail_image') {
        const documentaryDetails = [
            ...(manifest.images.documentaryDetails ?? []).filter(r => r.assetId !== oldAssetId),
            newRecord,
        ];
        return { ...manifest, images: { ...manifest.images, documentaryDetails } };
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
    if (assetType === 'ambient_narration') {
        return { ...manifest, audio: { ...manifest.audio, ambientNarration: newRecord } };
    }
    if (assetType === 'hype_clip') {
        return { ...manifest, audio: { ...manifest.audio, hypeClip: newRecord } };
    }
    return manifest;
}

// MULTI_MODEL_IMAGES (Phase F): replace EVERY member of an image asset's variant
// group with a fresh set of model-versions. Removes all assets in `oldGroupAssetIds`
// from the section and appends `newRecords`. Image sections only (the multi-model
// revision path never touches video/audio). Falls back to identity for unknown types.
function replaceVariantGroupInManifest(
    manifest: CampaignMediaManifest,
    oldGroupAssetIds: ReadonlySet<string>,
    newRecords: readonly AssetRecord[],
    assetType: AssetType,
): CampaignMediaManifest {
    const swap = (existing: AssetRecord[] = []) => [
        ...existing.filter((r) => !oldGroupAssetIds.has(r.assetId)),
        ...newRecords,
    ];
    switch (assetType) {
        case 'scene_image':
            return { ...manifest, images: { ...manifest.images, sceneImages: swap(manifest.images.sceneImages) } };
        case 'hero_image':
            return { ...manifest, images: { ...manifest.images, hero: swap(manifest.images.hero) } };
        case 'flyer_image':
            return { ...manifest, images: { ...manifest.images, flyerImages: swap(manifest.images.flyerImages) } };
        case 'aesthetic_concept':
            return { ...manifest, images: { ...manifest.images, aestheticConcepts: swap(manifest.images.aestheticConcepts) } };
        case 'documentary_detail_image':
            return { ...manifest, images: { ...manifest.images, documentaryDetails: swap(manifest.images.documentaryDetails) } };
        default:
            return manifest;
    }
}

// MULTI_MODEL_IMAGES (Phase F): the active records for one image section, used to
// enumerate every member of an existing variant group before replacing it.
function getSectionAssets(manifest: CampaignMediaManifest, assetType: AssetType): AssetRecord[] {
    switch (assetType) {
        case 'scene_image': return manifest.images.sceneImages ?? [];
        case 'hero_image': return manifest.images.hero ?? [];
        case 'flyer_image': return manifest.images.flyerImages ?? [];
        case 'aesthetic_concept': return manifest.images.aestheticConcepts ?? [];
        case 'documentary_detail_image': return manifest.images.documentaryDetails ?? [];
        default: return [];
    }
}

// Deactivate every asset id in the old group. The triggering asset is always
// included; sibling model-versions are deactivated too so a stale variant can't
// linger in the pool after its group is regenerated.
async function deactivateGroup(
    slug: string,
    groupAssetIds: ReadonlySet<string>,
    triggeringAssetId: string,
): Promise<void> {
    const ids = new Set(groupAssetIds);
    ids.add(triggeringAssetId);
    for (const id of ids) {
        await deactivateAssetRecord(slug, id);
    }
}

function retargetManifestAssetReferences(
    manifest: CampaignMediaManifest,
    oldAssetId: string,
    newAssetId: string,
): CampaignMediaManifest {
    const imageSelections = Object.fromEntries(
        Object.entries(manifest.imageSelections ?? {}).map(([key, selectedAssetId]) => [
            key,
            selectedAssetId === oldAssetId ? newAssetId : selectedAssetId,
        ]),
    );
    const retargetId = (assetId: string) => assetId === oldAssetId ? newAssetId : assetId;
    const landingGallery = manifest.landingImageSets?.gallery?.map(retargetId);
    const landingTrust = manifest.landingImageSets?.trust?.map(retargetId);
    const landingPlacements = manifest.landingImageSets?.placements
        ? Object.fromEntries(
            Object.entries(manifest.landingImageSets.placements).map(([key, value]) => [
                key,
                Array.isArray(value) ? value.map(retargetId) : retargetId(value),
            ]),
        )
        : undefined;

    return {
        ...manifest,
        imageSelections,
        landingImageSets: manifest.landingImageSets
            ? {
                ...manifest.landingImageSets,
                ...(landingGallery ? { gallery: landingGallery } : {}),
                ...(landingTrust ? { trust: landingTrust } : {}),
                ...(landingPlacements ? { placements: landingPlacements } : {}),
            }
            : manifest.landingImageSets,
    };
}

function buildRegeneratedCuration(existingAsset: AssetRecord): AssetRecord['curation'] {
    if (!existingAsset.curation) return undefined;
    return {
        ...existingAsset.curation,
        approvalState: 'pending_review',
        generationLocked: false,
        curatorNotes: existingAsset.curation.curatorNotes
            ? `${existingAsset.curation.curatorNotes}\n\nRegenerated from ${existingAsset.assetId}; review the new version before downstream use.`
            : `Regenerated from ${existingAsset.assetId}; review the new version before downstream use.`,
        updatedAt: new Date().toISOString(),
    };
}

function countManifestAssets(manifest: CampaignMediaManifest): number {
    return [
        ...manifest.images.shipReferences,
        ...manifest.images.hero,
        ...(manifest.images.flyerImages ?? []),
        ...manifest.images.sceneImages,
        ...manifest.images.aestheticConcepts,
        ...(manifest.images.documentaryDetails ?? []),
        ...(manifest.images.alternateArt ?? []),
        ...(manifest.images.designedAdArtifacts ?? []),
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

    const { assetId, applyMode, revisedPrompt } = parsed.data;
    const revisionNote = parsed.data.revisionNote ?? parsed.data.steeringMessage;

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
        const videoService = getActiveVideoGeneratorService();

        let newRecord: AssetRecord;

        if (assetType === 'scene_image'
            || assetType === 'hero_image'
            || assetType === 'flyer_image'
            || assetType === 'aesthetic_concept'
            || assetType === 'documentary_detail_image'
        ) {
            const newPrompt = await buildRevisedSceneImagePrompt(
                existingAsset.promptUsed,
                applyMode,
                revisionNote,
                revisedPrompt
            );
            const typePrefix = assetType === 'hero_image'
                ? 'hero'
                : assetType === 'aesthetic_concept'
                    ? 'concept'
                    : assetType === 'documentary_detail_image'
                        ? 'detail'
                        : assetType === 'flyer_image'
                            ? 'flyer'
                            : 'scene';
            const dimensions = assetType === 'flyer_image'
                ? { width: 2048, height: 2048 }
                : { width: 1920, height: 1080 };

            // MULTI_MODEL_IMAGES (Phase F): a revision now respects the campaign's
            // active image models. Flyers use their own flyerControls.models; every
            // other image section uses the shared imageModelControls.models. With one
            // active backend this is identical to the legacy single-asset replace;
            // with two, the tile is regenerated as a Gemini/OpenAI variant pair that
            // shares a variantGroupId so the review-panel source toggle appears.
            const requestedModels = (assetType === 'flyer_image'
                ? manifest.flyerControls?.models
                : manifest.imageModelControls?.models) as GeneratorService[] | undefined;
            const backends = getActiveImageBackends(requestedModels);
            const isMultiModel = backends.length > 1;

            // The revision path is text-to-image for every backend (it always was,
            // even for heroes/scenes). Flyers keep their square nano aspect.
            const renderBuffer = async (backendId: GeneratorService): Promise<Buffer> => {
                if (backendId === 'gemini3_flash') {
                    return assetType === 'flyer_image'
                        ? generateNanoBananaImage(newPrompt, NANO_BANANA_CONFIG.conceptAspectRatio, NANO_BANANA_CONFIG.heroImageSize)
                        : generateImageFromPrompt(newPrompt);
                }
                return generateGptImage2(newPrompt, { aspect: assetType === 'flyer_image' ? '1:1' : '16:9' });
            };

            // Stable group id for the regenerated set: reuse the existing group when
            // present (so selections/bindings keyed on it survive), else mint one.
            const variantGroupId = existingAsset.variantGroupId ?? `img_${typePrefix}_rev_${shortId}`;
            const newRecords: AssetRecord[] = [];
            const renderErrors: string[] = [];
            for (const backend of backends) {
                try {
                    const imageBuffer = await renderBuffer(backend.id);
                    const newAssetId = isMultiModel
                        ? `${variantGroupId}__${backend.id}`
                        : `img_${typePrefix}_rev_${shortId}`;
                    const fileName = isMultiModel
                        ? `images/${typePrefix}s/revised_${shortId}__${backend.id}.png`
                        : `images/${typePrefix}s/revised_${shortId}.png`;
                    const url = await storeAsset(slug, newAssetId, fileName, imageBuffer, 'image/png');
                    newRecords.push({
                        assetId: newAssetId,
                        assetType,
                        url,
                        generator: backend.id,
                        promptUsed: newPrompt,
                        fileSizeBytes: imageBuffer.length,
                        mimeType: 'image/png',
                        tags: [...existingAsset.tags, 'revised'],
                        createdAt: new Date().toISOString(),
                        reviewStatus: 'needs_review',
                        version: (existingAsset.version ?? 1) + 1,
                        active: true,
                        dimensions,
                        eligibilityRole: existingAsset.eligibilityRole,
                        curation: buildRegeneratedCuration(existingAsset),
                        ...(isMultiModel ? { variantGroupId } : { variantGroupId: existingAsset.variantGroupId }),
                    });
                } catch (err) {
                    renderErrors.push(`[${backend.id}] ${err instanceof Error ? err.message : String(err)}`);
                }
            }

            if (newRecords.length === 0) {
                return { status: 502, data: { error: `Regeneration failed for all image models: ${renderErrors.join(' | ')}` } };
            }

            for (const record of newRecords) {
                await saveAssetRecord(slug, record);
            }

            // Remove every member of the OLD variant group (or just the single old
            // asset), then append the freshly generated set. This keeps an A/B pair
            // from being orphaned when the revised set replaces it.
            const oldGroupAssetIds = new Set<string>(
                existingAsset.variantGroupId
                    ? getSectionAssets(manifest, assetType)
                        .filter((r) => (r.variantGroupId ?? r.assetId) === existingAsset.variantGroupId)
                        .map((r) => r.assetId)
                    : [assetId],
            );

            await deactivateGroup(slug, oldGroupAssetIds, assetId);

            const swappedManifest = replaceVariantGroupInManifest(manifest, oldGroupAssetIds, newRecords, assetType);
            const retargetedManifest = retargetManifestAssetReferences(swappedManifest, assetId, newRecords[0].assetId);
            const finalMultiManifest: CampaignMediaManifest = {
                ...retargetedManifest,
                generatedAt: new Date().toISOString(),
                totalAssets: countManifestAssets(retargetedManifest),
            };
            await saveMediaManifest(finalMultiManifest);
            await updateCampaignMediaStatus(slug, 'partial');

            return {
                status: 200,
                data: {
                    oldAssetId: assetId,
                    newAssetId: newRecords[0].assetId,
                    newAssetIds: newRecords.map((r) => r.assetId),
                    variantGroupId: isMultiModel ? variantGroupId : undefined,
                    models: newRecords.map((r) => r.generator),
                    applyMode,
                    revisedPrompt: newPrompt,
                    manifest: finalMultiManifest,
                },
            };

        } else if (VIDEO_ASSET_TYPES.has(assetType)) {
            if (!brief.productionBible) {
                return { status: 422, data: { error: 'No Production Bible found — cannot regenerate storyboard video' } };
            }

            const delivId = existingAsset.tags.find((tag) => !KNOWN_VIDEO_TAGS.has(tag) && !isElevenLabsVoiceTag(tag));
            if (!delivId) {
                return { status: 422, data: { error: `Cannot determine storyboard deliverableId from tags: [${existingAsset.tags.join(', ')}]` } };
            }

            const storyboard = brief.productionBible.storyboards.find(sb => sb.deliverableId === delivId);
            if (!storyboard) {
                return { status: 422, data: { error: `Storyboard not found for deliverableId: ${delivId}` } };
            }

            // MULTI_MODEL_IMAGES (Phase F): collapse scene variants to the selected
            // model-version before mapping (both variants share the sceneId tag).
            const sceneImageMap = new Map<string, string>();
            for (const rec of collapseAssetVariantGroups(manifest.images.sceneImages, manifest.modelVersionSelections)) {
                const sceneIdTag = rec.tags.find(t => t !== 'scene' && t !== 'revised');
                if (sceneIdTag) sceneImageMap.set(sceneIdTag, rec.url);
            }
            const collapsedHeroes = collapseAssetVariantGroups(manifest.images.hero, manifest.modelVersionSelections);
            const preferredHero = selectPreferredAssetForContext(collapsedHeroes, 'storyboard_fallback', manifest)
                ?? selectPreferredAssetForContext(collapsedHeroes, 'landing_hero_primary', manifest);
            const fallbackUrl = preferredHero?.url ?? manifest.images.shipReferences[0]?.url ?? '';

            const resolvedRevisionNote = applyMode === 'append_note' ? revisionNote : undefined;
            const resolvedMotionOverride = applyMode === 'manual_override' ? (revisedPrompt ?? undefined) : undefined;
            let themeMusicBuffer: Buffer | null = null;

            if (manifest.audio.themeMusic?.url) {
                try {
                    themeMusicBuffer = await downloadAssetBuffer(manifest.audio.themeMusic.url);
                } catch {
                    themeMusicBuffer = null;
                }
            }

            const video = await generateStoryboardVideo(
                brief,
                storyboard,
                sceneImageMap,
                fallbackUrl,
                themeMusicBuffer,
                resolvedRevisionNote,
                resolvedMotionOverride
                ,undefined,
                slug
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
                tags: buildRevisedTags(existingAsset.tags, ['revised', ...buildElevenLabsVoiceTags('narration', video.narrationVoiceId, video.narrationVoiceName)]),
                createdAt: new Date().toISOString(),
                reviewStatus: 'auto_approved',
                version: (existingAsset.version ?? 1) + 1,
                active: true,
                durationSeconds: video.durationSeconds,
            };
            await saveAssetRecord(slug, newRecord);

        } else if (AUDIO_ASSET_TYPES.has(assetType)) {
            const revisedScript = await buildRevisedAudioScript(
                existingAsset.promptUsed,
                applyMode,
                revisionNote,
                revisedPrompt
            );
            const revisedBrief = {
                ...brief,
                audio: {
                    ...brief.audio,
                    ...(assetType === 'ambient_narration'
                        ? { ambientNarrationScript: revisedScript }
                        : { hypeClipScript: revisedScript }),
                },
            };

            const audio = assetType === 'ambient_narration'
                ? await generateAmbientNarration(revisedBrief)
                : await generateHypeClip(revisedBrief);
            const newAssetId = assetType === 'ambient_narration'
                ? `audio_ambient_narration_rev_${shortId}`
                : `audio_hype_clip_rev_${shortId}`;
            const fileName = assetType === 'ambient_narration'
                ? `audio/ambient_narration_revised_${shortId}.mp3`
                : `audio/hype_clip_revised_${shortId}.mp3`;
            const url = await storeAsset(slug, newAssetId, fileName, audio.buffer, 'audio/mpeg');
            newRecord = {
                assetId: newAssetId,
                assetType,
                url,
                generator: 'elevenlabs',
                promptUsed: audio.script,
                fileSizeBytes: audio.buffer.length,
                mimeType: 'audio/mpeg',
                tags: buildRevisedTags(existingAsset.tags, ['revised', ...buildElevenLabsVoiceTags(audio.voiceRole, audio.voiceId, audio.voiceName)]),
                createdAt: new Date().toISOString(),
                reviewStatus: 'needs_review',
                version: (existingAsset.version ?? 1) + 1,
                active: true,
                durationSeconds: existingAsset.durationSeconds,
            };
            await saveAssetRecord(slug, newRecord);

        } else {
            return { status: 422, data: { error: `Asset type '${assetType}' does not support prompt-revision regeneration` } };
        }

        await deactivateAssetRecord(slug, assetId);

        const updatedManifest = retargetManifestAssetReferences(
            replaceSlotInManifest(manifest, assetId, newRecord, assetType),
            assetId,
            newRecord.assetId,
        );
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
                revisedPrompt: newRecord.promptUsed,
                manifest: finalManifest,
            },
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Regeneration failed';
        return { status: 500, data: { error: message } };
    }
}
