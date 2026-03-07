import { CampaignAestheticBrief, Storyboard, ShotSpec, SceneSpec } from '../../schema';
import { generateAmbientNarration } from './elevenlabs-generator';
import { generatePromptedClipFromScenes, generatePromptedClips, GeneratedVideo } from './runway-generator';
import { composeNarratedVerticalVideoSequence } from '../video-composer';

function createRunId(): string {
    return Date.now().toString(36);
}

// ────────────────────────────────────────────────────────────────────────────
// Legacy shot plan builder — used as fallback when no Production Bible exists
// ────────────────────────────────────────────────────────────────────────────

function buildLegacyShotPlan(brief: CampaignAestheticBrief): string[] {
    const hook = brief.socialConcepts.tiktokOrganic.hook.trim();
    const callToAction = brief.socialConcepts.tiktokOrganic.callToAction.trim();
    const { aestheticLabel, imageryMood, lightingStyle, compositionNotes, colorPalette } = brief.visual;
    const toneKeywords = brief.messaging.toneKeywords.join(', ');

    return [
        [
            `Vertical premium social ad opener for ${brief.themeName}`,
            `Fast cinematic push-in with confident forward momentum and immediate visual payoff`,
            `Make the ship feel alive with ocean movement, guests crossing frame, wardrobe motion, lighting pulses, and environmental energy`,
            `The niche identity must be obvious instantly through styling, props, signage, and atmosphere`,
            `Use ${aestheticLabel}, ${imageryMood}, ${lightingStyle}, ${compositionNotes}`,
            `Color emphasis: ${colorPalette.primary}, ${colorPalette.accent}`,
            `Narrative hook energy: ${hook}`,
            `Tone: ${toneKeywords}`,
            `Avoid slideshow pan, avoid still-photo parallax, avoid weak camera drift, avoid warped anatomy`,
        ].join('. '),
        [
            `Escalate into a high-value experiential reveal aboard the ship`,
            `Low-angle orbit and lateral tracking movement with layered foreground action`,
            `Show crowd energy, luxury details, reflective surfaces, water motion, and immersive event styling`,
            `Keep ship architecture believable and premium while making the subculture gathering feel exclusive and magnetic`,
            `Use warm ${colorPalette.secondary} and vivid ${colorPalette.accent} highlights`,
            `Avoid static framing, avoid gentle zoom only, avoid empty deck feeling`,
        ].join('. '),
        [
            `Mid-sequence emotional peak for ${brief.themeName}`,
            `Dynamic crane rise into a dramatic reveal with bold environmental motion`,
            `Emphasize celebration, anticipation, spectacle, and destination-scale atmosphere`,
            `Add premium nightlife or golden-hour energy depending on the brief while preserving realism`,
            `Make this feel expensive, social-first, and conversion-ready rather than generic cruise footage`,
            `Avoid repetitive motion from prior shots`,
        ].join('. '),
        [
            `Closing payoff shot with polished aspirational momentum and clear end-frame energy`,
            `Confident push through the scene into a composed hero finish suitable for CTA overlay`,
            `Preserve realism, ship fidelity, and rich movement in fabric, lights, reflections, and background figures`,
            `End with emotional certainty and invitation energy tied to ${callToAction || 'link in bio'}`,
            `Avoid dead stillness, avoid weak exit, avoid low-energy finish`,
        ].join('. '),
    ];
}

// ────────────────────────────────────────────────────────────────────────────
// Storyboard-driven shot prompt builder
// Converts ShotSpec into a rich RunwayML motion prompt
// ────────────────────────────────────────────────────────────────────────────

function buildShotMotionPrompt(shot: ShotSpec, brief: CampaignAestheticBrief, scene: SceneSpec | undefined): string {
    const { colorPalette, lightingStyle } = brief.visual;

    // Scene-grounding block — tells RunwayML exactly what is in the source image
    // so it animates the image rather than generating its own visuals.
    const sceneAnchor = scene
        ? [
              `The source image shows: ${scene.imagePrompt.split('.')[0]}`,
              `Location: ${scene.location}`,
              `Time of day: ${scene.timeOfDay}`,
              `Lighting: ${scene.lighting}`,
              `Keep all subjects, faces, ship architecture, ocean, and environment EXACTLY as shown in the source image`,
              `Do NOT replace, morph, or invent any new scene elements`,
          ].join('. ')
        : 'Preserve all visual elements from the source image exactly as shown. Do not replace or invent scene content.';

    return [
        sceneAnchor,
        `CAMERA: ${shot.cameraMovement}`,
        `Subject motion: ${shot.subjectMotion}`,
        `Environment motion: ${shot.environmentMotion}`,
        `Emotional beat: ${shot.emotionalBeat}`,
        `Color grade: ${colorPalette.primary} and ${colorPalette.accent} tones, ${lightingStyle}`,
        `Avoid slideshow parallax, avoid warped anatomy, avoid scene replacement`,
    ].join('. ');
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
}

export async function generateStoryboardVideo(
    brief: CampaignAestheticBrief,
    storyboard: Storyboard,
    sceneImageMap: ReadonlyMap<string, string>,
    fallbackHeroImageUrl: string
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

    for (const shot of storyboard.shotSequence) {
        const scene = sceneLibrary.find(s => s.sceneId === shot.sceneId);
        shotPrompts.push(buildShotMotionPrompt(shot, brief, scene));
        shotImageUrls.push(sceneImageMap.get(shot.sceneId) ?? fallbackHeroImageUrl);
    }

    // Generate narration + visual clips in parallel
    const [narrationAudio, visualClips] = await Promise.all([
        generateAmbientNarration(compositeBrief),
        generatePromptedClipFromScenes(
            shotImageUrls,
            shotPrompts,
            `video/${storyboard.deliverableId}_shot`,
            `vid_${storyboard.deliverableId}_shot`
        ),
    ]);

    if (visualClips.length === 0) {
        throw new Error(`RunwayML did not return any clips for storyboard: ${storyboard.deliverableId}`);
    }

    const finalVideoBuffer = await composeNarratedVerticalVideoSequence(
        visualClips.map((clip) => clip.buffer),
        narrationAudio.buffer
    );

    return {
        buffer: finalVideoBuffer,
        script: narrationAudio.script,
        durationSeconds: storyboard.totalDurationSeconds,
        assetId: `vid_${storyboard.deliverableId}_${runId}`,
        fileName: `video/${storyboard.deliverableId}_${runId}.mp4`,
        motionPrompt: shotPrompts.join('\n\n---\n\n'),
        deliverableId: storyboard.deliverableId,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Legacy TikTok seed (fallback when no Production Bible)
// ────────────────────────────────────────────────────────────────────────────

export async function generateTikTokSeed(
    brief: CampaignAestheticBrief,
    heroImageUrl: string
): Promise<{ buffer: Buffer; script: string; durationSeconds: number; assetId: string; fileName: string; motionPrompt: string }> {
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
        generatePromptedClips(heroImageUrl, shotPlan, 'video/tiktok_seed_shot', 'vid_tiktok_seed_shot'),
    ]);

    if (visualClips.length === 0) {
        throw new Error('RunwayML did not return any TikTok seed visual clips');
    }

    const finalVideoBuffer = await composeNarratedVerticalVideoSequence(
        visualClips.map((visualClip) => visualClip.buffer),
        narrationAudio.buffer
    );

    return {
        buffer: finalVideoBuffer,
        script: narrationAudio.script,
        durationSeconds: brief.videoConcepts.tiktokSeed.durationSeconds,
        assetId: `vid_tiktok_seed_${runId}`,
        fileName: `video/tiktok_seed_${runId}.mp4`,
        motionPrompt: shotPlan.join('\n\n---\n\n'),
    };
}
