import { z } from 'zod';
import { callGlobalGenerateObject } from '@/lib/chat/llm-call';
import { ModelName } from '@/lib/ai/llm-gateway';
import { getCampaignBlueprint, getAestheticBrief, saveAestheticBrief } from '@/lib/campaigns/campaign-store';
import { CampaignAestheticBriefSchema, ProductionBibleSchema, LandingStillBibleSchema } from '@/lib/campaigns/schema';

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const MAX_NON_IMPROVING_CYCLES = 2;

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
    revisionCycleCount: true,
    productionBible: true,
    landingStillBible: true,
    productionBuildLint: true,
    productionBuildStatus: true,
    productionBuildEvaluatedAt: true,
    modificationHistory: true,
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
    /** The requiredFixes from the red-team review that was addressed. Pass to red-team re-review. */
    priorRequiredFixes: string[];
    revisionCycleCount: number;
}

export interface AestheticDeadlockResult {
    deadlock: true;
    message: string;
    revisionCycleCount: number;
    survivingFixes: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Core function
// ────────────────────────────────────────────────────────────────────────────

export async function reviseAestheticBrief(
    slug: string,
): Promise<AestheticRevisionResult | AestheticDeadlockResult> {
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
    const currentCycle = (brief.revisionCycleCount ?? 0) + 1;

    // ── Deadlock detection ──────────────────────────────────────────────────
    if (currentCycle > MAX_NON_IMPROVING_CYCLES) {
        return {
            deadlock: true,
            message: `Revision deadlock after ${currentCycle - 1} cycles. The same class of issues survived multiple revisions. Operator intervention required.`,
            revisionCycleCount: currentCycle - 1,
            survivingFixes: review.requiredFixes,
        };
    }

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
- List any risks you could not fully resolve in unresolvedRisks.

MANDATORY SWEEPS — Before returning, verify every one of these:
1. TIME STRINGS: No precise times (HH:MM format like 08:30 or 17:30) in any field. Replace with colloquial anchors ("around breakfast," "before dinner") or broad non-colon windows. Numeric ranges with colons are banned everywhere.
2. QUEUE/DEVICE: No device handling in active queues anywhere in the brief. Recognition near lines must be verbal-only under 5 seconds. Phone sharing must specify "once seated" or "at adjacent seating."
3. VENUE NAMING: All venue labels must be generic (e.g., "café window seats," "buffet window," "atrium") unless the brief explicitly documents written approval for a branded name.
4. AVATAR/TOOL: avatarRequired must be false on ALL video concepts. Tool must not be "heygen" unless explicitly permitted. Convert any avatar-required spots to VO over scenery.
5. RAIL SAFETY: Every rail scene must specify "forearms resting lightly, torso upright, hands inside rail line" in subjectAction or subjectMotion.
6. MERCH DISCLAIMER: If merch CTAs exist, at least one placement includes "Optional—no identifiers needed" or equivalent.
7. PRIVACY: Social captions, copy framing rules, and email body directions must include a privacy line ("share your own photos; avoid filming others") where filming or photos are mentioned.
8. FILMING PERMISSIONS: Production notes must include a hard gate blocking onboard capture without written ship/operator approval, with a fallback to synthetic/stock-only assets.`;

    const prompt = {
        campaignContext: {
            name: campaign.name,
            targetDates: campaign.targetDates,
            targetDestination: campaign.targetDestination,
            shipTarget: campaign.shipTarget,
            audienceSignals: campaign.audienceSignals,
        },
        currentBrief: brief,
        redTeamReviewToAddress: review,
        instructions: 'Rewrite the brief so it addresses all requiredFixes and major issues. Run every mandatory sweep before returning. Keep slug unchanged.',
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
        revisionCycleCount: currentCycle,
        redTeamReview: undefined,
        revisionNotes: object.revisionSummary,
    });

    await saveAestheticBrief(revisedBrief);

    return {
        brief: revisedBrief,
        message: 'Aesthetic brief revised successfully. Re-run red team to score the updated brief before approving.',
        revisionSummary: object.revisionSummary,
        addressedFixes: object.addressedFixes,
        priorRequiredFixes: review.requiredFixes,
        revisionCycleCount: currentCycle,
    };
}
