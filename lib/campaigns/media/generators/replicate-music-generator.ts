import Replicate from 'replicate';
import { REPLICATE_CONFIG } from '../media-pipeline-config';
import type { CampaignAestheticBrief } from '../../schema';
import type { GeneratedAudio } from './elevenlabs-generator';

export async function generateThemeMusic(brief: CampaignAestheticBrief): Promise<GeneratedAudio> {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
        throw new Error('[Replicate] REPLICATE_API_TOKEN environment variable is missing');
    }

    const replicate = new Replicate({
        auth: token,
    });

    // Build the prompt from the brief. MusicGen takes descriptive prompts.
    const prompt = `ambient instrumental music, ${brief.visual.aestheticLabel} vibe, ${brief.visual.imageryMood} atmosphere, background loop, no vocals, high quality`;
    const duration = REPLICATE_CONFIG.defaultDuration;

    console.log(`[Replicate] Generating theme music with MusicGen...`);
    console.log(`[Replicate] Prompt: "${prompt}"`);

    try {
        const output = (await replicate.run(
            REPLICATE_CONFIG.musicGenModel,
            {
                input: {
                    prompt: prompt,
                    model_version: 'melody',
                    output_format: REPLICATE_CONFIG.outputFormat,
                    normalization_strategy: REPLICATE_CONFIG.normalizationStrategy,
                    duration: duration
                }
            }
        )) as unknown as string; // The output is a URL to the generated audio file

        if (!output) {
            throw new Error('[Replicate] No output URL returned from MusicGen');
        }

        console.log(`[Replicate] Task complete. Downloading audio from: ${output}`);

        // Download the audio buffer from the Replicate output URL
        let audioBuffer: Buffer | null = null;
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            const downloadResponse = await fetch(output);
            if (downloadResponse.ok) {
                const arrayBuffer = await downloadResponse.arrayBuffer();
                audioBuffer = Buffer.from(arrayBuffer);
                break;
            }
            // If not ok, wait and retry
            await new Promise((resolve) => setTimeout(resolve, 2000));
            attempts++;
        }

        if (!audioBuffer) {
            throw new Error(`[Replicate] Failed to download audio after ${maxAttempts} attempts`);
        }

        console.log(`[Replicate] Download complete. Buffer size: ${audioBuffer.length} bytes`);

        return {
            buffer: audioBuffer,
            script: prompt,
            assetId: 'audio_theme_music',
            fileName: 'audio/theme_music.mp3',
            voiceId: 'instrumental',
            voiceName: null,
            voiceRole: 'narration',
        };
    } catch (error) {
        console.error('[Replicate] Generation failed:', error);
        throw error;
    }
}
