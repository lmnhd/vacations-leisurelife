import { ModelName, getModelConfig } from '@/lib/ai/llm-gateway';
import {
    CampaignAestheticBriefSchema,
    normalizeVisualPlausibilityFramework,
    normalizeHumanRepresentationGuidance,
} from '../../schema';
import type { TrinityAgent, TrinityAgentContext, TrinityAgentResult, TrinityFeedbackItem } from '../types';
import { generateStructuredTrinityObject } from '../structured-generation';

// ────────────────────────────────────────────────────────────────────────────
// Schema — Designer owns creative identity, not production planning artifacts
// ────────────────────────────────────────────────────────────────────────────

const DesignerOutputSchema = CampaignAestheticBriefSchema.omit({
    slug: true,
    themeName: true,
    productionBible: true,
    landingStillBible: true,
    productionBuildLint: true,
    productionBuildStatus: true,
    productionBuildEvaluatedAt: true,
    modificationHistory: true,
    issueLedger: true,
    activeRemediationPlan: true,
    generatedAt: true,
    generatedBy: true,
    humanReviewStatus: true,
    revisionNotes: true,
    redTeamReview: true,
    revisionCycleCount: true,
});

// ────────────────────────────────────────────────────────────────────────────
// Prompt builders — pure string functions, no conditional logic inside prompts
// ────────────────────────────────────────────────────────────────────────────

const DESIGNER_SYSTEM_GENERATION = `
You are the Creative Director (Designer) in the Trinity aesthetic pipeline for Leisure Life Interactive.

Your role is exclusive to creative identity: messaging, visual identity, community expression, merch, audio, social concepts, and video concepts.
You do not write production bibles, storyboards, or scene libraries. Those belong to the Builder.

CREATIVE RULES:
- Campaign must feel cruise-first, ship-first, horizon-first. Niche is a social flavor layer.
- Hero slogan: 6 words maximum. Must be decisive — a verb, contrast, or identity anchor.
- Sub-slogan: sells in one breath. Not a literary description.
- communityExpression must protect optionality: every gathering is drop-in, drop-out.
- Visual plausibilityFramework.governingPrinciple must articulate how the niche appears within believable cruise life.
- humanRepresentation must define cast diversity without tokenism or stereotype.
- Avoid hosted sessions, workshop language, salon events, library infrastructure, organized activations.
- Avoid exclusivity-coded language: quiet-luxe, elevated salon, collector-grade, rarefied.
- Vary niche signals across concepts: object cue, wardrobe cue, posture cue, conversational cue, environmental cue.
- At least half of social/video concepts must signal niche through non-object cues.
- If route context is provided, lightly use destination atmosphere — do not make the campaign excursion-led.
- Do not invent specific excursions or ports unsupported by route context.
- Merch: core item must be a real T-shirt concept. Keep all merch apparel-graphic-first.
`.trim();

const DESIGNER_SYSTEM_REVISION = `
You are the Creative Director (Designer) in the Trinity aesthetic pipeline for Leisure Life Interactive.

You are in a revision round. The Reviewer has returned structured feedback targeting your creative fields.

REVISION RULES:
- Address each feedback item listed in REVIEWER_FEEDBACK exactly as described.
- Do not modify fields that are not mentioned in the feedback.
- Do not regress previously accepted sections to fix an unrelated note.
- Preserve all Builder-owned artifacts (productionBible, landingStillBible) exactly as provided in the current brief — do not touch them.
- Your changes must be the minimum necessary to close the identified issues.
- Feedback items with severity "blocker" must be fully resolved. "warning" items should be addressed if possible without regressing other fields.
`.trim();

function buildCampaignContext(context: TrinityAgentContext): string {
    const { campaign } = context;
    const highlightEvents = (campaign.highlightEvents ?? []).join(', ') || 'None';
    const keywords = (campaign.targetingKeywords ?? []).join(', ') || 'None';

    return [
        `Theme: ${campaign.name}`,
        `Aesthetic: ${campaign.aesthetic ?? 'Determine best fit'}`,
        `Target Keywords: ${keywords}`,
        `Highlight Events: ${highlightEvents}`,
        `Ship: ${campaign.shipTarget ?? campaign.matchedShipName ?? 'TBD'}`,
        `Destination: ${campaign.targetDestination ?? 'TBD'}`,
        `Matched Sail Date: ${campaign.matchedSailDate ?? 'TBD'}`,
        `Departure Port: ${campaign.matchedDeparturePort ?? 'TBD'}`,
        `Duration: ${campaign.matchedNights ?? 'TBD'}`,
        `Vacation Fit: ${campaign.vacationFitRationale ?? 'Not provided'}`,
        `Cruise Native Moments: ${(campaign.cruiseNativeMoments ?? []).join(', ') || 'Not provided'}`,
        `Niche Expression Mode: ${campaign.nicheExpressionMode ?? 'Not provided'}`,
        `Allowed Theme Signals: ${(campaign.allowedThemeSignals ?? []).join(', ') || 'Not provided'}`,
        `Discouraged Theme Signals: ${(campaign.discouragedThemeSignals ?? []).join(', ') || 'Not provided'}`,
        `Implausible Literalizations: ${(campaign.implausibleLiteralizations ?? []).join(', ') || 'Not provided'}`,
        `Community Fit: ${campaign.communityFitRationale ?? 'Not provided'}`,
        `Optional Gatherings: ${(campaign.optionalGatheringMoments ?? []).join(', ') || 'Not provided'}`,
        `Optionality Style: ${campaign.optionalityStyle ?? 'Not provided'}`,
        `Solitude Risks: ${(campaign.solitudeRisks ?? []).join(', ') || 'Not provided'}`,
    ].join('\n');
}

function buildGenerationPrompt(context: TrinityAgentContext): string {
    const campaignCtx = buildCampaignContext(context);
    return `CAMPAIGN_CONTEXT:\n${campaignCtx}\n\nGenerate the complete creative identity for this campaign matching the output schema.`;
}

function buildRevisionPrompt(context: TrinityAgentContext, feedback: TrinityFeedbackItem[]): string {
    const campaignCtx = buildCampaignContext(context);
    const feedbackJson = JSON.stringify(feedback, null, 2);
    const currentBrief = JSON.stringify(context.brief, null, 2);

    return [
        `CAMPAIGN_CONTEXT:\n${campaignCtx}`,
        `\nCURRENT_BRIEF:\n${currentBrief}`,
        `\nREVIEWER_FEEDBACK:\n${feedbackJson}`,
        `\nRevise the creative identity to address all REVIEWER_FEEDBACK items. Return the full updated schema.`,
    ].join('');
}

// ────────────────────────────────────────────────────────────────────────────
// Agent implementation
// ────────────────────────────────────────────────────────────────────────────

function resolveDesignerFeedback(context: TrinityAgentContext): TrinityFeedbackItem[] {
    return context.history
        .filter((turn) => turn.agent === 'reviewer' && !turn.decision.approved)
        .flatMap((turn) => turn.decision.feedback)
        .filter((item) => item.targetRole === 'designer');
}

function replaceDesignerProblemPhrases(value: string): string {
    return value
        .replace(/workshop/gi, 'hangout')
        .replace(/salon/gi, 'conversation')
        .replace(/hosted session/gi, 'casual meetup')
        .replace(/event[- ]program/gi, 'shared ship rhythm')
        .replace(/managed program/gi, 'shared ship energy')
        .replace(/quiet-luxe/gi, 'warm and relaxed')
        .replace(/elevated conversation/gi, 'easy conversation')
        .replace(/collector-grade/gi, 'keepsake-friendly')
        .replace(/rarefied/gi, 'welcoming');
}

function rewriteDesignerStrings<T>(value: T): T {
    if (typeof value === 'string') {
        return replaceDesignerProblemPhrases(value) as T;
    }

    if (Array.isArray(value)) {
        return value.map((item) => rewriteDesignerStrings(item)) as T;
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, nested]) => [key, rewriteDesignerStrings(nested)]),
        ) as T;
    }

    return value;
}

function supportsDeterministicDesignerRevision(feedback: TrinityFeedbackItem[]): boolean {
    const supportedCodes = new Set([
        'workshop_language_survives',
        'optionality_language_missing',
        'exclusive_lifestyle_language',
        'hero_slogan_too_long',
        'merch_not_tshirt_first',
    ]);

    return feedback.length > 0 && feedback.every((item) => supportedCodes.has(item.code));
}

function applyDeterministicDesignerRevision(context: TrinityAgentContext): TrinityAgentResult {
    const rewrittenBrief = rewriteDesignerStrings(context.brief);
    const trimmedHeroSlogan = rewrittenBrief.messaging.heroSlogan
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 6)
        .join(' ')
        .replace(/[\s.,;:!?-]+$/, '');

    return {
        brief: {
            ...rewrittenBrief,
            messaging: {
                ...rewrittenBrief.messaging,
                heroSlogan: trimmedHeroSlogan || rewrittenBrief.messaging.heroSlogan,
            },
            merch: {
                ...rewrittenBrief.merch,
                coreItem: {
                    ...rewrittenBrief.merch.coreItem,
                    productType: 'T-Shirt',
                },
            },
            communityExpression: {
                ...rewrittenBrief.communityExpression,
                participationStyle: 'Entirely optional and low-pressure. Join for a moment, drift out whenever you want, or skip it completely without missing anything.',
                copyFramingRule: 'Use explicitly optional language: join if you like, stay for a minute, or keep moving without missing anything.',
            },
            humanReviewStatus: 'pending' as const,
        },
        decision: {
            approved: true,
            feedback: [],
        },
    };
}

export const trinityDesignerAgent: TrinityAgent = {
    name: 'designer',

    async run(context: TrinityAgentContext): Promise<TrinityAgentResult> {
        const modelConfig = getModelConfig(ModelName.GPT_5_HIGH);

        const designerFeedback = resolveDesignerFeedback(context);
        const isRevisionRound = designerFeedback.length > 0;
        const canApplyDeterministicRevision = supportsDeterministicDesignerRevision(designerFeedback);
        const needsGeneration = isRevisionRound && !canApplyDeterministicRevision;

        if (canApplyDeterministicRevision) {
            console.log(`[trinity:designer] round=${context.round} applying deterministic revision for ${designerFeedback.map((item) => item.code).join(', ')}`);
            return applyDeterministicDesignerRevision(context);
        }

        if (!needsGeneration) {
            console.log(`[trinity:designer] round=${context.round} skipping — existing brief accepted as Trinity starting point`);
            return {
                brief: context.brief,
                decision: {
                    approved: true,
                    feedback: [],
                },
            };
        }

        const systemPrompt = isRevisionRound ? DESIGNER_SYSTEM_REVISION : DESIGNER_SYSTEM_GENERATION;
        const userPrompt = isRevisionRound
            ? buildRevisionPrompt(context, designerFeedback)
            : buildGenerationPrompt(context);

        console.log(`[trinity:designer] round=${context.round} revision=${isRevisionRound} feedbackItems=${designerFeedback.length}`);

        const { object, warnings, modelId } = await generateStructuredTrinityObject({
            preferredModel: ModelName.GPT_5_HIGH,
            schema: DesignerOutputSchema,
            system: systemPrompt,
            prompt: userPrompt,
        });

        if (warnings.length > 0) {
            console.warn(`[trinity:designer] ${warnings.join(' ')}`);
        }

        console.log(`[trinity:designer] using structured model ${modelId} (requested provider=${modelConfig.provider})`);

        const updatedBrief = {
            ...context.brief,
            ...object,
            slug: context.campaign.id,
            themeName: context.campaign.name,
            visual: {
                ...object.visual,
                plausibilityFramework: normalizeVisualPlausibilityFramework(object.visual.plausibilityFramework),
                humanRepresentation: normalizeHumanRepresentationGuidance(object.visual.humanRepresentation),
            },
            generatedAt: context.brief.generatedAt || new Date().toISOString(),
            generatedBy: 'agent' as const,
            humanReviewStatus: 'pending' as const,
            revisionCycleCount: context.brief.revisionCycleCount ?? 0,
        };

        return {
            brief: updatedBrief,
            decision: {
                approved: true,
                feedback: [],
            },
        };
    },
};
