import { CampaignAestheticBrief, Storyboard } from '../../schema';
import { inferTikTokFormat } from './tiktok-formats/index';
import { generateAmbientNarration } from './elevenlabs-generator';
import { generatePromptedClipFromScenes, generatePromptedClips, GeneratedVideo, VideoMotionFormat } from './runway-generator';
import { composeProductionVideo } from '../video-composer';
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
): Promise<StoryboardVideoResult> {
    const runId = createRunId();

    // Build narration brief from the storyboard's script
    const compositeBrief: CampaignAestheticBrief = {
        ...brief,
        audio: {
            ...brief.audio,
            ambientNarrationScript: storyboard.deliverableId.startsWith('tiktok') ? '' : storyboard.narrationScript,
        },
    };

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

    const finalVideoBuffer = await composeWithFailureCaching(
        visualClips.map((clip) => clip.buffer),
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

// ────────────────────────────────────────────────────────────────────────────
// Legacy TikTok seed (fallback when no Production Bible)
// ────────────────────────────────────────────────────────────────────────────

export async function generateTikTokSeed(
    brief: CampaignAestheticBrief,
    heroImageUrl: string,
    themeMusicBuffer?: Buffer | null,
    presetId?: VideoModelPresetId,
    campaignSlug?: string,
): Promise<{ buffer: Buffer; script: string; durationSeconds: number; assetId: string; fileName: string; motionPrompt: string; narrationVoiceId: string; narrationVoiceName: string | null }> {
    const hook = brief.socialConcepts.tiktokOrganic.hook.trim();
    const bodyScript = brief.videoConcepts.tiktokSeed.scriptOrNarration.trim();
    const callToAction = brief.socialConcepts.tiktokOrganic.callToAction.trim() || 'Sign up below — link in bio.';
    const compositeBrief: CampaignAestheticBrief = {
        ...brief,
        audio: {
            ...brief.audio,
            ambientNarrationScript: '',
        },
    };
    const organicFormat = inferTikTokFormat('tiktok_organic_seed');
    const shotPlan = organicFormat.buildShotPrompts(brief);
    const runId = createRunId();

    const targetDurationSeconds = brief.videoConcepts.tiktokSeed.durationSeconds;

    const [narrationAudio, visualClips] = await Promise.all([
        generateAmbientNarration(compositeBrief),
        generatePromptedClips(heroImageUrl, shotPlan, 'video/tiktok_seed_shot', 'vid_tiktok_seed_shot', undefined, presetId, 'tiktok'),
    ]);

    if (visualClips.length === 0) {
        throw new Error('RunwayML did not return any TikTok seed visual clips');
    }

    const finalVideoBuffer = await composeWithFailureCaching(
        visualClips.map((visualClip) => visualClip.buffer),
        narrationAudio.buffer,
        themeMusicBuffer ?? null,
        campaignSlug,
        `tiktok_seed_${runId}`,
        visualClips,
        targetDurationSeconds > 0 ? targetDurationSeconds : undefined,
    );

    return {
        buffer: finalVideoBuffer,
        script: narrationAudio.script,
        durationSeconds: brief.videoConcepts.tiktokSeed.durationSeconds,
        assetId: `vid_tiktok_seed_${runId}`,
        fileName: `video/tiktok_seed_${runId}.mp4`,
        motionPrompt: shotPlan.join('\n\n---\n\n'),
        narrationVoiceId: narrationAudio.voiceId,
        narrationVoiceName: narrationAudio.voiceName,
    };
}
