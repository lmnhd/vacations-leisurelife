import { NextRequest, NextResponse } from 'next/server';
import { storeAsset } from '@/lib/campaigns/media/storage-client';
import { buildProductionSafeMotionPrompt } from '@/lib/campaigns/media/generators/runway-generator';
import { getVideoProviderForPreset } from '@/lib/campaigns/media/video-providers/provider-registry';
import { getPreferredTestDurationSeconds, getVideoModelPreset } from '@/lib/campaigns/media/video-models';
import { resolveVideoModelPresetIdFromRequest } from '@/lib/campaigns/media/video-model-preference';

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
    durationSeconds?: number;
    label?: string;
    videoModelPresetId?: string;
}

interface RunwayTestResult {
    assetId: string;
    videoUrl: string;
    taskId: string;
    durationSeconds: number;
    estimatedCostUsd: number;
    estimatedCreditsUsed: number | null;
    creditsUsed: number | null;
    videoModelPresetId: string;
    videoModelLabel: string;
    fileSizeBytes: number;
    mimeType: string;
    label: string;
    motionPrompt: string;
    submittedMotionPrompt: string;
    sourceImageUrl: string;
    createdAt: string;
}

async function createTestClip(
    sourceImageUrl: string,
    motionPrompt: string,
    durationSeconds: number,
    videoModelPresetId: string,
): Promise<{ videoUrl: string; taskId: string }> {
    const provider = getVideoProviderForPreset(videoModelPresetId as never);
    const result = await provider.generateImageToVideo(sourceImageUrl, motionPrompt, durationSeconds, { presetId: videoModelPresetId as never });
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

    const presetId = await resolveVideoModelPresetIdFromRequest(request, body.videoModelPresetId);
    const preset = getVideoModelPreset(presetId);
    const requestedDurationSeconds = typeof body.durationSeconds === 'number' ? body.durationSeconds : undefined;
    const durationSeconds = getPreferredTestDurationSeconds(presetId, requestedDurationSeconds);
    const { sourceImageUrl, motionPrompt, label = 'test' } = body;
    const effectiveMotionPrompt = buildProductionSafeMotionPrompt(motionPrompt);

    if (!sourceImageUrl || !motionPrompt) {
        return NextResponse.json(
            { error: 'sourceImageUrl and motionPrompt are required' },
            { status: 400 }
        );
    }

    try {
        const { videoUrl: runwayUrl, taskId } = await createTestClip(sourceImageUrl, effectiveMotionPrompt, durationSeconds, presetId);

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

        const estimatedCreditsUsed = preset.estimatedCreditsPerSecond !== null
            ? durationSeconds * preset.estimatedCreditsPerSecond
            : null;
        const estimatedCostUsd = durationSeconds * preset.estimatedUsdPerSecond;

        const result: RunwayTestResult = {
            assetId,
            videoUrl: persistedUrl,
            taskId,
            durationSeconds,
            estimatedCostUsd,
            estimatedCreditsUsed,
            creditsUsed: estimatedCreditsUsed,
            videoModelPresetId: preset.id,
            videoModelLabel: preset.label,
            fileSizeBytes: buffer.length,
            mimeType: 'video/mp4',
            label,
            motionPrompt: effectiveMotionPrompt,
            submittedMotionPrompt: motionPrompt,
            sourceImageUrl,
            createdAt,
        };

        return NextResponse.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
