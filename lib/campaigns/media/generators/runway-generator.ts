import { CampaignAestheticBrief } from '../../schema';
import { RUNWAYML_CONFIG } from '../media-pipeline-config';
import { type VideoModelPresetId } from '../video-models';
import { getVideoProviderForPreset } from '../video-providers/provider-registry';
import { joinSegmentsWithinLimit } from '../storyboard-motion-policy';

// ────────────────────────────────────────────────────────────────────────────
// RunwayML Gen-3 Alpha Video Generator
// Image-to-video for countdown clips and cinematic B-roll.
// All settings controlled via RUNWAYML_CONFIG in media-pipeline-config.ts.
// ────────────────────────────────────────────────────────────────────────────

interface RunwayVideoResult {
    videoUrl: string;
    durationSeconds: number;
}

export type VideoMotionFormat = 'standard' | 'tiktok';

export function buildProductionSafeMotionPrompt(motionPrompt: string, format: VideoMotionFormat = 'standard'): string {
    const normalizedPrompt = motionPrompt.trim();

    const formatLeader = format === 'tiktok'
        ? 'Punchy social-native motion; hook the viewer in the first two seconds with intentional camera energy and clear subject read'
        : 'Preserve the source image, subject identity, and composition';

    const formatFooter = format === 'tiktok'
        ? 'Keep motion native to the format: hard cuts feel better than gentle drift; every second must carry the campaign identity'
        : 'Avoid warped anatomy, extra limbs, prop duplication, mug or cup distortion, or scene swaps';

    return joinSegmentsWithinLimit([
        formatLeader,
        normalizedPrompt,
        'Favor camera drift, sea shimmer, reflections, clouds, steam, and light over any subject animation',
        'If people are visible, freeze them completely; no body motion, no hand motion, no facial motion, no walking, no turning, no sipping',
        formatFooter,
    ], RUNWAYML_CONFIG.motionPromptMaxChars);
}

async function createImageToVideo(
    sourceImageUrl: string,
    motionPrompt: string,
    durationSeconds: number = RUNWAYML_CONFIG.clipDurationSeconds,
    presetId?: VideoModelPresetId,
): Promise<RunwayVideoResult> {
    const provider = getVideoProviderForPreset(presetId);
    const result = await provider.generateImageToVideo(sourceImageUrl, motionPrompt, durationSeconds, { presetId });
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
    durationSeconds: number = RUNWAYML_CONFIG.clipDurationSeconds,
    presetId?: VideoModelPresetId,
    format: VideoMotionFormat = 'standard',
): Promise<GeneratedVideo[]> {
    const results: GeneratedVideo[] = [];

    for (let i = 0; i < prompts.length; i++) {
        const safePrompt = buildProductionSafeMotionPrompt(prompts[i], format);
        const result = await createImageToVideo(sourceImageUrl, safePrompt, durationSeconds, presetId);
        const buffer = await downloadVideo(result.videoUrl);
        const idx = String(i + 1).padStart(3, '0');
        results.push({
            buffer,
            motionPrompt: safePrompt,
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
    durationSeconds: number = RUNWAYML_CONFIG.clipDurationSeconds,
    presetId?: VideoModelPresetId,
    format: VideoMotionFormat = 'standard',
): Promise<GeneratedVideo[]> {
    const results: GeneratedVideo[] = [];
    const clipCount = Math.min(sourceImageUrls.length, prompts.length);

    for (let i = 0; i < clipCount; i++) {
        const safePrompt = buildProductionSafeMotionPrompt(prompts[i], format);
        const result = await createImageToVideo(sourceImageUrls[i], safePrompt, durationSeconds, presetId);
        const buffer = await downloadVideo(result.videoUrl);
        const idx = String(i + 1).padStart(3, '0');
        results.push({
            buffer,
            motionPrompt: safePrompt,
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
    heroImageUrl: string,
    presetId?: VideoModelPresetId,
): Promise<GeneratedVideo[]> {
    const { lightingStyle, colorPalette } = brief.visual;
    const results: GeneratedVideo[] = [];

    const countdownLabels = ['window_1', 'window_2', 'window_3'];
    const countdownMotions = [
        `Slow zoom in, ${lightingStyle}, gentle atmospheric motion, open and aspirational, ${colorPalette.primary} tones`,
        `Slow push forward, ${lightingStyle}, subtle wave motion, exploratory and calm, ${colorPalette.accent} accents`,
        `Wide establishing shot, ${lightingStyle}, destination-forward motion, ${colorPalette.primary} dominant`,
    ];

    const generatedClips = await generatePromptedClips(heroImageUrl, countdownMotions, 'video/countdown', 'vid_countdown', RUNWAYML_CONFIG.clipDurationSeconds, presetId);
    for (let i = 0; i < generatedClips.length; i++) {
        results.push({
            ...generatedClips[i],
            assetId: `vid_window_${countdownLabels[i]}`,
            fileName: `video/window_${countdownLabels[i]}.mp4`,
        });
    }

    return results;
}

/** 3–4× cinematic B-roll clips — one per source image provided */
export async function generateBrollClips(
    brief: CampaignAestheticBrief,
    heroImageUrls: string[],
    presetId?: VideoModelPresetId,
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
            const generatedClips = await generatePromptedClips(heroImageUrls[i], [brollMotions[i]], 'video/broll', 'vid_broll', RUNWAYML_CONFIG.clipDurationSeconds, presetId);
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
