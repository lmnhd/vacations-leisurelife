import { CampaignAestheticBrief } from '../../schema';
import { generateAmbientNarration } from './elevenlabs-generator';
import { generateBrollClips } from './runway-generator';
import { composeNarratedVerticalVideo } from '../video-composer';

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

    const [narrationAudio, visualClips] = await Promise.all([
        generateAmbientNarration(compositeBrief),
        generateBrollClips(brief, [heroImageUrl]),
    ]);

    const visualClip = visualClips[0];
    if (!visualClip) {
        throw new Error('RunwayML did not return a TikTok seed visual clip');
    }

    const finalVideoBuffer = await composeNarratedVerticalVideo(visualClip.buffer, narrationAudio.buffer);

    return {
        buffer: finalVideoBuffer,
        script: narrationAudio.script,
        durationSeconds: brief.videoConcepts.tiktokSeed.durationSeconds,
        assetId: 'vid_tiktok_seed',
        fileName: 'video/tiktok_seed.mp4',
        motionPrompt: visualClip.motionPrompt,
    };
}
