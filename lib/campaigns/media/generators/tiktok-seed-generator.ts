import { CampaignAestheticBrief } from '../../schema';
import { generateAmbientNarration } from './elevenlabs-generator';
import { generatePromptedClips } from './runway-generator';
import { composeNarratedVerticalVideoSequence } from '../video-composer';

function createTikTokSeedRunId(): string {
    return Date.now().toString(36);
}

function buildTikTokShotPlan(brief: CampaignAestheticBrief): string[] {
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
    const shotPlan = buildTikTokShotPlan(brief);
    const runId = createTikTokSeedRunId();

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
