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

function pinMatchedShipFields<T extends z.infer<typeof DiscoveryBlueprintSchema>>(
    blueprint: T,
    campaign: Campaign,
): T {
    const matchedShipName = campaign.matchedShipName?.trim();
    if (!matchedShipName) {
        return blueprint;
    }

    return {
        ...blueprint,
        shipTarget: matchedShipName,
    };
}

function buildBannedStructuresContext(campaign: Campaign): string {
    const history = campaign.discoveryIteration?.history ?? [];
    const currentReview = campaign.discoveryRedTeamReview;

    const collectedFixes: string[] = [];

    for (const event of history) {
        if (event.eventType === 'review' && event.requiredFixes.length > 0) {
            collectedFixes.push(...event.requiredFixes);
        }
    }

    if (currentReview?.requiredFixes?.length) {
        collectedFixes.push(...currentReview.requiredFixes);
    }

    if (collectedFixes.length === 0) {
        return '';
    }

    const uniqueFixes = Array.from(new Set(collectedFixes.map((fix) => fix.trim()).filter(Boolean)));

    return `\n\nBANNED PATTERNS — required fixes that have failed to be resolved across prior iterations.\nNo branch candidate may reproduce any of the following structures, framing, or venue references:\n${uniqueFixes.map((fix) => `  BANNED: ${fix}`).join('\n')}`;
}

const VISION_CLASS_SHIPS = new Set(['rhapsody of the seas', 'vision of the seas', 'grandeur of the seas', 'enchantment of the seas']);
const RADIANCE_CLASS_SHIPS = new Set(['brilliance of the seas', 'radiance of the seas', 'jewel of the seas', 'serenade of the seas']);

function normalizeShipName(value: string): string {
    return value.toLowerCase().replace(/[^a-z\s]/g, '').trim();
}

function buildShipAuthorityContext(campaign: Campaign): string {
    const matchedShip = campaign.matchedShipName;
    if (!matchedShip?.trim()) {
        return '';
    }

    const shipKey = normalizeShipName(matchedShip);
    const lines: string[] = [
        `\n\nSHIP AUTHORITY — MANDATORY CONSTRAINTS FOR ALL BRANCH CANDIDATES:`,
        `Authoritative ship: ${matchedShip}`,
        `Rule: Every candidate must set shipTarget to "${matchedShip}".`,
        `Rule: All venue, deck, and layout references must be real spaces that exist on ${matchedShip}.`,
        `Rule: Remove all references to any other cruise line, ship class, or ship not matching ${matchedShip}.`,
    ];

    if (VISION_CLASS_SHIPS.has(shipKey)) {
        lines.push(`Ship class: Royal Caribbean Vision-class`);
        lines.push(`BANNED on Vision-class (these venues do not exist): Virgin Voyages branding, Sip venue, Dock House, Scarlet Lady, Valiant Lady, adults-only framing, Central Park, Boardwalk, Royal Promenade, zip line, Trellis Bar, Aqua Theater, Oasis jogging track`);
        lines.push(`AVAILABLE on Vision-class: Schooner Bar, Centrum atrium, Boleros lounge, Viking Crown Lounge, Windjammer Café, pool deck, outdoor promenade decks, Solarium, Romeo and Juliet dining`);
    } else if (RADIANCE_CLASS_SHIPS.has(shipKey)) {
        lines.push(`Ship class: Royal Caribbean Radiance-class`);
        lines.push(`BANNED on Radiance-class (these venues do not exist): Virgin Voyages branding, Sip venue, Dock House, adults-only framing, Central Park, Boardwalk, Royal Promenade, zip line, Trellis Bar, Aqua Theater, wraparound jogging track, Oasis-class deck layout`);
        lines.push(`AVAILABLE on Radiance-class: Deck 5 Promenade walkway (pedestrian walkway — NOT a jogging track), Centrum atrium, Colony Club, Schooner Bar, pool deck, Windjammer, outdoor promenades, Solarium, Chops Grille`);
        lines.push(`IMPORTANT for Radiance-class: The Deck 5 area is a walkway for pedestrian traffic, not a dedicated jogging/running track. Any gathering format must keep the lane clear and cannot depend on 'bays' carved out of an athletic track.`);
    }

    return lines.join('\n');
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
${JSON.stringify(revisionCandidate.discoveryIteration ?? null, null, 2)}${siblingContext}

REQUIRED JSON STRUCTURE:
{
  "blueprint": { /* Full DiscoveryBlueprint */ },
  "closurePlan": {
    "targetedIssues": ["..."],
    "changesMade": ["..."],
    "successHypothesis": "..."
  }
}`;

    let selectedCandidate: z.infer<typeof DiscoveryRevisionCandidateSchema>;
    let effectiveRevisionMode: DiscoveryRevisionMode = 'single';
    let branchesConsidered = 1;
    let selectionRationale: string | undefined;

    const bannedStructures = buildBannedStructuresContext(revisionCandidate);
    const shipAuthority = buildShipAuthorityContext(revisionCandidate);

    if (revisionMode === 'branch') {
        const branchPrompt = `${prompt}${bannedStructures}${shipAuthority}

BRANCH FORMAT MANDATE:
Produce exactly 3 candidates. Each candidate MUST use a completely different primary delivery format as defined below.
No two candidates may share the same format. The format governs the entire social mechanic — not just venue names.

Candidate 0 format — AMBIENT-DRIFT:
The theme is expressed entirely through distributed artifacts, signals, or cues that guests discover passively as they move through the ship.
There are no scheduled gatherings, no host-announced moments, and no named meeting points.
The community forms through chance encounters and recognizable shared signals, not coordination.

Candidate 1 format — TIME-WINDOWED-CLUSTER:
The theme is expressed through 1-2 brief, optional, time-bounded windows (15-25 minutes each) with a clearly communicated time and a plausible real space on the matched ship.
Guests may join late or leave early with zero social cost. The host manages the window but does not own it.

Candidate 2 format — SHIP-ACTIVITY-LAYER:
The theme is expressed entirely by layering onto activities, meals, or spaces that already exist in the ship's standard programming.
No new rooms, no new schedules, no new host-held logistics are required. Guests experience the theme as a flavor modulation of what they would already be doing.

Requirements for all 3 candidates:
- Begin each candidate's successHypothesis with the format label in brackets, e.g. [AMBIENT-DRIFT], [TIME-WINDOWED-CLUSTER], or [SHIP-ACTIVITY-LAYER].
- No candidate may reference any BANNED PATTERN listed above.
- Every candidate must satisfy all SHIP AUTHORITY rules above.
- Set preferredCandidateIndex to the candidate most likely to clear the next review while staying distinct from sibling campaigns.

REQUIRED JSON STRUCTURE:
{
  "preferredCandidateIndex": 0 | 1 | 2,
  "selectionRationale": "string",
  "candidates": [
    {
      "blueprint": { /* Full DiscoveryBlueprint */ },
      "closurePlan": {
        "targetedIssues": ["..."],
        "changesMade": ["..."],
        "successHypothesis": "..."
      }
    },
    ... (must have exactly 3 candidates)
  ]
}`;

        const { object } = await callGlobalGenerateObject({
            system,
            prompt: branchPrompt,
            schema: DiscoveryBranchRevisionSchema,
            modelName: ModelName.GPT_5_HIGH,
            timeoutMs: 300000,
            maxOutputTokens: 12000,
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
            timeoutMs: 300000,
            maxOutputTokens: 8000,
        });
        selectedCandidate = object;
    }

    const normalizedBlueprint = pinMatchedShipFields(selectedCandidate.blueprint, revisionCandidate);

    assertLaunchWindowCompliance([
        {
            id: normalizedBlueprint.id,
            name: normalizedBlueprint.name,
            targetDates: normalizedBlueprint.targetDates,
        },
    ], now);

    const revisedCampaign = mapDiscoveryBlueprintToCampaign(
        {
            ...normalizedBlueprint,
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