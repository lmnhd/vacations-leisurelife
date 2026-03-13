import { NextRequest, NextResponse } from 'next/server';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { getMediaManifest } from '@/lib/campaigns/media/media-store';
import { AssetRecord } from '@/lib/campaigns/schema';
import { analyzeStoryboardShot, buildStoryboardShotPrompt } from '@/lib/campaigns/media/storyboard-motion-policy';

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
            const scene = sceneLibrary.find(s => s.sceneId === shot.sceneId);
            const resolved = sceneImageMap[shot.sceneId];
            const diagnostic = analyzeStoryboardShot(shot, scene);
            const motionPromptPreview = buildStoryboardShotPrompt(shot, brief, scene);
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
                motionRiskLevel: diagnostic.riskLevel,
                motionRiskFlags: diagnostic.riskFlags,
                hasVisiblePeople: diagnostic.hasVisiblePeople,
                sourceImageAdvice: diagnostic.recommendedSourceImageDirection,
                motionPromptPreview,
                promptFitsRunwayBudget: motionPromptPreview.length <= 512,
            };
        });

        const shotsWithMissingImage = shots.filter(s => !s.imageFound).length;
        const missingShotSceneIds = shots.filter(s => !s.imageFound).map(s => s.sceneId);
        const highRiskShotCount = shots.filter(s => s.motionRiskLevel === 'high').length;
        const mediumRiskShotCount = shots.filter(s => s.motionRiskLevel === 'medium').length;

        return {
            deliverableId: delivId,
            assetType,
            alreadyInManifest,
            totalShots: shots.length,
            shotsWithMissingImage,
            missingShotSceneIds,
            highRiskShotCount,
            mediumRiskShotCount,
            readyForStoryboardGeneration: shotsWithMissingImage === 0,
            willFailVideoGeneration: shotsWithMissingImage > 0,
            shots,
        };
    });

    return NextResponse.json({
        slug,
        sceneLibraryCount: sceneLibrary.length,
        sceneImagesInManifest: sceneImageRecords.length,
        missingScenes,
        readyForStoryboardGeneration: missingScenes.length === 0 && storyboardPlans.every(sb => sb.readyForStoryboardGeneration),
        storyboards: storyboardPlans,
    });
}
