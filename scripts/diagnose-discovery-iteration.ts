import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { runDiscoveryRedTeamReview } from '@/lib/campaigns/discovery-red-team';
import {
    applyDiscoveryReviewIteration,
    buildDiscoveryFingerprint,
} from '@/lib/campaigns/discovery-iteration';
import { prepareDiscoveryRevision } from '@/lib/campaigns/discovery-revision';
import type { Campaign } from '@/lib/campaigns/types';

type StepReviewSummary = {
    verdict: 'pass' | 'warn' | 'block';
    blockerCount: number;
    warningCount: number;
    issueCategories: string[];
    requiredFixes: string[];
    approvalRecommendation: string;
    recommendedNextAction?: string;
    stagnant?: boolean;
    stagnationReason?: string;
    retiredAt?: string;
    retirementReason?: string;
    improvement?: {
        resolvedIssueCategories: string[];
        persistingIssueCategories: string[];
        repeatedIssueSignature: boolean;
        fingerprintSimilarity: number;
    };
};

type PricingSnapshot = {
    pricingStatus?: Campaign['pricingStatus'];
    cbagenttoolsGroupId?: string;
    cbagenttoolsBookingLink?: string;
    cbPriceAdvantage?: number;
    matchedShipName?: string;
    matchedSailDate?: string;
    matchedDeparturePort?: string;
    matchedNights?: string;
};

function getArgValue(flag: string): string | undefined {
    const index = process.argv.indexOf(flag);
    if (index === -1) {
        return undefined;
    }

    return process.argv[index + 1];
}

function hasFlag(flag: string): boolean {
    return process.argv.includes(flag);
}

function snapshotPricing(campaign: Campaign): PricingSnapshot {
    return {
        pricingStatus: campaign.pricingStatus,
        cbagenttoolsGroupId: campaign.cbagenttoolsGroupId,
        cbagenttoolsBookingLink: campaign.cbagenttoolsBookingLink,
        cbPriceAdvantage: campaign.cbPriceAdvantage,
        matchedShipName: campaign.matchedShipName,
        matchedSailDate: campaign.matchedSailDate,
        matchedDeparturePort: campaign.matchedDeparturePort,
        matchedNights: campaign.matchedNights,
    };
}

function summarizeReview(campaign: Campaign): StepReviewSummary {
    const review = campaign.discoveryRedTeamReview;
    if (!review) {
        throw new Error('Expected discoveryRedTeamReview to be present for summary generation.');
    }

    const blockerCount = review.issues.filter((issue) => issue.severity === 'blocker').length;
    const warningCount = review.issues.filter((issue) => issue.severity === 'warning').length;
    const lastEvent = campaign.discoveryIteration?.history.at(-1);

    return {
        verdict: review.verdict,
        blockerCount,
        warningCount,
        issueCategories: review.issues.map((issue) => issue.category),
        requiredFixes: review.requiredFixes,
        approvalRecommendation: review.approvalRecommendation,
        recommendedNextAction: campaign.discoveryIteration?.recommendedNextAction,
        stagnant: campaign.discoveryIteration?.stagnant,
        stagnationReason: campaign.discoveryIteration?.stagnationReason,
        retiredAt: campaign.discoveryIteration?.retiredAt,
        retirementReason: campaign.discoveryIteration?.retirementReason,
        improvement: lastEvent?.improvement,
    };
}

function buildReviewAppliedCampaign(campaign: Campaign, label: string) {
    return runDiscoveryRedTeamReview(campaign).then((review) => {
        const updatedCampaign: Campaign = {
            ...applyDiscoveryReviewIteration(campaign, review),
            discoveryRedTeamReview: review,
            updatedAt: new Date().toISOString(),
        };

        return {
            label,
            campaign: updatedCampaign,
            summary: summarizeReview(updatedCampaign),
        };
    });
}

function printSection(title: string, value: unknown): void {
    console.log(`\n=== ${title} ===`);
    console.log(JSON.stringify(value, null, 2));
}

async function main(): Promise<void> {
    const slug = getArgValue('--slug') ?? process.argv[2];
    if (!slug) {
        throw new Error('Usage: npx tsx scripts/diagnose-discovery-iteration.ts --slug <campaign-slug> [--write-report]');
    }

    const baseline = await getCampaignBlueprint(slug);
    if (!baseline) {
        throw new Error(`Campaign not found: ${slug}`);
    }

    const baselineFingerprint = buildDiscoveryFingerprint(baseline);
    const baselinePricing = snapshotPricing(baseline);
    const baselineIteration = baseline.discoveryIteration ?? null;

    const initialReviewStep = await buildReviewAppliedCampaign(baseline, 'initial-review');
    const preparedRevision = await prepareDiscoveryRevision(initialReviewStep.campaign, [initialReviewStep.campaign]);
    const revisedCampaign = preparedRevision.campaign;
    const revisedPricing = snapshotPricing(revisedCampaign);
    const revisedFingerprint = buildDiscoveryFingerprint(revisedCampaign);
    const postRevisionReviewStep = await buildReviewAppliedCampaign(revisedCampaign, 'post-revision-review');

    const matchStateRemoved = (
        (baselinePricing.pricingStatus === 'CB_MATCHED' || !!baselinePricing.cbagenttoolsGroupId || !!baselinePricing.matchedShipName)
        && !revisedPricing.pricingStatus
        && !revisedPricing.cbagenttoolsGroupId
        && !revisedPricing.matchedShipName
        && !revisedPricing.matchedSailDate
    );

    const report = {
        slug,
        generatedAt: new Date().toISOString(),
        baseline: {
            name: baseline.name,
            targetDates: baseline.targetDates,
            targetDestination: baseline.targetDestination,
            shipTarget: baseline.shipTarget,
            pricing: baselinePricing,
            fingerprint: baselineFingerprint,
            discoveryIteration: baselineIteration,
            storedReview: baseline.discoveryRedTeamReview
                ? {
                    verdict: baseline.discoveryRedTeamReview.verdict,
                    issueCategories: baseline.discoveryRedTeamReview.issues.map((issue) => issue.category),
                    requiredFixes: baseline.discoveryRedTeamReview.requiredFixes,
                }
                : null,
        },
        initialReview: initialReviewStep.summary,
        revisionPreparation: {
            revisionMode: preparedRevision.revisionMode,
            branchesConsidered: preparedRevision.branchesConsidered,
            selectionRationale: preparedRevision.selectionRationale,
            message: preparedRevision.message,
            revisedName: revisedCampaign.name,
            revisedTargetDates: revisedCampaign.targetDates,
            revisedShipTarget: revisedCampaign.shipTarget,
            revisedPricing,
            revisedFingerprint,
            matchStateRemoved,
            revisionHistoryTail: revisedCampaign.discoveryIteration?.history.slice(-2) ?? [],
        },
        postRevisionReview: postRevisionReviewStep.summary,
        verdictProgression: {
            initial: initialReviewStep.summary.verdict,
            afterRevision: postRevisionReviewStep.summary.verdict,
        },
        nextActionProgression: {
            afterInitialReview: initialReviewStep.summary.recommendedNextAction,
            afterRevisionSave: revisedCampaign.discoveryIteration?.recommendedNextAction,
            afterPostRevisionReview: postRevisionReviewStep.summary.recommendedNextAction,
        },
    };

    printSection('Baseline', report.baseline);
    printSection('Initial Review', report.initialReview);
    printSection('Revision Preparation', report.revisionPreparation);
    printSection('Post-Revision Review', report.postRevisionReview);
    printSection('Progression', {
        verdictProgression: report.verdictProgression,
        nextActionProgression: report.nextActionProgression,
    });

    if (hasFlag('--write-report')) {
        const outputDir = path.join(process.cwd(), '.github', 'data', 'diagnostics');
        mkdirSync(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, `${slug}-iteration-report.json`);
        writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
        console.log(`\nReport written to ${outputPath}`);
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
});