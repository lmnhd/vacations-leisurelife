import { NextRequest, NextResponse } from 'next/server';
import { storeAsset } from '@/lib/campaigns/media/storage-client';
import { CREDIT_COSTS } from '@/lib/campaigns/media/credit-check-service';
import { getActiveVideoProviderInstance } from '@/lib/campaigns/media/video-providers/provider-registry';

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
    assetId: string;
    videoUrl: string;
    taskId: string;
    durationSeconds: number;
    creditsUsed: number;
    fileSizeBytes: number;
    mimeType: string;
    label: string;
    motionPrompt: string;
    sourceImageUrl: string;
    createdAt: string;
}

async function createTestClip(
    sourceImageUrl: string,
    motionPrompt: string,
    durationSeconds: 5 | 10
): Promise<{ videoUrl: string; taskId: string }> {
    const provider = getActiveVideoProviderInstance();
    const result = await provider.generateImageToVideo(sourceImageUrl, motionPrompt, durationSeconds);
    return {
        videoUrl: result.videoUrl,
        taskId: result.taskId ?? 'provider-task',
    };
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
        const createdAt = new Date().toISOString();

        const timestamp = Date.now();
        const safeLabel = label.replace(/[^a-z0-9_-]/gi, '_').slice(0, 40);
        const assetId = `runway_test_${slug}_${safeLabel}_${timestamp}`;
        const fileName = `video/runway_test/${slug}/${safeLabel}_${timestamp}.mp4`;

        const persistedUrl = await storeAsset(slug, assetId, fileName, buffer, 'video/mp4');

        const creditsUsed = durationSeconds * CREDIT_COSTS.runway.creditsPerSecond;

        const result: RunwayTestResult = {
            assetId,
            videoUrl: persistedUrl,
            taskId,
            durationSeconds,
            creditsUsed,
            fileSizeBytes: buffer.length,
            mimeType: 'video/mp4',
            label,
            motionPrompt,
            sourceImageUrl,
            createdAt,
        };

        return NextResponse.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
