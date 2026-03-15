import { z } from 'zod';
import { callGlobalGenerateObject } from '@/lib/chat/llm-call';
import { ModelName } from '@/lib/ai/llm-gateway';
import { getCampaignBlueprint, getAestheticBrief, saveAestheticBrief } from '@/lib/campaigns/campaign-store';
import { CampaignAestheticBriefSchema, ProductionBibleSchema, LandingStillBibleSchema } from '@/lib/campaigns/schema';

// ────────────────────────────────────────────────────────────────────────────
// Schemas
// ────────────────────────────────────────────────────────────────────────────

// OpenAI strict-mode requires every property to appear in `required`.
// Zod .optional() removes fields from `required`, causing a 400.
// Override optional brief fields as .nullable() so the model can return null
// instead of omitting the key. We strip nulls before persisting.
const AestheticRevisionBriefSchema = CampaignAestheticBriefSchema.omit({
    redTeamReview: true,
    humanReviewStatus: true,
    revisionNotes: true,
    productionBible: true,
    landingStillBible: true,
}).extend({
    productionBible: ProductionBibleSchema.nullable(),
    landingStillBible: LandingStillBibleSchema.nullable(),
});

const AestheticRevisionCandidateSchema = z.object({
    brief: AestheticRevisionBriefSchema,
    revisionSummary: z.string(),
    addressedFixes: z.array(z.string()),
    unresolvedRisks: z.array(z.string()).nullable(),
});

// ────────────────────────────────────────────────────────────────────────────
// Public result type
// ────────────────────────────────────────────────────────────────────────────

export interface AestheticRevisionResult {
    brief: z.infer<typeof CampaignAestheticBriefSchema>;
    message: string;
    revisionSummary: string;
    addressedFixes: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Core function
// ────────────────────────────────────────────────────────────────────────────

export async function reviseAestheticBrief(slug: string): Promise<AestheticRevisionResult> {
    const [campaign, brief] = await Promise.all([
        getCampaignBlueprint(slug),
        getAestheticBrief(slug),
    ]);

    if (!campaign) {
        throw new Error('Campaign not found');
    }
    if (!brief) {
        throw new Error('Aesthetic brief not found');
    }
    if (!brief.redTeamReview) {
        const NO_REVIEW_ERROR = `No red-team review found for brief "${slug}". Run red team first, then revise.`;
        throw new Error(NO_REVIEW_ERROR);
    }

    const review = brief.redTeamReview;

    const systemPrompt = `You are revising a Leisure Life Interactive shadow-group campaign aesthetic brief.
Your sole job is to address the stored red-team findings and produce a clean, improved version of the brief.

Revision rules:
- Treat every item in requiredFixes as a mandatory change, not a suggestion.
- Directly close each blocker: replace ship-implausible scenes, remove disallowed visuals, fix compliance-risk copy.
- Preserve the campaign's existing strengths unless a flagged issue requires replacing them.
- Keep the same campaign slug and niche identity unless the review proves the current execution is impossible.
- Improve with the minimum changes needed to clear review — do not widen into a generic luxury cruise campaign.
- Remove or reframe compliance-risk scarcity copy.
- Strip non-viable production instructions; label synthetic/AI-only shots explicitly if retained.
- Preserve optionality and anti-workshop logic throughout all sections.
- Do not invent new gimmicks unrelated to the review findings.
- Do not retain disallowed mechanics simply because they were present before.
- Produce a concise revisionSummary explaining exactly what changed and why.
- List each required fix you addressed in addressedFixes.
- List any risks you could not fully resolve in unresolvedRisks.`;

    const prompt = {
        campaignMetadata: {
            id: campaign.id,
            name: campaign.name,
            description: campaign.description,
            targetDates: campaign.targetDates,
            targetDestination: campaign.targetDestination,
            shipTarget: campaign.shipTarget,
            researchRationale: campaign.researchRationale,
            successLogic: campaign.successLogic,
            audienceSignals: campaign.audienceSignals,
            vacationFitRationale: campaign.vacationFitRationale,
            cruiseNativeMoments: campaign.cruiseNativeMoments,
            nicheExpressionMode: campaign.nicheExpressionMode,
            implausibleLiteralizations: campaign.implausibleLiteralizations,
            allowedThemeSignals: campaign.allowedThemeSignals,
            discouragedThemeSignals: campaign.discouragedThemeSignals,
            communityFitRationale: campaign.communityFitRationale,
            optionalGatheringMoments: campaign.optionalGatheringMoments,
            optionalityStyle: campaign.optionalityStyle,
            solitudeRisks: campaign.solitudeRisks,
        },
        currentBrief: brief,
        redTeamReviewToAddress: review,
        instructions: 'Rewrite the brief so it addresses all requiredFixes and major issues. Keep slug unchanged.',
    };

    const { object } = await callGlobalGenerateObject({
        system: systemPrompt,
        prompt: JSON.stringify(prompt),
        schema: AestheticRevisionCandidateSchema,
        modelName: ModelName.GPT_5_HIGH,
    });

    const revisedBrief = CampaignAestheticBriefSchema.parse({
        ...object.brief,
        // Strip nulls — the model returns null for missing bibles; persisted schema uses undefined
        productionBible: object.brief.productionBible ?? undefined,
        landingStillBible: object.brief.landingStillBible ?? undefined,
        slug: brief.slug,
        generatedAt: brief.generatedAt,
        generatedBy: brief.generatedBy,
        humanReviewStatus: 'revised' as const,
        redTeamReview: undefined,
        revisionNotes: object.revisionSummary,
    });

    await saveAestheticBrief(revisedBrief);

    return {
        brief: revisedBrief,
        message: 'Aesthetic brief revised successfully. Re-run red team to score the updated brief before approving.',
        revisionSummary: object.revisionSummary,
        addressedFixes: object.addressedFixes,
    };
}
