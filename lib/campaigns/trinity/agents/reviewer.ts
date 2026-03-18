import { z } from 'zod';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { ModelName, getModelConfig } from '@/lib/ai/llm-gateway';
import type { TrinityAgent, TrinityAgentContext, TrinityAgentResult, TrinityFeedbackItem, TrinityAgentTurn } from '../types';

// ────────────────────────────────────────────────────────────────────────────
// Schema — Reviewer outputs a structured decision, not a brief rewrite
// ────────────────────────────────────────────────────────────────────────────

const ReviewerDecisionSchema = z.object({
    approved: z.boolean(),
    reviewSummary: z.string(),
    feedback: z.array(z.object({
        code: z.string(),
        message: z.string(),
        targetRole: z.enum(['designer', 'builder', 'reviewer']),
        severity: z.enum(['warning', 'blocker']),
    })),
});

// ────────────────────────────────────────────────────────────────────────────
// Prompt builders
// ────────────────────────────────────────────────────────────────────────────

const REVIEWER_SYSTEM = `
You are the Reviewer in the Trinity aesthetic pipeline for Leisure Life Interactive.

Your role is final approval or structured rejection. You do not rewrite the brief.

APPROVAL CRITERIA — approve when ALL of the following are true:
- Hero slogan is 6 words or fewer and contains a verb, contrast, or identity anchor
- No hosted-session, workshop, salon, or event-program language survives in any section
- communityExpression protects optionality: participation must feel drop-in, drop-out, and non-mandatory
- No stereotype-driven casting or tokenism in humanRepresentation
- If productionBible is present: no crane/dolly/tracking camera moves, no interior-window contradictions, no gangway exchanges, storyboard durations sum correctly, safety-ops sentence present in globalDirectionNotes
- Cross-artifact coherence: avoidList in the brief is reflected in productionBible avoidDirectives
- No exclusive lifestyle-marketing language: quiet-luxe, elevated salon, collector-grade, rarefied
- Merch core item is T-shirt-first and apparel-graphic-feasible

REJECTION RULES:
- Reject only when one or more blocker-severity issues remain unresolved.
- Warnings alone do not cause rejection.
- Every feedback item must state: code (short snake_case identifier), message (specific evidence), targetRole (designer or builder), severity (blocker or warning).
- Do not reopen issues that were resolved in a prior round unless new evidence exists in this brief.
- If this is a re-review round, compare against the prior reviewer feedback listed in PRIOR_REVIEWER_FEEDBACK and confirm whether each blocker was addressed.

OUTPUT:
- approved: true = all blockers resolved, ready to persist
- approved: false = one or more blockers remain, feedback required
- reviewSummary: one paragraph human-readable verdict
- feedback: structured array, empty if approved
`.trim();

function buildPriorFeedbackContext(priorReviewerTurns: TrinityAgentTurn[]): string {
    if (priorReviewerTurns.length === 0) {
        return 'PRIOR_REVIEWER_FEEDBACK: none — this is the first review round.';
    }

    const latestPriorTurn = priorReviewerTurns[priorReviewerTurns.length - 1];
    const feedbackJson = JSON.stringify(latestPriorTurn.decision.feedback, null, 2);
    return `PRIOR_REVIEWER_FEEDBACK (round ${latestPriorTurn.round}):\n${feedbackJson}`;
}

function buildReviewPrompt(context: TrinityAgentContext): string {
    const priorReviewerTurns = context.history.filter((turn) => turn.agent === 'reviewer');
    const priorFeedbackCtx = buildPriorFeedbackContext(priorReviewerTurns);

    const briefJson = JSON.stringify(context.brief, null, 2);

    return [
        `CAMPAIGN: ${context.campaign.name}`,
        `ROUND: ${context.round}`,
        '',
        priorFeedbackCtx,
        '',
        `FULL_BRIEF:\n${briefJson}`,
        '',
        'Evaluate the brief against all approval criteria. Return approved=true only when all blockers are resolved.',
    ].join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Agent implementation
// ────────────────────────────────────────────────────────────────────────────

export const trinityReviewerAgent: TrinityAgent = {
    name: 'reviewer',

    async run(context: TrinityAgentContext): Promise<TrinityAgentResult> {
        const modelConfig = getModelConfig(ModelName.GPT_5_HIGH);
        const model = openai(modelConfig.apiId ?? 'gpt-4o');

        const userPrompt = buildReviewPrompt(context);

        console.log(`[trinity:reviewer] round=${context.round} evaluating brief for campaign=${context.campaign.id}`);

        const { object: decision } = await generateObject({
            model,
            schema: ReviewerDecisionSchema,
            system: REVIEWER_SYSTEM,
            prompt: userPrompt,
        });

        const typedFeedback: TrinityFeedbackItem[] = decision.feedback.map((item) => ({
            code: item.code,
            message: item.message,
            targetRole: item.targetRole,
            severity: item.severity,
        }));

        console.log(`[trinity:reviewer] round=${context.round} approved=${decision.approved} feedbackItems=${typedFeedback.length}`);

        return {
            brief: context.brief,
            decision: {
                approved: decision.approved,
                feedback: typedFeedback,
            },
        };
    },
};
