import { NextRequest, NextResponse } from 'next/server';
import { getAestheticBrief, getCampaignBlueprint, saveAestheticBrief } from '@/lib/campaigns/campaign-store';
import { runAestheticRedTeamReview } from '@/lib/campaigns/aesthetic-red-team';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const [campaign, brief] = await Promise.all([
            getCampaignBlueprint(slug),
            getAestheticBrief(slug),
        ]);

        if (!campaign) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }
        if (!brief) {
            return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
        }

        // Parse optional re-review context from body
        let priorRequiredFixes: string[] | undefined;
        try {
            const body = await req.json() as Record<string, unknown>;
            if (Array.isArray(body.priorRequiredFixes)) {
                priorRequiredFixes = body.priorRequiredFixes as string[];
            }
        } catch {
            // No body or invalid JSON — proceed without re-review mode
        }

        const review = await runAestheticRedTeamReview(campaign, brief, { priorRequiredFixes });
        const updatedBrief = {
            ...brief,
            redTeamReview: review,
            humanReviewStatus: review.verdict === 'pass' ? brief.humanReviewStatus : 'revised' as const,
        };

        await saveAestheticBrief(updatedBrief);

        return NextResponse.json({ success: true, review, brief: updatedBrief }, { status: 200 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Aesthetic Red Team Error]:', error);
        return NextResponse.json(
            { error: 'Failed to run red-team review', details: message },
            { status: 500 },
        );
    }
}