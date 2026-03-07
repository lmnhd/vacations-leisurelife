import { NextRequest, NextResponse } from 'next/server';
import { RUNWAYML_CONFIG } from '@/lib/campaigns/media/media-pipeline-config';
import { storeAsset } from '@/lib/campaigns/media/storage-client';
import { CREDIT_COSTS } from '@/lib/campaigns/media/credit-check-service';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/runway-test
//
// Generates a SINGLE short RunwayML clip from a source image + motion prompt.
// Used exclusively for prompt iteration and tuning — NOT part of the main pipeline.
//
// Cost: 5s = 25 credits ($0.25) | 10s = 50 credits ($0.50)
// Returns: { videoUrl, taskId, durationSeconds, creditsUsed }
// ────────────────────────────────────────────────────────────────────────────

interface RunwayTestRequestBody {
    sourceImageUrl: string;
    motionPrompt: string;
    durationSeconds?: 5 | 10;
    label?: string;
}

interface RunwayTestResult {
    videoUrl: string;
    taskId: string;
    durationSeconds: number;
    creditsUsed: number;
    label: string;
    motionPrompt: string;
    sourceImageUrl: string;
}

interface RunwayCreateResponse {
    id: string;
}

interface RunwayStatusResponse {
    status: string;
    output?: string[];
    error?: string;
}

function getApiKey(): string {
    const key = process.env.RUNWAYML_API_KEY;
    if (!key) throw new Error('RUNWAYML_API_KEY not set');
    return key;
}

async function createTestClip(
    sourceImageUrl: string,
    motionPrompt: string,
    durationSeconds: 5 | 10
): Promise<{ videoUrl: string; taskId: string }> {
    const response = await fetch(`${RUNWAYML_CONFIG.apiBase}/image_to_video`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${getApiKey()}`,
            'Content-Type': 'application/json',
            'X-Runway-Version': RUNWAYML_CONFIG.apiVersion,
        },
        body: JSON.stringify({
            model: RUNWAYML_CONFIG.model,
            promptImage: sourceImageUrl,
            promptText: motionPrompt.slice(0, RUNWAYML_CONFIG.motionPromptMaxChars),
            duration: durationSeconds,
            ratio: RUNWAYML_CONFIG.outputRatio,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`RunwayML create error ${response.status}: ${errorText}`);
    }

    const createData = await response.json() as RunwayCreateResponse;
    const taskId = createData.id;

    for (let attempt = 0; attempt < RUNWAYML_CONFIG.maxPollAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, RUNWAYML_CONFIG.pollIntervalMs));

        const statusResponse = await fetch(`${RUNWAYML_CONFIG.apiBase}/tasks/${taskId}`, {
            headers: {
                'Authorization': `Bearer ${getApiKey()}`,
                'X-Runway-Version': RUNWAYML_CONFIG.apiVersion,
            },
        });

        if (!statusResponse.ok) continue;

        const statusData = await statusResponse.json() as RunwayStatusResponse;

        if (statusData.status === 'SUCCEEDED' && statusData.output?.[0]) {
            return { videoUrl: statusData.output[0], taskId };
        }

        if (statusData.status === 'FAILED') {
            throw new Error(`RunwayML task ${taskId} failed: ${statusData.error ?? 'unknown'}`);
        }
    }

    throw new Error(`RunwayML task ${taskId} timed out after ${RUNWAYML_CONFIG.maxPollAttempts} polls`);
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;

    let body: RunwayTestRequestBody;
    try {
        body = await request.json() as RunwayTestRequestBody;
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { sourceImageUrl, motionPrompt, durationSeconds = 5, label = 'test' } = body;

    if (!sourceImageUrl || !motionPrompt) {
        return NextResponse.json(
            { error: 'sourceImageUrl and motionPrompt are required' },
            { status: 400 }
        );
    }

    if (durationSeconds !== 5 && durationSeconds !== 10) {
        return NextResponse.json(
            { error: 'durationSeconds must be 5 or 10' },
            { status: 400 }
        );
    }

    try {
        const { videoUrl: runwayUrl, taskId } = await createTestClip(sourceImageUrl, motionPrompt, durationSeconds);

        // Download and re-host on R2 so the signed RunwayML URL doesn't expire
        const videoResponse = await fetch(runwayUrl);
        if (!videoResponse.ok) throw new Error(`Failed to download RunwayML output: ${videoResponse.status}`);
        const buffer = Buffer.from(await videoResponse.arrayBuffer());

        const timestamp = Date.now();
        const safeLabel = label.replace(/[^a-z0-9_-]/gi, '_').slice(0, 40);
        const assetId = `runway_test_${slug}_${safeLabel}_${timestamp}`;
        const fileName = `video/runway_test/${slug}/${safeLabel}_${timestamp}.mp4`;

        const persistedUrl = await storeAsset(slug, assetId, fileName, buffer, 'video/mp4');

        const creditsUsed = durationSeconds * CREDIT_COSTS.runway.creditsPerSecond;

        const result: RunwayTestResult = {
            videoUrl: persistedUrl,
            taskId,
            durationSeconds,
            creditsUsed,
            label,
            motionPrompt,
            sourceImageUrl,
        };

        return NextResponse.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
