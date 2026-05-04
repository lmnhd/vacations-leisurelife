import { CampaignAestheticBrief } from '../../schema';
import { HEYGEN_CONFIG } from '../media-pipeline-config';

// ────────────────────────────────────────────────────────────────────────────
// HeyGen Avatar Video Generator
// Produces AI avatar talking-head videos for TikTok seed, hero explainer,
// and threshold announcement.
// All settings controlled via HEYGEN_CONFIG in media-pipeline-config.ts.
// ────────────────────────────────────────────────────────────────────────────

function getApiKey(): string {
    const key = process.env.HEYGEN_API_KEY;
    if (!key) throw new Error('HEYGEN_API_KEY not set in environment');
    return key;
}

interface HeyGenCreateResponse {
    data: { video_id: string };
}

interface HeyGenStatusResponse {
    data: { status: string; video_url?: string; duration?: number };
}

interface HeyGenVideoResult {
    videoUrl: string;
    durationSeconds: number;
}

async function createVideo(
    script: string,
    backgroundImageUrl: string,
    aspectRatio: typeof HEYGEN_CONFIG.tiktokAspectRatio | typeof HEYGEN_CONFIG.explainerAspectRatio
): Promise<HeyGenVideoResult> {
    const dimensions = aspectRatio === HEYGEN_CONFIG.tiktokAspectRatio
        ? HEYGEN_CONFIG.tiktokDimensions
        : HEYGEN_CONFIG.explainerDimensions;

    const response = await fetch(`${HEYGEN_CONFIG.apiBase}/video/generate`, {
        method: 'POST',
        headers: {
            'X-Api-Key': getApiKey(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            video_inputs: [{
                character: {
                    type: 'avatar',
                    avatar_id: HEYGEN_CONFIG.defaultAvatarId,
                    avatar_style: 'normal',
                },
                voice: {
                    type: 'text',
                    input_text: script,
                    voice_id: 'default',
                },
                background: {
                    type: 'image',
                    url: backgroundImageUrl,
                },
            }],
            dimension: dimensions,
            aspect_ratio: aspectRatio,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HeyGen create error ${response.status}: ${errorText}`);
    }

    const createData = await response.json() as HeyGenCreateResponse;
    const videoId = createData.data.video_id;

    for (let attempt = 0; attempt < HEYGEN_CONFIG.maxPollAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, HEYGEN_CONFIG.pollIntervalMs));

        const statusResponse = await fetch(`${HEYGEN_CONFIG.apiBase}/video/${videoId}`, {
            headers: { 'X-Api-Key': getApiKey() },
        });

        if (!statusResponse.ok) continue;

        const statusData = await statusResponse.json() as HeyGenStatusResponse;

        if (statusData.data.status === 'completed' && statusData.data.video_url) {
            return {
                videoUrl: statusData.data.video_url,
                durationSeconds: statusData.data.duration ?? 0,
            };
        }

        if (statusData.data.status === 'failed') {
            throw new Error(`HeyGen video generation failed for video ${videoId}`);
        }
    }

    throw new Error(`HeyGen video generation timed out for video ${videoId}`);
}

async function downloadVideo(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download HeyGen video: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}

export interface GeneratedVideo {
    buffer: Buffer;
    script: string;
    durationSeconds: number;
    assetId: string;
    fileName: string;
}

/** Hero explainer video (60s) — full avatar presentation. 16:9 */
export async function generateHeroExplainer(
    brief: CampaignAestheticBrief,
    heroImageUrl: string
): Promise<GeneratedVideo> {
    const script = brief.videoConcepts.heroExplainer.scriptOrNarration;
    const result = await createVideo(script, heroImageUrl, HEYGEN_CONFIG.explainerAspectRatio);
    const buffer = await downloadVideo(result.videoUrl);
    return { buffer, script, durationSeconds: result.durationSeconds, assetId: 'vid_hero_explainer', fileName: 'video/hero_explainer.mp4' };
}

/** Threshold announcement video (30s) — pre-generated with dynamic tokens. 16:9 */
export async function generateThresholdAnnouncement(
    brief: CampaignAestheticBrief,
    heroImageUrl: string
): Promise<GeneratedVideo> {
    const script = brief.videoConcepts.thresholdAnnouncement.scriptOrNarration;
    const result = await createVideo(script, heroImageUrl, HEYGEN_CONFIG.explainerAspectRatio);
    const buffer = await downloadVideo(result.videoUrl);
    return { buffer, script, durationSeconds: result.durationSeconds, assetId: 'vid_threshold_announcement', fileName: 'video/threshold_announcement.mp4' };
}
