import { callGlobalGenerateObject } from '@/lib/chat/llm-call';
import { modelForTask } from '@/lib/ai/llm-gateway';
import { getCampaignBlueprint, upsertCampaignResearchDossier } from '@/lib/campaigns/campaign-store';
import {
    CampaignResearchDossierCanonicalSchema,
    normalizeCampaignResearchDossier,
    type CampaignResearchDossier,
} from '@/lib/campaigns/schema';
import type { Campaign } from '@/lib/campaigns/types';

// ────────────────────────────────────────────────────────────────────────────
// Secondary Campaign Research — Phase 1.5
//
// Generates a lightweight, campaign-specific research dossier AFTER a campaign
// blueprint has been approved and selected. This is a depth pass, not a second
// ideation pass: it deepens the already-chosen campaign so downstream brief,
// media, copy, and distribution systems can execute with specificity.
//
// Reference: .github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/README.md
// (Proposed Refactor: Phase 1.5 Secondary Campaign Research)
// ────────────────────────────────────────────────────────────────────────────

export interface DossierGenerationResult {
    dossier: CampaignResearchDossier;
    generatedAt: string;
    regenerated: boolean;
}

function hasApprovedBlueprintContext(campaign: Campaign): boolean {
    return Boolean(campaign.researchRationale && (campaign.audienceSignals?.length ?? 0) > 0);
}

function buildNicheResearchContext(campaign: Campaign): Record<string, unknown> {
    return {
        slug: campaign.id,
        name: campaign.name,
        description: campaign.description,
        aesthetic: campaign.aesthetic ?? null,
        researchRationale: campaign.researchRationale ?? null,
        successLogic: campaign.successLogic ?? null,
        audienceSignals: campaign.audienceSignals ?? [],
        nicheExpressionMode: campaign.nicheExpressionMode ?? null,
        allowedThemeSignals: campaign.allowedThemeSignals ?? [],
        discouragedThemeSignals: campaign.discouragedThemeSignals ?? [],
    };
}

const SYSTEM_PROMPT = `You are running Phase 1.5 of the Leisure Life Interactive shadow-group pipeline: a SECONDARY campaign research pass.

A campaign blueprint has already been approved and a specific campaign has been selected. Your job is not to re-litigate the campaign concept. It is to deepen it with grounded, current, niche-literate detail that downstream brief, media, copy, and distribution systems can consume directly.

Rules:
- This is a DEPTH pass, not a second ideation pass. Do not invent a new campaign concept or pivot the niche.
- Stay tightly scoped to the SELECTED campaign. No broad slate analysis.
- Research the niche itself, not cruise tourism. Do not frame the analysis as wellness travel, wellness cruises, cruise activities, ship amenities, or destination packaging.
- Assume the niche already exists outside travel. Study its current routines, language, examples, and trend cycle first.
- Only the downstream translation fields should mention cruise-plausible moments or onboard adaptation.
- Prefer current, present-day specificity over evergreen-generic phrasing.
- Synthesize over explore. Lean on the supplied campaign context first; only add new detail where it is plausibly current and useful downstream.
- Favor concrete, sensory, behavioral detail (props, routines, phrases, rituals, conversation hooks) over abstract vibe language.
- Distinguish "insider-true" from "lazy stereotype." Mark stereotypes that should be avoided.
- All recommendations must remain cruise-plausible. No on-shore-only programming, no lab/retreat/residency formats, no operationally-heavy mechanics.
- Keep entries short and skimmable. Each array item should be a usable downstream cue, not a paragraph.
- Do NOT produce essays. Structured, scannable detail beats prose every time.
- Do NOT widen into a generic luxury cruise pitch.
- Output must conform exactly to the requested schema.

Schema field guidance:
- nicheResearch.nicheTitle: short, specific label for the campaign niche as currently expressed (not the campaign name).
- nicheResearch.trendCycleSummary: one tight paragraph on where this niche is in its current trend cycle.
- nicheResearch.whyThisTrendFeelsDistinctNow: one tight paragraph on what makes the present moment different from evergreen treatment.
- nicheResearch.audienceRoutineInsights: how people in this niche actually spend time and participate today.
- nicheResearch.specificExamples: concrete instances, products, formats, communities, or behaviors that illustrate the niche right now.
- nicheResearch.allowedSignals: props, phrases, rituals, micro-behaviors that read as insider-true and feel current.
- nicheResearch.discouragedSignals: cliché, outdated, costume-logic, or cruise-implausible reads to avoid.
- nicheResearch.sourceNotes (optional): short notes on what reasoning or external context shaped the dossier.
- cruiseTranslation.cruiseNativeTranslationNotes: how to translate the niche into believable cruise moments without overstaging.
- cruiseTranslation.downstreamImplications.briefDirection: specific guidance for the aesthetic brief engine.
- cruiseTranslation.downstreamImplications.mediaGeneration: specific guidance for image, video, and storyboard prompts.
- cruiseTranslation.downstreamImplications.copyDirection: specific guidance for captions, landing copy, and ads.`;

/**
 * Generates the secondary campaign research dossier for an already-approved,
 * already-selected campaign. Persists the dossier on the campaign METADATA
 * record (`researchDossier` field).
 *
 * Throws if the campaign does not exist or has not been through the discovery
 * pass that the dossier is meant to deepen.
 */
export async function generateCampaignResearchDossier(
    slug: string,
    options?: { force?: boolean },
): Promise<DossierGenerationResult> {
    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        throw new Error(`Campaign not found: ${slug}`);
    }

    if (!hasApprovedBlueprintContext(campaign)) {
        throw new Error(
            `Cannot generate research dossier for "${slug}": the campaign blueprint is missing approved discovery context (researchRationale / audienceSignals). Run discovery first.`,
        );
    }

    const existingDossier = campaign.researchDossier ?? null;
    if (existingDossier && !options?.force) {
        return {
            dossier: existingDossier,
            generatedAt: campaign.updatedAt,
            regenerated: false,
        };
    }

    const promptPayload = {
        instructions: 'Produce a Campaign Research Dossier that deepens the selected campaign with grounded, current, niche-literate specificity. Output must match the schema exactly and keep pure niche research separated from cruise translation.',
        campaignContext: buildNicheResearchContext(campaign),
        constraints: [
            'Do not rename or repivot the campaign.',
            'Do not research cruise tourism or ship operations as the primary topic.',
            'Favor present-day specificity over evergreen language.',
            'Mark cliché reads as discouraged signals rather than including them as allowed.',
            'Write nicheResearch first. Keep cruiseTranslation separate and limited to cruise-plausible adaptation.',
        ],
    };

    console.log(`[campaign-research] Generating research dossier for "${slug}"...`);

    const { object: dossier } = await callGlobalGenerateObject({
        system: SYSTEM_PROMPT,
        prompt: JSON.stringify(promptPayload),
        schema: CampaignResearchDossierCanonicalSchema,
        modelName: modelForTask('reasoning'),
        operationName: 'campaign-research-dossier',
        maxOutputTokens: 4000,
    });

    await upsertCampaignResearchDossier(slug, dossier);

    console.log(`[campaign-research] ✅ Research dossier persisted for "${slug}"`);

    return {
        dossier,
        generatedAt: new Date().toISOString(),
        regenerated: Boolean(existingDossier),
    };
}

/**
 * Lightweight read for the dossier currently persisted on the campaign record.
 * Returns `null` if no dossier has been generated yet.
 */
export async function getCampaignResearchDossier(
    slug: string,
): Promise<CampaignResearchDossier | null> {
    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        throw new Error(`Campaign not found: ${slug}`);
    }
    return normalizeCampaignResearchDossier(campaign.researchDossier);
}
