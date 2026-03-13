import { CampaignAestheticBrief, Storyboard } from '../../schema';
import { generateAmbientNarration } from './elevenlabs-generator';
import { generatePromptedClipFromScenes, generatePromptedClips, GeneratedVideo } from './runway-generator';
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
): Promise<Buffer> {
    try {
        return await composeProductionVideo(
            sourceVideoBuffers,
            narrationAudioBuffer,
            themeMusicBuffer,
            { outputFormat: '9:16' }
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
// Legacy shot plan builder — used as fallback when no Production Bible exists
// ────────────────────────────────────────────────────────────────────────────

function buildLegacyShotPlan(brief: CampaignAestheticBrief): string[] {
    const hook = brief.socialConcepts.tiktokOrganic.hook.trim();
    const callToAction = brief.socialConcepts.tiktokOrganic.callToAction.trim();
    const { aestheticLabel, imageryMood, lightingStyle, compositionNotes, colorPalette } = brief.visual;
    const { governingPrinciple, cruiseNativeMoments, nicheEnhancedMoments } = brief.visual.plausibilityFramework;
    const toneKeywords = brief.messaging.toneKeywords.join(', ');

    return [
        [
            `Vertical premium social ad opener for ${brief.themeName}`,
            `Cruise-first hook with immediate ship identity, ocean movement, and one clear emotional beat`,
            `Use cinematic motion, but keep it graceful and believable rather than spectacle-driven`,
            `Let the ship feel alive through wake, breeze, fabric movement, reflections, posture, and natural guest motion`,
            `Signal the niche through subtle guest-carried cues, wardrobe, timing, or atmosphere rather than signage or staged props`,
            `Use ${aestheticLabel}, ${imageryMood}, ${lightingStyle}, ${compositionNotes}`,
            `Ground the scene in this principle: ${governingPrinciple}`,
            `Cruise-native anchor: ${cruiseNativeMoments[0] ?? 'rail-side horizon pause'}`,
            `Color emphasis: ${colorPalette.primary}, ${colorPalette.accent}`,
            `Narrative hook energy: ${hook}`,
            `Tone: ${toneKeywords}`,
            `Avoid signage, avoid classrooms, avoid workshop energy, avoid staged event behavior`,
            `If people appear, keep them nearly still with subtle breathing, relaxed posture, and eye-line shifts only`,
            `Let the motion come from camera glide, wake, fabric, reflections, hair movement, and changing light rather than complex body action`,
            `Avoid walking cycles, clinking, sipping, hand-offs, duplicated props, or extra limbs`,
            `Avoid slideshow pan, avoid still-photo parallax, avoid weak camera drift, avoid warped anatomy`,
        ].join('. '),
        [
            `Build desire through a premium but believable shipboard moment aboard the ship`,
            `Use low-angle orbit or lateral tracking with layered depth, open-water context, and relaxed human chemistry`,
            `Show reflective surfaces, warm service details, and authentic cruise atmosphere without turning the ship into an event venue`,
            `Keep ship architecture believable and premium while making the niche feel lightly woven into normal vacation life`,
            `Believable niche-enhanced moment: ${nicheEnhancedMoments[0] ?? 'a subtle guest-carried cue that stays secondary to the ship and sea'}`,
            `Use warm ${colorPalette.secondary} and vivid ${colorPalette.accent} highlights`,
            `Human presence should stay calm and anchored; camera movement and ambient ship life should do most of the work`,
            `Avoid static framing, avoid gentle zoom only, avoid empty deck feeling, avoid crowd takeover`,
        ].join('. '),
        [
            `Mid-sequence emotional peak for ${brief.themeName}`,
            `Dynamic crane rise or slow arc into the strongest vacation feeling in the sequence`,
            `Emphasize awe, intimacy, freedom, wonder, or belonging rather than spectacle`,
            `Add premium golden-hour or blue-hour energy depending on the brief while preserving ship realism`,
            `Make this feel expensive, social-first, and conversion-ready without looking programmed or over-produced`,
            `If hands or faces are visible, keep gestures minimal and settled rather than choreographed`,
            `Avoid repetitive motion from prior shots, avoid festival energy, avoid formal group choreography`,
        ].join('. '),
        [
            `Closing payoff shot with polished aspirational momentum and clear end-frame energy`,
            `Confident push through the scene into a composed hero finish suitable for CTA overlay`,
            `Preserve realism, ship fidelity, and rich movement in fabric, lights, reflections, and background figures`,
            `End with emotional certainty and invitation energy tied to ${callToAction || 'link in bio'}`,
            `Keep the close cruise-first, horizon-led, and human rather than event-like`,
            `Keep any visible people nearly still; avoid object-to-mouth motion, clinking, or hand choreography in the finish`,
            `Avoid dead stillness, avoid weak exit, avoid low-energy finish, avoid staged promo energy`,
        ].join('. '),
    ];
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
            ambientNarrationScript: storyboard.narrationScript,
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

    // Generate narration + visual clips in parallel
    const [narrationAudio, visualClips] = await Promise.all([
        generateAmbientNarration(compositeBrief),
        generatePromptedClipFromScenes(
            shotImageUrls,
            shotPrompts,
            `video/${storyboard.deliverableId}_shot`,
            `vid_${storyboard.deliverableId}_shot`,
            undefined,
            presetId
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
            ambientNarrationScript: [hook, bodyScript, callToAction].filter(Boolean).join('\n\n'),
        },
    };
    const shotPlan = buildLegacyShotPlan(brief);
    const runId = createRunId();

    const [narrationAudio, visualClips] = await Promise.all([
        generateAmbientNarration(compositeBrief),
        generatePromptedClips(heroImageUrl, shotPlan, 'video/tiktok_seed_shot', 'vid_tiktok_seed_shot', undefined, presetId),
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
