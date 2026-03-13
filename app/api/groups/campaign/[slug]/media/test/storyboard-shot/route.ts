import { NextRequest, NextResponse } from 'next/server';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { getMediaManifest } from '@/lib/campaigns/media/media-store';
import { buildStoryboardShotPrompt } from '@/lib/campaigns/media/storyboard-motion-policy';
import { buildProductionSafeMotionPrompt } from '@/lib/campaigns/media/generators/runway-generator';
import { getPreferredTestDurationSeconds, getVideoModelPreset } from '@/lib/campaigns/media/video-models';
import { resolveVideoModelPresetIdFromRequest } from '@/lib/campaigns/media/video-model-preference';
import { getVideoProviderForPreset } from '@/lib/campaigns/media/video-providers/provider-registry';
import { storeAsset } from '@/lib/campaigns/media/storage-client';
import { RUNWAYML_CONFIG } from '@/lib/campaigns/media/media-pipeline-config';

interface StoryboardShotRequestBody {
    deliverableId?: string;
    shotNumber?: number;
    videoModelPresetId?: string;
    label?: string;
}

function getActiveSceneImageUrl(slug: string, sceneId: string, manifest: Awaited<ReturnType<typeof getMediaManifest>>) {
    const sceneImage = manifest?.images.sceneImages?.find((record) => record.active && record.tags.includes(sceneId));
    if (!sceneImage) {
        throw new Error(`No active scene image found for ${sceneId} in ${slug}`);
    }

    return sceneImage.url;
}

async function resolveStoryboardShotContext(slug: string, deliverableId: string, shotNumber: number) {
    const [brief, manifest] = await Promise.all([
        getAestheticBrief(slug),
        getMediaManifest(slug),
    ]);

    if (!brief?.productionBible) {
        throw new Error(`No Production Bible found for ${slug}`);
    }

    if (!manifest) {
        throw new Error(`No media manifest found for ${slug}`);
    }

    const storyboard = brief.productionBible.storyboards.find((entry) => entry.deliverableId === deliverableId);
    if (!storyboard) {
        throw new Error(`Storyboard ${deliverableId} not found`);
    }

    const shot = storyboard.shotSequence.find((entry) => entry.shotNumber === shotNumber);
    if (!shot) {
        throw new Error(`Shot ${shotNumber} not found in storyboard ${deliverableId}`);
    }

    const scene = brief.productionBible.sceneLibrary.find((entry) => entry.sceneId === shot.sceneId);
    if (!scene) {
        throw new Error(`Scene ${shot.sceneId} not found in Production Bible`);
    }

    const sourceImageUrl = getActiveSceneImageUrl(slug, shot.sceneId, manifest);
    const basePrompt = buildStoryboardShotPrompt(shot, brief, scene);
    const effectivePrompt = buildProductionSafeMotionPrompt(basePrompt);

    return {
        storyboard,
        shot,
        scene,
        sourceImageUrl,
        basePrompt,
        effectivePrompt,
    };
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const deliverableId = searchParams.get('deliverableId');
    const shotNumber = Number(searchParams.get('shotNumber'));

    if (!deliverableId || !Number.isFinite(shotNumber)) {
        return NextResponse.json({ error: 'deliverableId and numeric shotNumber are required' }, { status: 400 });
    }

    try {
        const presetId = await resolveVideoModelPresetIdFromRequest(request, searchParams.get('videoModelPresetId'));
        const preset = getVideoModelPreset(presetId);
        const context = await resolveStoryboardShotContext(slug, deliverableId, shotNumber);
        const effectiveDurationSeconds = getPreferredTestDurationSeconds(presetId, RUNWAYML_CONFIG.clipDurationSeconds);

        return NextResponse.json({
            deliverableId,
            storyboardTitle: context.storyboard.title,
            shotNumber: context.shot.shotNumber,
            sceneId: context.shot.sceneId,
            sourceImageUrl: context.sourceImageUrl,
            basePrompt: context.basePrompt,
            effectivePrompt: context.effectivePrompt,
            effectiveDurationSeconds,
            presetId: preset.id,
            presetLabel: preset.label,
            shot: context.shot,
            scene: context.scene,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;

    let body: StoryboardShotRequestBody;
    try {
        body = await request.json() as StoryboardShotRequestBody;
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!body.deliverableId || typeof body.shotNumber !== 'number') {
        return NextResponse.json({ error: 'deliverableId and shotNumber are required' }, { status: 400 });
    }

    try {
        const presetId = await resolveVideoModelPresetIdFromRequest(request, body.videoModelPresetId);
        const preset = getVideoModelPreset(presetId);
        const context = await resolveStoryboardShotContext(slug, body.deliverableId, body.shotNumber);
        const durationSeconds = getPreferredTestDurationSeconds(presetId, RUNWAYML_CONFIG.clipDurationSeconds);

        const provider = getVideoProviderForPreset(presetId);
        const result = await provider.generateImageToVideo(
            context.sourceImageUrl,
            context.effectivePrompt,
            durationSeconds,
            { presetId }
        );

        const videoResponse = await fetch(result.videoUrl);
        if (!videoResponse.ok) {
            throw new Error(`Failed to download generated output: ${videoResponse.status}`);
        }

        const buffer = Buffer.from(await videoResponse.arrayBuffer());
        const createdAt = new Date().toISOString();
        const timestamp = Date.now();
        const safeLabel = (body.label ?? `${body.deliverableId}_shot_${body.shotNumber}`).replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
        const assetId = `storyboard_shot_test_${slug}_${safeLabel}_${timestamp}`;
        const fileName = `video/storyboard_shot_test/${slug}/${safeLabel}_${timestamp}.mp4`;
        const persistedUrl = await storeAsset(slug, assetId, fileName, buffer, 'video/mp4');

        return NextResponse.json({
            assetId,
            videoUrl: persistedUrl,
            taskId: result.taskId ?? 'provider-task',
            durationSeconds,
            estimatedCostUsd: durationSeconds * preset.estimatedUsdPerSecond,
            estimatedCreditsUsed: preset.estimatedCreditsPerSecond !== null ? durationSeconds * preset.estimatedCreditsPerSecond : null,
            creditsUsed: preset.estimatedCreditsPerSecond !== null ? durationSeconds * preset.estimatedCreditsPerSecond : null,
            videoModelPresetId: preset.id,
            videoModelLabel: preset.label,
            label: body.label ?? `${body.deliverableId} shot ${body.shotNumber}`,
            motionPrompt: context.effectivePrompt,
            submittedMotionPrompt: context.basePrompt,
            sourceImageUrl: context.sourceImageUrl,
            createdAt,
            deliverableId: body.deliverableId,
            shotNumber: body.shotNumber,
            sceneId: context.shot.sceneId,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}