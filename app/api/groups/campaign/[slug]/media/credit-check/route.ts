import { NextRequest, NextResponse } from 'next/server';
import { checkMediaCredits, estimateCampaignCost } from '@/lib/campaigns/media/credit-check-service';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/groups/campaign/[slug]/media/credit-check
//
// Returns a cost estimate + live balance check for all media generation services.
// Designed for both UI display and agent pre-flight checks.
//
// Query params:
//   sceneCount  — number of scenes in the Production Bible (default: 10)
//   estimateOnly — if "true", skips live balance queries (faster, no API calls)
// ────────────────────────────────────────────────────────────────────────────

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);

    const sceneCount = parseInt(searchParams.get('sceneCount') ?? '10', 10);
    const estimateOnly = searchParams.get('estimateOnly') === 'true';

    try {
        if (estimateOnly) {
            const estimate = estimateCampaignCost(sceneCount);
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

        const result = await checkMediaCredits(sceneCount);

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
