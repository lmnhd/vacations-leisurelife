import { CampaignAestheticBrief } from '../../schema';
import { RUNWAYML_CONFIG } from '../media-pipeline-config';
import { getActiveVideoProviderInstance } from '../video-providers/provider-registry';

// ────────────────────────────────────────────────────────────────────────────
// RunwayML Gen-3 Alpha Video Generator
// Image-to-video for countdown clips and cinematic B-roll.
// All settings controlled via RUNWAYML_CONFIG in media-pipeline-config.ts.
// ────────────────────────────────────────────────────────────────────────────

interface RunwayVideoResult {
    videoUrl: string;
    durationSeconds: number;
}

async function createImageToVideo(
    sourceImageUrl: string,
    motionPrompt: string,
    durationSeconds: number = RUNWAYML_CONFIG.clipDurationSeconds
): Promise<RunwayVideoResult> {
    const provider = getActiveVideoProviderInstance();
    const result = await provider.generateImageToVideo(sourceImageUrl, motionPrompt, durationSeconds);
    return {
        videoUrl: result.videoUrl,
        durationSeconds: result.durationSeconds,
    };
}

async function downloadVideo(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download RunwayML video: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}

export interface GeneratedVideo {
    buffer: Buffer;
    motionPrompt: string;
    durationSeconds: number;
    assetId: string;
    fileName: string;
}

export async function generatePromptedClips(
    sourceImageUrl: string,
    prompts: readonly string[],
    fileNamePrefix: string,
    assetIdPrefix: string,
    durationSeconds: number = RUNWAYML_CONFIG.clipDurationSeconds
): Promise<GeneratedVideo[]> {
    const results: GeneratedVideo[] = [];

    for (let i = 0; i < prompts.length; i++) {
        const result = await createImageToVideo(sourceImageUrl, prompts[i], durationSeconds);
        const buffer = await downloadVideo(result.videoUrl);
        const idx = String(i + 1).padStart(3, '0');
        results.push({
            buffer,
            motionPrompt: prompts[i],
            durationSeconds: result.durationSeconds,
            assetId: `${assetIdPrefix}_${idx}`,
            fileName: `${fileNamePrefix}_${idx}.mp4`,
        });
    }

    return results;
}

// ────────────────────────────────────────────────────────────────────────────
// Scene-aware clip generation — each shot gets its OWN source image
// ────────────────────────────────────────────────────────────────────────────

export async function generatePromptedClipFromScenes(
    sourceImageUrls: readonly string[],
    prompts: readonly string[],
    fileNamePrefix: string,
    assetIdPrefix: string,
    durationSeconds: number = RUNWAYML_CONFIG.clipDurationSeconds
): Promise<GeneratedVideo[]> {
    const results: GeneratedVideo[] = [];
    const clipCount = Math.min(sourceImageUrls.length, prompts.length);

    for (let i = 0; i < clipCount; i++) {
        const result = await createImageToVideo(sourceImageUrls[i], prompts[i], durationSeconds);
        const buffer = await downloadVideo(result.videoUrl);
        const idx = String(i + 1).padStart(3, '0');
        results.push({
            buffer,
            motionPrompt: prompts[i],
            durationSeconds: result.durationSeconds,
            assetId: `${assetIdPrefix}_${idx}`,
            fileName: `${fileNamePrefix}_${idx}.mp4`,
        });
    }

    return results;
}

/** 3× countdown videos — generates all 3 in sequence (use test route for single clip) */
export async function generateCountdownVideos(
    brief: CampaignAestheticBrief,
    heroImageUrl: string
): Promise<GeneratedVideo[]> {
    const { lightingStyle, colorPalette } = brief.visual;
    const results: GeneratedVideo[] = [];

    const countdownLabels = ['3cabins', '2cabins', '1cabin'];
    const countdownMotions = [
        `Slow zoom in, ${lightingStyle}, gentle atmospheric motion, urgency building, ${colorPalette.primary} tones`,
        `Slow push forward, ${lightingStyle}, subtle wave motion, tension rising, ${colorPalette.accent} accents`,
        `Dramatic slow zoom, ${lightingStyle}, final moment intensity, ${colorPalette.primary} dominant`,
    ];

    const generatedClips = await generatePromptedClips(heroImageUrl, countdownMotions, 'video/countdown', 'vid_countdown');
    for (let i = 0; i < generatedClips.length; i++) {
        results.push({
            ...generatedClips[i],
            assetId: `vid_countdown_${countdownLabels[i]}`,
            fileName: `video/countdown_${countdownLabels[i]}.mp4`,
        });
    }

    return results;
}

/** 3–4× cinematic B-roll clips — one per source image provided */
export async function generateBrollClips(
    brief: CampaignAestheticBrief,
    heroImageUrls: string[]
): Promise<GeneratedVideo[]> {
    const { lightingStyle, colorPalette } = brief.visual;
    const results: GeneratedVideo[] = [];

    const brollMotions = [
        `Pool deck late afternoon, ambient movement, ${lightingStyle}, gentle water ripples, cinematic`,
        `Dining venue interior, candlelight flicker, light crowd motion, warm ${colorPalette.primary} tones`,
        `Ship deck port arrival, destination in background, slow pan, golden hour ${lightingStyle}`,
        `${brief.themeName} event scene, gentle zoom, atmospheric motion, ${colorPalette.accent} highlights`,
    ];

    const clipCount = Math.min(brollMotions.length, heroImageUrls.length);

    for (let i = 0; i < clipCount; i++) {
        const generatedClips = await generatePromptedClips(heroImageUrls[i], [brollMotions[i]], 'video/broll', 'vid_broll');
        const generatedClip = generatedClips[0];
        if (generatedClip) {
            const idx = String(i + 1).padStart(3, '0');
            results.push({
                ...generatedClip,
                assetId: `vid_broll_${idx}`,
                fileName: `video/broll_${idx}.mp4`,
            });
        }
    }

    return results;
}
