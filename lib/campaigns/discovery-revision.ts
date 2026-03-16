import { z } from 'zod';
import { callGlobalGenerateObject } from '@/lib/chat/llm-call';
import { ModelName } from '@/lib/ai/llm-gateway';
import { getCampaignBlueprint, saveCampaignBlueprint, scanAllCampaigns } from '@/lib/campaigns/campaign-store';
import { DiscoveryBlueprintSchema, mapDiscoveryBlueprintToCampaign } from '@/lib/campaigns/discovery-schema';
import { runDiscoveryRedTeamReview } from '@/lib/campaigns/discovery-red-team';
import { assertLaunchWindowCompliance, buildLaunchWindowPromptGuidance } from './launch-window';
import { DiscoveryRevisionClosurePlanSchema, type DiscoveryRevisionMode } from './schema';
import { applyDiscoveryReviewIteration, applyDiscoveryRevisionIteration, getDiscoveryRevisionMode } from './discovery-iteration';
import type { Campaign } from './types';

const DiscoveryRevisionCandidateSchema = z.object({
    blueprint: DiscoveryBlueprintSchema,
    closurePlan: DiscoveryRevisionClosurePlanSchema,
});

const DiscoveryBranchRevisionSchema = z.object({
    preferredCandidateIndex: z.number().int().min(0).max(2),
    selectionRationale: z.string(),
    candidates: z.array(DiscoveryRevisionCandidateSchema).length(3),
});

export interface DiscoveryRevisionResult {
    campaign: Campaign;
    revisionMode: DiscoveryRevisionMode;
    branchesConsidered: number;
    selectionRationale?: string;
    message: string;
}

export interface PreparedDiscoveryRevisionResult {
    campaign: Campaign;
    revisionMode: DiscoveryRevisionMode;
    branchesConsidered: number;
    selectionRationale?: string;
    message: string;
}

function buildSiblingContext(campaigns: Campaign[], currentSlug: string): string {
    const siblings = campaigns.filter((campaign) => campaign.id !== currentSlug);
    if (siblings.length === 0) {
        return '';
    }

    return `\n\nOTHER PIPELINE CANDIDATES TO STAY DISTINCT FROM:\n${siblings.map((campaign) => {
        const verdict = campaign.discoveryRedTeamReview?.verdict ?? 'unreviewed';
        return `- ${campaign.name} [${verdict}] :: ${campaign.description}`;
    }).join('\n')}`;
}

async function refreshRetiredCampaignIfRecoverable(campaign: Campaign): Promise<Campaign> {
    const isRetired = !!campaign.discoveryIteration?.retiredAt
        || campaign.discoveryIteration?.recommendedNextAction === 'retire';

    if (!isRetired) {
        return campaign;
    }

    const refreshedReview = await runDiscoveryRedTeamReview(campaign);

    return {
        ...applyDiscoveryReviewIteration(campaign, refreshedReview),
        discoveryRedTeamReview: refreshedReview,
        updatedAt: new Date().toISOString(),
    };
}

export async function prepareDiscoveryRevision(
    campaign: Campaign,
    availableCampaigns?: Campaign[],
): Promise<PreparedDiscoveryRevisionResult> {
    const now = new Date();
    const revisionCandidate = await refreshRetiredCampaignIfRecoverable(campaign);
    const review = revisionCandidate.discoveryRedTeamReview;
    if (!review) {
        throw new Error('This blueprint does not have a discovery review to revise from.');
    }

    const revisionMode = getDiscoveryRevisionMode(revisionCandidate);
    if (revisionMode === 'retire') {
        throw new Error(revisionCandidate.discoveryIteration?.retirementReason ?? 'This blueprint has been retired after repeated non-improvement.');
    }

    const allCampaigns = availableCampaigns ?? await scanAllCampaigns();
    const siblingContext = buildSiblingContext(allCampaigns, revisionCandidate.id);
    const launchWindowPromptGuidance = buildLaunchWindowPromptGuidance(now);

    const system = `You are revising a single discovery-stage cruise campaign blueprint for Leisure Life Interactive.
Preserve the core niche if it is salvageable, but rewrite the blueprint so it meaningfully responds to the stored discovery review.

Requirements:
- Keep this as a vacation-first group cruise, never a workshop, retreat, residency, or conference.
- Improve operational plausibility and social logic.
- Make participation ambient and optional.
- Keep the revised blueprint meaningfully distinct from the other existing candidates.
- Keep targetDates inside the minimum launch window rule; do not preserve an ineligible sailing just because it was in the original draft.
- Every revision must include an issue-closure ledger stating which issues you targeted, what changed, and why the result should clear review.
- If branch mode is requested, produce three materially different correction strategies and identify the strongest one.`;

    const prompt = `Revise this discovery blueprint in place using its stored review.

Rules:
- Keep the existing campaign slug exactly as-is: ${revisionCandidate.id}
- You may change the name, description, ship target, destination, copy, social mechanics, and cruise moments if needed.
- targetDates must remain parseable as an exact sail date or plain month-year string.
- Directly address the required fixes and recommendation from the review instead of paraphrasing them.
- If the review passed, preserve the blueprint's strengths while tightening weak spots, optional improvements, or areas that still feel generic.
- If the original concept depended on implausible logistics, replace those mechanics with ship-compatible alternatives while preserving the community identity where possible.
- If matchedShipName is present, treat it as the authoritative ship reality for venue/layout compatibility; remove or rewrite stale line-specific references that do not exist on that ship.
- Do not produce a near-duplicate of the other pipeline candidates.

Launch-window guidance:
${launchWindowPromptGuidance}

Current blueprint:
${JSON.stringify(revisionCandidate, null, 2)}

Discovery review to satisfy:
${JSON.stringify(review, null, 2)}

Current iteration state:
${JSON.stringify(revisionCandidate.discoveryIteration ?? null, null, 2)}${siblingContext}`;

    let selectedCandidate: z.infer<typeof DiscoveryRevisionCandidateSchema>;
    let effectiveRevisionMode: DiscoveryRevisionMode = 'single';
    let branchesConsidered = 1;
    let selectionRationale: string | undefined;

    if (revisionMode === 'branch') {
        const branchPrompt = `${prompt}

Branch mode instructions:
- Produce exactly 3 materially different revision candidates.
- Each candidate must solve the review through a different social mechanism or vacation framing, not cosmetic rewording.
- Set preferredCandidateIndex to the candidate most likely to clear the next review while staying distinct from sibling campaigns.`;

        const { object } = await callGlobalGenerateObject({
            system,
            prompt: branchPrompt,
            schema: DiscoveryBranchRevisionSchema,
            modelName: ModelName.GPT_5_HIGH,
        });

        selectedCandidate = object.candidates[object.preferredCandidateIndex];
        effectiveRevisionMode = 'branch3';
        branchesConsidered = 3;
        selectionRationale = object.selectionRationale;
    } else {
        const { object } = await callGlobalGenerateObject({
            system,
            prompt,
            schema: DiscoveryRevisionCandidateSchema,
            modelName: ModelName.GPT_5_HIGH,
        });
        selectedCandidate = object;
    }

    assertLaunchWindowCompliance([
        {
            id: selectedCandidate.blueprint.id,
            name: selectedCandidate.blueprint.name,
            targetDates: selectedCandidate.blueprint.targetDates,
        },
    ], now);

    const revisedCampaign = mapDiscoveryBlueprintToCampaign(
        {
            ...selectedCandidate.blueprint,
            id: revisionCandidate.id,
        },
        {
            ...revisionCandidate,
            aestheticBriefStatus: undefined,
            aestheticGeneratedAt: undefined,
            discoveryRedTeamReview: undefined,
        },
    );

    const revisedCampaignWithIteration = applyDiscoveryRevisionIteration(
        {
            ...revisedCampaign,
            discoveryRedTeamReview: undefined,
            discoveryIteration: revisionCandidate.discoveryIteration,
        },
        selectedCandidate.closurePlan,
        effectiveRevisionMode,
        branchesConsidered,
        selectionRationale,
    );

    return {
        campaign: revisedCampaignWithIteration,
        revisionMode: effectiveRevisionMode,
        branchesConsidered,
        selectionRationale,
        message: effectiveRevisionMode === 'branch3'
            ? `Generated ${branchesConsidered} revision branches and selected the strongest candidate. Re-review the updated blueprint to confirm improvement.`
            : 'Revised the blueprint in place. Re-review the updated blueprint to confirm improvement.',
    };
}

export async function reviseDiscoveryBlueprint(slug: string): Promise<DiscoveryRevisionResult> {
    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        throw new Error('Campaign not found');
    }

    const prepared = await prepareDiscoveryRevision(campaign);

    await saveCampaignBlueprint({
        ...prepared.campaign,
        aestheticBriefStatus: undefined,
        aestheticGeneratedAt: undefined,
        discoveryRedTeamReview: undefined,
    });

    return prepared;
}