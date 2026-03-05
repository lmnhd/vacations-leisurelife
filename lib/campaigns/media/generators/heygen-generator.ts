import { CampaignAestheticBrief } from '../../schema';

// ────────────────────────────────────────────────────────────────────────────
// HeyGen Avatar Video Generator
// Produces AI avatar talking-head videos for TikTok seed, hero explainer,
// and threshold announcement.
// API: https://api.heygen.com/v2
// ────────────────────────────────────────────────────────────────────────────

const HEYGEN_API_BASE = 'https://api.heygen.com/v2';
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 60; // 10 minutes max wait

function getApiKey(): string {
    const key = process.env.HEYGEN_API_KEY;
    if (!key) throw new Error('HEYGEN_API_KEY not set in environment');
    return key;
}

function getDefaultAvatarId(): string {
    return process.env.HEYGEN_DEFAULT_AVATAR_ID || 'josh_lite3_20230714';
}

interface HeyGenVideoResult {
    videoUrl: string;
    durationSeconds: number;
}

async function createVideo(
    script: string,
    backgroundImageUrl: string,
    aspectRatio: '16:9' | '9:16' = '16:9'
): Promise<HeyGenVideoResult> {
    const apiKey = getApiKey();
    const avatarId = getDefaultAvatarId();

    const [width, height] = aspectRatio === '16:9' ? [1920, 1080] : [1080, 1920];

    const response = await fetch(`${HEYGEN_API_BASE}/video/generate`, {
        method: 'POST',
        headers: {
            'X-Api-Key': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            video_inputs: [{
                character: {
                    type: 'avatar',
                    avatar_id: avatarId,
                    avatar_style: 'normal',
                },
                voice: {
                    type: 'text',
                    input_text: script,
                    voice_id: 'default', // Will be overridden by ElevenLabs voice if configured
                },
                background: {
                    type: 'image',
                    url: backgroundImageUrl,
                },
            }],
            dimension: { width, height },
            aspect_ratio: aspectRatio,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HeyGen create error ${response.status}: ${errorText}`);
    }

    const createData = await response.json() as { data: { video_id: string } };
    const videoId = createData.data.video_id;

    // Poll for completion
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

        const statusResponse = await fetch(`${HEYGEN_API_BASE}/video/${videoId}`, {
            headers: { 'X-Api-Key': apiKey },
        });

        if (!statusResponse.ok) continue;

        const statusData = await statusResponse.json() as {
            data: { status: string; video_url?: string; duration?: number };
        };

        if (statusData.data.status === 'completed' && statusData.data.video_url) {
            return {
                videoUrl: statusData.data.video_url,
                durationSeconds: statusData.data.duration || 0,
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

/**
 * TikTok seed video (30–45s) — avatar + hero image backdrop.
 */
export async function generateTikTokSeed(
    brief: CampaignAestheticBrief,
    heroImageUrl: string
): Promise<GeneratedVideo> {
    const tiktokBrief = brief.videoConcepts.tiktokSeed;
    const hook = brief.socialConcepts.tiktokOrganic.hook;
    const script = `${hook}\n\n${tiktokBrief.scriptOrNarration}\n\nSign up below — link in bio.`;

    const result = await createVideo(script, heroImageUrl, '9:16');
    const buffer = await downloadVideo(result.videoUrl);

    return {
        buffer,
        script,
        durationSeconds: result.durationSeconds,
        assetId: 'vid_tiktok_seed',
        fileName: 'video/tiktok_seed.mp4',
    };
}

/**
 * Hero explainer video (60s) — full avatar presentation.
 */
export async function generateHeroExplainer(
    brief: CampaignAestheticBrief,
    heroImageUrl: string
): Promise<GeneratedVideo> {
    const explainerBrief = brief.videoConcepts.heroExplainer;
    const script = explainerBrief.scriptOrNarration;

    const result = await createVideo(script, heroImageUrl, '16:9');
    const buffer = await downloadVideo(result.videoUrl);

    return {
        buffer,
        script,
        durationSeconds: result.durationSeconds,
        assetId: 'vid_hero_explainer',
        fileName: 'video/hero_explainer.mp4',
    };
}

/**
 * Threshold announcement video (30s) — pre-generated with dynamic tokens.
 */
export async function generateThresholdAnnouncement(
    brief: CampaignAestheticBrief,
    heroImageUrl: string
): Promise<GeneratedVideo> {
    const thresholdBrief = brief.videoConcepts.thresholdAnnouncement;
    const script = thresholdBrief.scriptOrNarration;

    const result = await createVideo(script, heroImageUrl, '16:9');
    const buffer = await downloadVideo(result.videoUrl);

    return {
        buffer,
        script,
        durationSeconds: result.durationSeconds,
        assetId: 'vid_threshold_announcement',
        fileName: 'video/threshold_announcement.mp4',
    };
}
