import { z } from 'zod';
import { callGlobalGenerateObject } from '@/lib/chat/llm-call';
import { ModelName } from '@/lib/ai/llm-gateway';
import { getCampaignBlueprint, saveCampaignBlueprint, scanAllCampaigns } from '@/lib/campaigns/campaign-store';
import { DiscoveryBlueprintSchema, mapDiscoveryBlueprintToCampaign } from '@/lib/campaigns/discovery-schema';
import { DiscoveryRevisionClosurePlanSchema, type DiscoveryRevisionMode } from './schema';
import { applyDiscoveryRevisionIteration, getDiscoveryRevisionMode } from './discovery-iteration';
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

export async function reviseDiscoveryBlueprint(slug: string): Promise<DiscoveryRevisionResult> {
    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        throw new Error('Campaign not found');
    }

    const review = campaign.discoveryRedTeamReview;
    if (!review) {
        throw new Error('This blueprint does not have a discovery review to revise from.');
    }

    const revisionMode = getDiscoveryRevisionMode(campaign);
    if (revisionMode === 'retire') {
        throw new Error(campaign.discoveryIteration?.retirementReason ?? 'This blueprint has been retired after repeated non-improvement.');
    }

    const allCampaigns = await scanAllCampaigns();
    const siblingContext = buildSiblingContext(allCampaigns, slug);

    const system = `You are revising a single discovery-stage cruise campaign blueprint for Leisure Life Interactive.
Preserve the core niche if it is salvageable, but rewrite the blueprint so it meaningfully responds to the stored discovery review.

Requirements:
- Keep this as a vacation-first group cruise, never a workshop, retreat, residency, or conference.
- Improve operational plausibility and social logic.
- Make participation ambient and optional.
- Keep the revised blueprint meaningfully distinct from the other existing candidates.
- Every revision must include an issue-closure ledger stating which issues you targeted, what changed, and why the result should clear review.
- If branch mode is requested, produce three materially different correction strategies and identify the strongest one.`;

    const prompt = `Revise this discovery blueprint in place using its stored review.

Rules:
- Keep the existing campaign slug exactly as-is: ${campaign.id}
- You may change the name, description, ship target, destination, copy, social mechanics, and cruise moments if needed.
- Directly address the required fixes and recommendation from the review instead of paraphrasing them.
- If the review passed, preserve the blueprint's strengths while tightening weak spots, optional improvements, or areas that still feel generic.
- If the original concept depended on implausible logistics, replace those mechanics with ship-compatible alternatives while preserving the community identity where possible.
- Do not produce a near-duplicate of the other pipeline candidates.

Current blueprint:
${JSON.stringify(campaign, null, 2)}

Discovery review to satisfy:
${JSON.stringify(review, null, 2)}

Current iteration state:
${JSON.stringify(campaign.discoveryIteration ?? null, null, 2)}${siblingContext}`;

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

    const revisedCampaign = mapDiscoveryBlueprintToCampaign(
        {
            ...selectedCandidate.blueprint,
            id: campaign.id,
        },
        {
            ...campaign,
            pricingStatus: undefined,
            cbagenttoolsGroupId: undefined,
            cbagenttoolsBookingLink: undefined,
            cbPriceAdvantage: undefined,
            matchedShipName: undefined,
            matchedSailDate: undefined,
            matchedDeparturePort: undefined,
            matchedNights: undefined,
            aestheticBriefStatus: undefined,
            aestheticGeneratedAt: undefined,
            discoveryRedTeamReview: undefined,
        },
    );

    const revisedCampaignWithIteration = applyDiscoveryRevisionIteration(
        {
            ...revisedCampaign,
            discoveryRedTeamReview: undefined,
            discoveryIteration: campaign.discoveryIteration,
        },
        selectedCandidate.closurePlan,
        effectiveRevisionMode,
        branchesConsidered,
        selectionRationale,
    );

    await saveCampaignBlueprint({
        ...revisedCampaignWithIteration,
        pricingStatus: undefined,
        cbagenttoolsGroupId: undefined,
        cbagenttoolsBookingLink: undefined,
        cbPriceAdvantage: undefined,
        matchedShipName: undefined,
        matchedSailDate: undefined,
        matchedDeparturePort: undefined,
        matchedNights: undefined,
        aestheticBriefStatus: undefined,
        aestheticGeneratedAt: undefined,
        discoveryRedTeamReview: undefined,
    });

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