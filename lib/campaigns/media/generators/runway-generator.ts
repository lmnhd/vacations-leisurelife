import { CampaignAestheticBrief } from '../../schema';

// ────────────────────────────────────────────────────────────────────────────
// RunwayML Gen-3 Alpha Video Generator
// Image-to-video for countdown clips and cinematic B-roll.
// API: https://api.dev.runwayml.com/v1
// ────────────────────────────────────────────────────────────────────────────

const RUNWAY_API_BASE = 'https://api.dev.runwayml.com/v1';
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 60;

function getApiKey(): string {
    const key = process.env.RUNWAYML_API_KEY;
    if (!key) throw new Error('RUNWAYML_API_KEY not set in environment');
    return key;
}

interface RunwayVideoResult {
    videoUrl: string;
    durationSeconds: number;
}

async function createImageToVideo(
    sourceImageUrl: string,
    motionPrompt: string,
    durationSeconds: number = 10
): Promise<RunwayVideoResult> {
    const apiKey = getApiKey();

    const response = await fetch(`${RUNWAY_API_BASE}/image_to_video`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'X-Runway-Version': '2024-11-06',
        },
        body: JSON.stringify({
            model: 'gen3a_turbo',
            promptImage: sourceImageUrl,
            promptText: motionPrompt.slice(0, 512),
            duration: durationSeconds,
            ratio: '1280:768',
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`RunwayML create error ${response.status}: ${errorText}`);
    }

    const createData = await response.json() as { id: string };
    const taskId = createData.id;

    // Poll for completion
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

        const statusResponse = await fetch(`${RUNWAY_API_BASE}/tasks/${taskId}`, {
            headers: { 'Authorization': `Bearer ${apiKey}`, 'X-Runway-Version': '2024-11-06' },
        });

        if (!statusResponse.ok) continue;

        const statusData = await statusResponse.json() as {
            status: string;
            output?: string[];
        };

        if (statusData.status === 'SUCCEEDED' && statusData.output?.[0]) {
            return {
                videoUrl: statusData.output[0],
                durationSeconds,
            };
        }

        if (statusData.status === 'FAILED') {
            throw new Error(`RunwayML task ${taskId} failed`);
        }
    }

    throw new Error(`RunwayML task ${taskId} timed out`);
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

/**
 * 3× countdown videos (15s each): "3 cabins remaining", "2 remaining", "1 remaining"
 */
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

    for (let i = 0; i < countdownLabels.length; i++) {
        const result = await createImageToVideo(heroImageUrl, countdownMotions[i], 10);
        const buffer = await downloadVideo(result.videoUrl);

        results.push({
            buffer,
            motionPrompt: countdownMotions[i],
            durationSeconds: result.durationSeconds,
            assetId: `vid_countdown_${countdownLabels[i]}`,
            fileName: `video/countdown_${countdownLabels[i]}.mp4`,
        });
    }

    return results;
}

/**
 * 3–4× cinematic B-roll clips (6–10s) — atmospheric motion from hero images.
 */
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
        const result = await createImageToVideo(heroImageUrls[i], brollMotions[i], 10);
        const buffer = await downloadVideo(result.videoUrl);
        const idx = String(i + 1).padStart(3, '0');

        results.push({
            buffer,
            motionPrompt: brollMotions[i],
            durationSeconds: result.durationSeconds,
            assetId: `vid_broll_${idx}`,
            fileName: `video/broll_${idx}.mp4`,
        });
    }

    return results;
}
