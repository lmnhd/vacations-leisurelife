import { z } from 'zod';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { ModelName, getModelConfig } from '@/lib/ai/llm-gateway';
import { ProductionBibleSchema, LandingStillBibleSchema } from '../../schema';
import type { TrinityAgent, TrinityAgentContext, TrinityAgentResult, TrinityFeedbackItem } from '../types';

// ────────────────────────────────────────────────────────────────────────────
// Schema — Builder produces ONLY production artifacts
// ────────────────────────────────────────────────────────────────────────────

const BuilderOutputSchema = z.object({
    productionBible: ProductionBibleSchema,
    landingStillBible: LandingStillBibleSchema,
});

// ────────────────────────────────────────────────────────────────────────────
// Prompt builders — pure string functions, no conditional logic inside prompts
// ────────────────────────────────────────────────────────────────────────────

const BUILDER_SYSTEM_GENERATION = `
You are the Production Builder in the Trinity aesthetic pipeline for Leisure Life Interactive.

Your role is exclusive to production planning: the productionBible (sceneLibrary + storyboards) and landingStillBible.
You do not touch messaging, visual identity, community expression, or merch. Those belong to the Designer.

PRODUCTION RULES:
- Every scene in sceneLibrary must be filmable on a real cruise ship without special equipment.
- Forbidden camera moves: crane, dolly, tracking shots, slider, cable cam. Use handheld, steadicam, or static only.
- No interior-window cabin contradictions: interior staterooms never have ocean views in the same scene.
- No gangway exchange choreography of any kind.
- Storyboard shotSequence durations must sum exactly to totalDurationSeconds.
- globalDirectionNotes MUST include the exact sentence: "Passenger-area capture rules: max two-person crew, one off-frame spotter, off-peak capture only, maintain single-file keep-right flow, and stand down immediately if passenger traffic builds or flow is impeded."
- Scenes must read cruise-first. Niche identity emerges through subject actions, not onboard signage or infrastructure.
- Vary ship reference categories across the scene library: exterior, pool_deck, dining, stateroom, atrium, nightclub, spa, destination_port, theater, sports_deck.
- Landing stills must cover hero_primary, hero_alt, concept, email_header, and social_square usages.
- avoidDirectives must capture concrete prohibitions derived from the brief avoidList and plausibilityFramework.

DELIVERABLE STORYBOARDS:
Generate storyboards for at minimum: tiktok_seed (15s), hero_explainer (60s), threshold_announcement (30s), countdown_1 (10s).
`.trim();

const BUILDER_SYSTEM_REVISION = `
You are the Production Builder in the Trinity aesthetic pipeline for Leisure Life Interactive.

You are in a revision round. The Reviewer has returned structured feedback targeting your production artifacts.

REVISION RULES:
- Address each feedback item listed in REVIEWER_FEEDBACK exactly as described.
- Do not modify fields not mentioned in the feedback.
- globalDirectionNotes must always retain the full safety-ops sentence — never remove it.
- All kernel constraints remain in effect:
  - No crane/dolly/tracking camera moves
  - No interior-window contradictions
  - No gangway exchange choreography
  - Storyboard durations must still sum exactly
- Produce the complete productionBible and landingStillBible in the output even for minor patches.
`.trim();

function buildBriefContext(context: TrinityAgentContext): string {
    const { brief, campaign } = context;

    return [
        `Campaign: ${campaign.name}`,
        `Ship: ${campaign.shipTarget ?? campaign.matchedShipName ?? 'TBD'}`,
        `Destination: ${campaign.targetDestination ?? 'TBD'}`,
        `Sail Date: ${campaign.matchedSailDate ?? 'TBD'}`,
        `Nights: ${campaign.matchedNights ?? 'TBD'}`,
        '',
        `CREATIVE_BRIEF:\n${JSON.stringify({
            visual: brief.visual,
            messaging: brief.messaging,
            communityExpression: brief.communityExpression,
            audio: brief.audio,
            videoConcepts: brief.videoConcepts,
        }, null, 2)}`,
    ].join('\n');
}

function buildGenerationPrompt(context: TrinityAgentContext): string {
    const briefCtx = buildBriefContext(context);
    return `${briefCtx}\n\nGenerate the productionBible and landingStillBible for this campaign. All kernel constraints must be satisfied.`;
}

function buildRevisionPrompt(context: TrinityAgentContext, feedback: TrinityFeedbackItem[]): string {
    const feedbackJson = JSON.stringify(feedback, null, 2);
    const currentProduction = JSON.stringify({
        productionBible: context.brief.productionBible,
        landingStillBible: context.brief.landingStillBible,
    }, null, 2);

    return [
        buildBriefContext(context),
        `\nCURRENT_PRODUCTION:\n${currentProduction}`,
        `\nREVIEWER_FEEDBACK:\n${feedbackJson}`,
        `\nRevise productionBible and landingStillBible to address all REVIEWER_FEEDBACK items. Return both complete artifacts.`,
    ].join('');
}

// ────────────────────────────────────────────────────────────────────────────
// Agent implementation
// ────────────────────────────────────────────────────────────────────────────

function resolveBuilderFeedback(context: TrinityAgentContext): TrinityFeedbackItem[] {
    return context.history
        .filter((turn) => turn.agent === 'reviewer' && !turn.decision.approved)
        .flatMap((turn) => turn.decision.feedback)
        .filter((item) => item.targetRole === 'builder');
}

export const trinityBuilderAgent: TrinityAgent = {
    name: 'builder',

    async run(context: TrinityAgentContext): Promise<TrinityAgentResult> {
        const modelConfig = getModelConfig(ModelName.GPT_5_HIGH);
        const model = openai(modelConfig.apiId ?? 'gpt-4o');

        const builderFeedback = resolveBuilderFeedback(context);
        const isRevisionRound = builderFeedback.length > 0;

        const hasExistingProduction = !!(context.brief.productionBible && context.brief.landingStillBible);
        const needsGeneration = !hasExistingProduction || isRevisionRound;

        if (!needsGeneration) {
            console.log(`[trinity:builder] round=${context.round} skipping — production artifacts already present, no feedback`);
            return {
                brief: context.brief,
                decision: { approved: true, feedback: [] },
            };
        }

        const systemPrompt = isRevisionRound ? BUILDER_SYSTEM_REVISION : BUILDER_SYSTEM_GENERATION;
        const userPrompt = isRevisionRound
            ? buildRevisionPrompt(context, builderFeedback)
            : buildGenerationPrompt(context);

        console.log(`[trinity:builder] round=${context.round} revision=${isRevisionRound} feedbackItems=${builderFeedback.length}`);

        const { object } = await generateObject({
            model,
            schema: BuilderOutputSchema,
            system: systemPrompt,
            prompt: userPrompt,
        });

        const updatedBrief = {
            ...context.brief,
            productionBible: object.productionBible,
            landingStillBible: object.landingStillBible,
        };

        return {
            brief: updatedBrief,
            decision: { approved: true, feedback: [] },
        };
    },
};
