import { NextRequest, NextResponse } from 'next/server';
import { getCampaignBlueprint, getAestheticBrief, saveAestheticBrief } from '@/lib/campaigns/campaign-store';
import { runValidationOrchestration } from '@/lib/campaigns/aesthetic-validation-orchestrator';

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

        const { redTeamReview, issueLedger, remediationPlan, updatedBrief } =
            await runValidationOrchestration(campaign, brief);

        await saveAestheticBrief(updatedBrief);

        const blockerCount = issueLedger.filter(i => i.severity === 'blocker').length;
        const warningCount = issueLedger.filter(i => i.severity === 'warning').length;
        const deterministicCount = remediationPlan.deterministicIssueIds.length;
        const llmPatchCount = remediationPlan.llmPatchIssueIds.length;

        return NextResponse.json(
            {
                success: true,
                brief: updatedBrief,
                redTeamVerdict: redTeamReview.verdict,
                issueLedger,
                remediationPlan,
                summary: {
                    totalIssues: issueLedger.length,
                    blockerCount,
                    warningCount,
                    deterministicCount,
                    llmPatchCount,
                    regenerationSteps: remediationPlan.regenerationSteps,
                    manualEscalations: remediationPlan.manualEscalations.length,
                },
                message: blockerCount > 0
                    ? `Validation found ${blockerCount} blocker(s) and ${warningCount} warning(s). Run remediate to fix.`
                    : warningCount > 0
                        ? `Validation passed with ${warningCount} warning(s). Consider running remediate.`
                        : 'Validation passed — no issues found.',
            },
            { status: 200 },
        );
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Aesthetic Validate Error]:', error);
        return NextResponse.json(
            { error: 'Failed to run aesthetic validation', details: message },
            { status: 500 },
        );
    }
}
