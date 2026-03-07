import { NextRequest, NextResponse } from 'next/server';
import { AssetRecord } from '@/lib/campaigns/schema';
import { saveAssetRecord, upsertManifestAssetSection, updateCampaignMediaStatus } from '@/lib/campaigns/media/media-store';

const SINGLE_TARGETS = ['tiktokSeed', 'heroExplainer', 'thresholdAnnouncement'] as const;
const LIST_TARGETS = ['countdown', 'broll'] as const;

function isSingleTarget(value: string): value is typeof SINGLE_TARGETS[number] {
    return SINGLE_TARGETS.includes(value as typeof SINGLE_TARGETS[number]);
}

function isListTarget(value: string): value is typeof LIST_TARGETS[number] {
    return LIST_TARGETS.includes(value as typeof LIST_TARGETS[number]);
}

function mapTargetToAssetType(target: string): AssetRecord['assetType'] {
    if (target === 'tiktokSeed') return 'tiktok_seed_video';
    if (target === 'heroExplainer') return 'hero_explainer_video';
    if (target === 'thresholdAnnouncement') return 'threshold_video';
    if (target === 'countdown') return 'countdown_video';
    return 'broll_clip';
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;

    let body: {
        assetId: string;
        videoUrl: string;
        durationSeconds: number;
        fileSizeBytes: number;
        mimeType: string;
        motionPrompt: string;
        label: string;
        createdAt: string;
        target: string;
        deliverableTag?: string;
    };

    try {
        body = await request.json() as {
            assetId: string;
            videoUrl: string;
            durationSeconds: number;
            fileSizeBytes: number;
            mimeType: string;
            motionPrompt: string;
            label: string;
            createdAt: string;
            target: string;
            deliverableTag?: string;
        };
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!body.assetId || !body.videoUrl || !body.motionPrompt || !body.target) {
        return NextResponse.json({ error: 'assetId, videoUrl, motionPrompt, and target are required' }, { status: 400 });
    }

    if (!isSingleTarget(body.target) && !isListTarget(body.target)) {
        return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
    }

    const promotedAssetId = `${body.assetId}_promoted_${Date.now()}`;
    const targetAssetType = mapTargetToAssetType(body.target);

    const record: AssetRecord = {
        assetId: promotedAssetId,
        assetType: targetAssetType,
        url: body.videoUrl,
        generator: 'runwayml',
        promptUsed: body.motionPrompt,
        durationSeconds: body.durationSeconds,
        fileSizeBytes: body.fileSizeBytes,
        mimeType: body.mimeType,
        tags: [
            'video',
            'promoted_from_runway_test',
            body.target,
            body.label,
            ...(body.deliverableTag ? [body.deliverableTag] : []),
        ],
        createdAt: body.createdAt,
        reviewStatus: 'auto_approved',
        version: 1,
        active: true,
    };

    try {
        await saveAssetRecord(slug, record);

        const manifest = await upsertManifestAssetSection(
            slug,
            body.target,
            isSingleTarget(body.target) ? record : [record]
        );

        await updateCampaignMediaStatus(slug, manifest.completionStatus === 'complete' ? 'ready' : 'partial');

        return NextResponse.json({
            success: true,
            target: body.target,
            asset: record,
            manifest,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
