import { NextRequest, NextResponse } from 'next/server';
import { reviseAestheticBrief } from '@/lib/campaigns/aesthetic-revision';
import { getCampaignBlueprint, getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { suggestDeterministicIssueCodes } from '@/lib/campaigns/aesthetic-modification';

export async function POST(
    _req: NextRequest,
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
            return NextResponse.json({ error: 'Aesthetic brief not found' }, { status: 404 });
        }
        if (!brief.redTeamReview) {
            return NextResponse.json(
                { error: 'No red-team review to revise from. Run red team first.' },
                { status: 409 },
            );
        }

        const result = await reviseAestheticBrief(slug);

        // Deadlock — return 409 so the UI can show operator escalation
        if ('deadlock' in result) {
            const review = brief.redTeamReview;
            const issues = review?.issues?.map(i => i.title) ?? [];
            const requiredFixes = (review?.requiredFixes ?? []).join(' ');
            const suggestedDeterministicFixes = suggestDeterministicIssueCodes(issues, requiredFixes);
            return NextResponse.json(
                {
                    deadlock: true,
                    message: result.message,
                    revisionCycleCount: result.revisionCycleCount,
                    survivingFixes: result.survivingFixes,
                    suggestedDeterministicFixes,
                    canUseDeterministicModify: suggestedDeterministicFixes.length > 0,
                },
                { status: 409 },
            );
        }

        return NextResponse.json(
            {
                success: true,
                brief: result.brief,
                message: result.message,
                revisionSummary: result.revisionSummary,
                addressedFixes: result.addressedFixes,
                priorRequiredFixes: result.priorRequiredFixes,
                revisionCycleCount: result.revisionCycleCount,
                autoReviewVerdict: result.autoReviewVerdict,
            },
            { status: 200 },
        );
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Aesthetic Revision Error]:', error);
        return NextResponse.json(
            { error: 'Failed to revise aesthetic brief', details: message },
            { status: 500 },
        );
    }
}
