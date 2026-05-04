import { CampaignAestheticBrief, Storyboard, type TikTokPromotionPackage } from '../../schema';
import { inferTikTokFormat, type TikTokSequenceBeat } from './tiktok-formats/index';
import { renderTikTokOverlayCard, renderTikTokBrandLockup } from './tiktok-overlay-cards';
import type { TikTokOverlayCardSpec } from './tiktok-overlay-cards';
import { generateAmbientNarration, generateSpeechClip } from './elevenlabs-generator';
import { generatePromptedClipFromScenes, GeneratedVideo, VideoMotionFormat } from './runway-generator';
import { composeProductionVideo, composeVideoSequenceWithTransitions, composeVideoWithOverlayCards, createContainedStillVerticalClip } from '../video-composer';
import { resolveElevenLabsVoiceForRole } from '../voice-preference';
import { buildStoryboardShotPrompt } from '../storyboard-motion-policy';
import { storeAsset } from '../storage-client';
import type { VideoModelPresetId } from '../video-models';

function createRunId(): string {
    return Date.now().toString(36);
}

async function cacheIntermediateGeneratedClips(
    campaignSlug: string,
    cachePrefix: string,
    clips: readonly GeneratedVideo[],
): Promise<string[]> {
    const cachedUrls: string[] = [];

    for (let index = 0; index < clips.length; index += 1) {
        const clip = clips[index];
        const paddedIndex = String(index + 1).padStart(3, '0');
        const cacheAssetId = `${clip.assetId}_cache`;
        const cachePath = `video/cache/${cachePrefix}_${paddedIndex}.mp4`;
        const cachedUrl = await storeAsset(campaignSlug, cacheAssetId, cachePath, clip.buffer, 'video/mp4');
        cachedUrls.push(cachedUrl);
    }

    return cachedUrls;
}

async function composeWithFailureCaching(
    sourceVideoBuffers: readonly Buffer[],
    narrationAudioBuffer: Buffer,
    themeMusicBuffer: Buffer | null,
    campaignSlug: string | undefined,
    cachePrefix: string,
    visualClips: readonly GeneratedVideo[],
    targetDurationSeconds?: number,
): Promise<Buffer> {
    try {
        return await composeProductionVideo(
            sourceVideoBuffers,
            narrationAudioBuffer,
            themeMusicBuffer,
            { outputFormat: '9:16', targetDurationSeconds }
        );
    } catch (error) {
        if (!campaignSlug) {
            throw error;
        }

        const cachedUrls = await cacheIntermediateGeneratedClips(campaignSlug, cachePrefix, visualClips);
        const baseMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`${baseMessage} Intermediate generated video clips were cached at: ${cachedUrls.join(', ')}`);
    }
}

async function applyOverlayCardsToClips(
    clips: readonly GeneratedVideo[],
    overlayCards: readonly { buffer: Buffer; x: number; y: number }[],
): Promise<Buffer[]> {
    const clipCount = Math.min(clips.length, overlayCards.length);
    const buffers: Buffer[] = [];

    for (let i = 0; i < clipCount; i += 1) {
        const clip = clips[i];
        const overlay = overlayCards[i];
        buffers.push(await composeVideoWithOverlayCards(clip.buffer, [overlay], clip.durationSeconds));
    }

    for (let i = clipCount; i < clips.length; i += 1) {
        buffers.push(clips[i].buffer);
    }

    return buffers;
}

interface RenderedOverlayCard extends TikTokOverlayCardSpec {
    buffer: Buffer;
    x: number;
    y: number;
}

async function renderOverlayCards(
    cards: readonly TikTokOverlayCardSpec[],
): Promise<readonly RenderedOverlayCard[]> {
    const rendered: RenderedOverlayCard[] = [];

    for (const card of cards) {
        rendered.push({
            buffer: await renderTikTokOverlayCard(card),
            x: card.placement.x,
            y: card.placement.y,
            ...card,
        });
    }

    return rendered;
}

async function downloadAssetBuffer(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download asset: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
}

async function renderBeatOverlayBuffers(beat: TikTokSequenceBeat): Promise<{
    overlayInputs: { buffer: Buffer; x: number; y: number }[];
    brandLockupInput: { buffer: Buffer; x: number; y: number };
}> {
    const overlayInputs = await Promise.all(
        beat.overlaySpecs.map(async (spec) => ({
            buffer: await renderTikTokOverlayCard(spec),
            x: spec.placement.x,
            y: spec.placement.y,
        })),
    );
    const brandLockupBuffer = await renderTikTokBrandLockup(beat.brandLockup);
    return {
        overlayInputs,
        brandLockupInput: {
            buffer: brandLockupBuffer,
            x: beat.brandLockup.placement.x,
            y: beat.brandLockup.placement.y,
        },
    };
}

async function generateStaticPackageStoryboardVideo(
    brief: CampaignAestheticBrief,
    storyboard: Storyboard,
    sceneImageMap: ReadonlyMap<string, string>,
    themeMusicBuffer?: Buffer | null,
    promotionPackage?: TikTokPromotionPackage | null,
): Promise<{ buffer: Buffer; script: string; durationSeconds: number; motionPrompt: string; narrationVoiceId: string; narrationVoiceName: string | null }> {
    if (!promotionPackage) {
        throw new Error(
            `TikTok promotion package is required for ${storyboard.deliverableId}; production TikTok render does not support fallback copy.`,
        );
    }

    const tiktokFormat = inferTikTokFormat(storyboard.deliverableId);
    const sequenceBeats = tiktokFormat.buildSequenceBeats(brief, storyboard, promotionPackage);

    const sourceBuffers: Buffer[] = [];
    const shotDurations: number[] = [];
    const shotPrompts: string[] = [];
    const narrationVoice = await resolveElevenLabsVoiceForRole('narration');

    for (let index = 0; index < storyboard.shotSequence.length; index += 1) {
        const shot = storyboard.shotSequence[index];
        const beat = sequenceBeats[index] ?? sequenceBeats[index % sequenceBeats.length];

        // beat.sceneId is explicitly mapped from storyboard.shotSequence[i].sceneId
        // in buildPackageSequenceBeats. Use it as the primary lookup key.
        const resolvedSceneId = beat.sceneId || shot.sceneId;
        const imageUrl = sceneImageMap.get(resolvedSceneId);
        if (!imageUrl) {
            throw new Error(`Missing generated scene image for storyboard shot ${resolvedSceneId}`);
        }

        const imageBuffer = await downloadAssetBuffer(imageUrl);
        const stillClip = await createContainedStillVerticalClip(imageBuffer, beat.durationSeconds);
        const { overlayInputs, brandLockupInput } = await renderBeatOverlayBuffers(beat);

        const overlayedStill = await composeVideoWithOverlayCards(
            stillClip,
            overlayInputs,
            beat.durationSeconds,
            {
                applyFilmGrain: true,
                grainStrength: 6,
                fixedOverlays: [brandLockupInput],
            },
        );
        sourceBuffers.push(overlayedStill);
        shotDurations.push(beat.durationSeconds);
        const scene = brief.productionBible?.sceneLibrary.find((s) => s.sceneId === resolvedSceneId);
        shotPrompts.push(buildStoryboardShotPrompt(shot, brief, scene));
    }

    const finalVideoBuffer = await composeVideoSequenceWithTransitions(sourceBuffers, shotDurations);
    // Narration comes from the synthesized promotion package so on-screen copy
    // and voiceover stay in the same final copy system.
    const narrationScript = sequenceBeats
        .slice(0, storyboard.shotSequence.length)
        .map((beat) => beat.spokenText)
        .filter(Boolean)
        .join('. ')
        .replace(/\s+\./g, '.')
        .replace(/\.\.+/g, '.');
    const narrationBuffer = await generateSpeechClip(narrationScript, narrationVoice.voiceId);
    const audioMixedVideo = await composeProductionVideo([finalVideoBuffer], narrationBuffer, themeMusicBuffer ?? null, {
        outputFormat: '9:16',
        targetDurationSeconds: storyboard.totalDurationSeconds,
        narrationVolume: 1.35,
        musicVolume: 0.12,
    });

    return {
        buffer: audioMixedVideo,
        script: narrationScript,
        durationSeconds: storyboard.totalDurationSeconds,
        motionPrompt: shotPrompts.join('\n\n---\n\n'),
        narrationVoiceId: narrationVoice.voiceId,
        narrationVoiceName: narrationVoice.voiceName,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Storyboard-driven video generation
// Each shot uses its OWN scene image from the sceneImageMap
// ────────────────────────────────────────────────────────────────────────────

export interface StoryboardVideoResult {
    buffer: Buffer;
    script: string;
    durationSeconds: number;
    assetId: string;
    fileName: string;
    motionPrompt: string;
    deliverableId: string;
    narrationVoiceId: string;
    narrationVoiceName: string | null;
}

export async function generateStoryboardVideo(
    brief: CampaignAestheticBrief,
    storyboard: Storyboard,
    sceneImageMap: ReadonlyMap<string, string>,
    _fallbackHeroImageUrl: string,
    themeMusicBuffer?: Buffer | null,
    revisionNote?: string,
    motionPromptOverride?: string,
    presetId?: VideoModelPresetId,
    campaignSlug?: string,
    promotionPackage?: TikTokPromotionPackage | null,
): Promise<StoryboardVideoResult> {
    const runId = createRunId();

    // Build per-shot motion prompts and resolve source images
    const shotPrompts: string[] = [];
    const shotImageUrls: string[] = [];

    const sceneLibrary = brief.productionBible?.sceneLibrary ?? [];
    const missingSceneDefinitions = new Set<string>();
    const missingSceneImages = new Set<string>();

    for (const shot of storyboard.shotSequence) {
        const scene = sceneLibrary.find(s => s.sceneId === shot.sceneId);
        if (!scene) {
            missingSceneDefinitions.add(shot.sceneId);
        }

        const sceneImageUrl = sceneImageMap.get(shot.sceneId);
        if (!sceneImageUrl) {
            missingSceneImages.add(shot.sceneId);
        }

        const basePrompt = buildStoryboardShotPrompt(shot, brief, scene);
        const finalPrompt = motionPromptOverride
            ? `${basePrompt}. OVERRIDE: ${motionPromptOverride}`
            : revisionNote
            ? `${basePrompt}. REVISION: ${revisionNote}`
            : basePrompt;
        shotPrompts.push(finalPrompt);
        if (sceneImageUrl) {
            shotImageUrls.push(sceneImageUrl);
        }
    }

    if (missingSceneDefinitions.size > 0 || missingSceneImages.size > 0) {
        const reasons: string[] = [];

        if (missingSceneDefinitions.size > 0) {
            reasons.push(`missing scene definitions: ${Array.from(missingSceneDefinitions).join(', ')}`);
        }

        if (missingSceneImages.size > 0) {
            reasons.push(`missing generated scene images: ${Array.from(missingSceneImages).join(', ')}`);
        }

        throw new Error(
            `Storyboard ${storyboard.deliverableId} is incomplete; ${reasons.join('; ')}. Generate or repair the required scene images before creating the video.`
        );
    }

    const isTikTok = storyboard.deliverableId.startsWith('tiktok');
    const tiktokFormat = isTikTok ? inferTikTokFormat(storyboard.deliverableId) : null;

    if (isTikTok && tiktokFormat?.renderMode === 'static_package') {
        const staticPackageResult = await generateStaticPackageStoryboardVideo(
            brief,
            storyboard,
            sceneImageMap,
            themeMusicBuffer ?? null,
            promotionPackage,
        );
        return {
            buffer: staticPackageResult.buffer,
            script: staticPackageResult.script,
            durationSeconds: staticPackageResult.durationSeconds,
            assetId: `vid_${storyboard.deliverableId}_${runId}`,
            fileName: `video/${storyboard.deliverableId}_${runId}.mp4`,
            motionPrompt: staticPackageResult.motionPrompt,
            deliverableId: storyboard.deliverableId,
            narrationVoiceId: staticPackageResult.narrationVoiceId,
            narrationVoiceName: staticPackageResult.narrationVoiceName,
        };
    }

    // Build narration brief from the storyboard's script
    const compositeBrief: CampaignAestheticBrief = {
        ...brief,
        audio: {
            ...brief.audio,
            ambientNarrationScript: storyboard.deliverableId.startsWith('tiktok') ? '' : storyboard.narrationScript,
        },
    };

    const motionFormat: VideoMotionFormat = isTikTok ? 'tiktok' : 'standard';

    // Generate narration + visual clips in parallel
    const [narrationAudio, visualClips] = await Promise.all([
        generateAmbientNarration(compositeBrief),
        generatePromptedClipFromScenes(
            shotImageUrls,
            shotPrompts,
            `video/${storyboard.deliverableId}_shot`,
            `vid_${storyboard.deliverableId}_shot`,
            undefined,
            presetId,
            motionFormat,
        ),
    ]);

    if (visualClips.length === 0) {
        throw new Error(`RunwayML did not return any clips for storyboard: ${storyboard.deliverableId}`);
    }

    const overlayedClipBuffers = isTikTok && tiktokFormat
        ? await applyOverlayCardsToClips(
            visualClips,
            await renderOverlayCards(tiktokFormat.buildOverlayCards(brief, storyboard, promotionPackage)),
        )
        : visualClips.map((clip: GeneratedVideo) => clip.buffer);

    const finalVideoBuffer = await composeWithFailureCaching(
        overlayedClipBuffers,
        narrationAudio.buffer,
        themeMusicBuffer ?? null,
        campaignSlug,
        `${storyboard.deliverableId}_${runId}`,
        visualClips,
        storyboard.totalDurationSeconds,
    );

    return {
        buffer: finalVideoBuffer,
        script: narrationAudio.script,
        durationSeconds: storyboard.totalDurationSeconds,
        assetId: `vid_${storyboard.deliverableId}_${runId}`,
        fileName: `video/${storyboard.deliverableId}_${runId}.mp4`,
        motionPrompt: shotPrompts.join('\n\n---\n\n'),
        deliverableId: storyboard.deliverableId,
        narrationVoiceId: narrationAudio.voiceId,
        narrationVoiceName: narrationAudio.voiceName,
    };
}
