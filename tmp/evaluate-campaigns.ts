import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

import { getCampaignBlueprint, getAestheticBrief } from '../lib/campaigns/campaign-store';
import { getReadiness } from '../lib/campaigns/brief-engine/orchestrator';
import { validateBrief } from '../lib/campaigns/brief-engine/validation';

const slugs = process.argv.slice(2);

async function main(): Promise<void> {
    if (slugs.length === 0) {
        console.error('Usage: npx tsx tmp/evaluate-campaigns.ts <slug> [slug...]');
        process.exit(1);
    }

    for (const slug of slugs) {
        const campaign = await getCampaignBlueprint(slug);
        const brief = await getAestheticBrief(slug);

        console.log(`=== ${slug} ===`);

        if (!campaign) {
            console.log(JSON.stringify({ slug, error: 'campaign_not_found' }, null, 2));
            continue;
        }

        const readinessResult = await getReadiness(slug).catch((error: unknown) => ({
            error: error instanceof Error ? error.message : String(error),
        }));

        const validation = brief ? validateBrief(brief, campaign) : null;
        const blockers = validation?.issues.filter((issue) => issue.severity === 'blocker') ?? [];
        const warnings = validation?.issues.filter((issue) => issue.severity === 'warning') ?? [];

        console.log(JSON.stringify({
            slug,
            campaignName: campaign.name,
            targetDates: campaign.targetDates ?? null,
            matchedSailDate: campaign.matchedSailDate ?? null,
            pricingStatus: campaign.pricingStatus ?? null,
            aestheticBriefStatus: campaign.aestheticBriefStatus ?? null,
            readiness: 'error' in readinessResult ? readinessResult : {
                readiness: readinessResult.readiness,
                summary: readinessResult.summary,
                campaignName: readinessResult.campaignName,
                issueCount: readinessResult.issues.length,
                blockerCount: readinessResult.issues.filter((issue) => issue.severity === 'blocker').length,
                warningCount: readinessResult.issues.filter((issue) => issue.severity === 'warning').length,
            },
            hasBrief: Boolean(brief),
            humanReviewStatus: brief?.humanReviewStatus ?? null,
            revisionCycleCount: brief?.revisionCycleCount ?? null,
            productionBuildStatus: brief?.productionBuildStatus ?? null,
            productionBuildLintVerdict: brief?.productionBuildLint?.verdict ?? null,
            productionBuildBlockingIssueCodes: brief?.productionBuildLint?.blockingIssues?.map((issue) => issue.code) ?? [],
            productionBuildWarningIssueCodes: brief?.productionBuildLint?.warnings?.map((issue) => issue.code) ?? [],
            hasProductionBible: Boolean(brief?.productionBible),
            hasLandingStillBible: Boolean(brief?.landingStillBible),
            issueLedgerCount: brief?.issueLedger?.length ?? 0,
            activeRemediationPlan: brief?.activeRemediationPlan ?? null,
            revisionNotes: brief?.revisionNotes ?? null,
            heroSlogan: brief?.messaging?.heroSlogan ?? null,
            subSlogan: brief?.messaging?.subSlogan ?? null,
            participationStyle: brief?.communityExpression?.participationStyle ?? null,
            blockerCount: blockers.length,
            blockerCodes: blockers.map((issue) => issue.code),
            warningCount: warnings.length,
            warningCodes: warnings.map((issue) => issue.code),
        }, null, 2));
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});