import { NextRequest, NextResponse } from 'next/server';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { calculateElevenLabsCreditsRequired, checkMediaCredits, estimateCampaignCost } from '@/lib/campaigns/media/credit-check-service';
import { ELEVENLABS_CONFIG } from '@/lib/campaigns/media/media-pipeline-config';
import { resolveVideoModelPresetIdFromRequest } from '@/lib/campaigns/media/video-model-preference';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/groups/campaign/[slug]/media/credit-check
//
// Returns a cost estimate + live balance check for all media generation services.
// Designed for both UI display and agent pre-flight checks.
//
// Query params:
//   sceneCount  — number of scenes in the Production Bible (default: 10)
//   estimateOnly — if "true", skips live balance queries (faster, no API calls)
//   storyboardDeliverableIds — optional comma-separated storyboard deliverable ids to scope video estimates
// ────────────────────────────────────────────────────────────────────────────

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);

    const sceneCount = parseInt(searchParams.get('sceneCount') ?? '10', 10);
    const estimateOnly = searchParams.get('estimateOnly') === 'true';
    const videoModelPresetId = await resolveVideoModelPresetIdFromRequest(request, searchParams.get('videoModelPresetId'));
    const storyboardDeliverableIds = (searchParams.get('storyboardDeliverableIds') ?? '')
        .split(',')
        .map((deliverableId) => deliverableId.trim())
        .filter(Boolean);

    const brief = await getAestheticBrief(slug);
    const storyboardNarrationScripts = brief?.productionBible?.storyboards
        ?.filter((storyboard) => storyboardDeliverableIds.length === 0 || storyboardDeliverableIds.includes(storyboard.deliverableId))
        .map((storyboard) => storyboard.narrationScript) ?? [];
    const scopedElevenLabsCredits = calculateElevenLabsCreditsRequired({
        storyboardNarrationScripts,
        ambientNarrationScript: storyboardDeliverableIds.length === 0 ? brief?.audio.ambientNarrationScript?.slice(0, ELEVENLABS_CONFIG.narrationMaxChars) : undefined,
        hypeClipScript: undefined,
    });

    try {
        if (estimateOnly) {
            const estimate = estimateCampaignCost(
                sceneCount,
                storyboardDeliverableIds.length > 0 ? storyboardDeliverableIds : undefined,
                scopedElevenLabsCredits,
                videoModelPresetId,
            );
            return NextResponse.json({
                slug,
                estimateOnly: true,
                estimate,
                canProceed: null,
                balances: [],
                summary: `Estimate only (no live balance check). Total: ~$${estimate.totalUsd.toFixed(2)}`,
                blockers: [],
            });
        }

        const result = await checkMediaCredits(
            sceneCount,
            storyboardDeliverableIds.length > 0 ? storyboardDeliverableIds : undefined,
            scopedElevenLabsCredits,
            videoModelPresetId,
        );

        return NextResponse.json({
            slug,
            estimateOnly: false,
            ...result,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
