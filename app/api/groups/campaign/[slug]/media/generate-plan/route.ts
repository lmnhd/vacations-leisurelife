import { NextRequest, NextResponse } from 'next/server';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { getMediaManifest } from '@/lib/campaigns/media/media-store';
import { AssetRecord } from '@/lib/campaigns/schema';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/groups/campaign/[slug]/media/generate-plan
// Preflight diagnostic — resolves exactly what the pipeline would do for
// storyboard video generation without calling RunwayML.
// ────────────────────────────────────────────────────────────────────────────

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
    const { slug } = await params;

    const [brief, manifest] = await Promise.all([
        getAestheticBrief(slug),
        getMediaManifest(slug),
    ]);

    if (!brief) {
        return NextResponse.json({ error: `No brief found for campaign: ${slug}` }, { status: 404 });
    }
    if (!brief.productionBible) {
        return NextResponse.json({ error: 'Brief has no Production Bible' }, { status: 422 });
    }

    const sceneLibrary = brief.productionBible.sceneLibrary;
    const storyboards = brief.productionBible.storyboards;

    // Build sceneImageMap from existing manifest
    const sceneImageRecords: AssetRecord[] = manifest?.images.sceneImages ?? [];
    const sceneImageMap: Record<string, { url: string; assetId: string }> = {};
    for (const rec of sceneImageRecords) {
        const sceneIdTag = rec.tags.find(t => t !== 'scene' && t !== 'revised');
        if (sceneIdTag) {
            sceneImageMap[sceneIdTag] = { url: rec.url, assetId: rec.assetId };
        }
    }

    const missingScenes = sceneLibrary
        .map(s => s.sceneId)
        .filter(id => !sceneImageMap[id]);

    const existingVideos = {
        tiktok_seed_video: !!manifest?.videos.tiktokSeed,
        hero_explainer_video: !!manifest?.videos.heroExplainer,
        threshold_video: !!manifest?.videos.thresholdAnnouncement,
    };

    const storyboardPlans = storyboards.map(sb => {
        const delivId = sb.deliverableId;
        const assetType = delivId.startsWith('tiktok') ? 'tiktok_seed_video'
            : delivId.startsWith('hero') ? 'hero_explainer_video'
            : delivId.startsWith('threshold') ? 'threshold_video'
            : delivId.startsWith('countdown') ? 'countdown_video'
            : 'broll_clip';

        const alreadyInManifest = (existingVideos as Record<string, boolean>)[assetType] ?? false;

        const shots = sb.shotSequence.map((shot, idx) => {
            const resolved = sceneImageMap[shot.sceneId];
            return {
                shotIndex: idx + 1,
                sceneId: shot.sceneId,
                imageUrl: resolved?.url ?? null,
                imageAssetId: resolved?.assetId ?? null,
                imageFound: !!resolved,
                cameraMovement: shot.cameraMovement,
                subjectMotion: shot.subjectMotion,
                environmentMotion: shot.environmentMotion,
                emotionalBeat: shot.emotionalBeat,
            };
        });

        const shotsWithMissingImage = shots.filter(s => !s.imageFound).length;

        return {
            deliverableId: delivId,
            assetType,
            alreadyInManifest,
            totalShots: shots.length,
            shotsWithMissingImage,
            willUseFallbackForShots: shotsWithMissingImage,
            shots,
        };
    });

    return NextResponse.json({
        slug,
        sceneLibraryCount: sceneLibrary.length,
        sceneImagesInManifest: sceneImageRecords.length,
        missingScenes,
        storyboards: storyboardPlans,
    });
}
