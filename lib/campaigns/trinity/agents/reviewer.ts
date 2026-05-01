import type { TrinityAgent, TrinityAgentContext, TrinityAgentResult, TrinityFeedbackItem, TrinityAgentTurn } from '../types';
import { trinityDeterministicKernel } from '../deterministic-kernel';

// ────────────────────────────────────────────────────────────────────────────
// Schema — Reviewer outputs a structured decision, not a brief rewrite
// ────────────────────────────────────────────────────────────────────────────

const BANNED_WORKSHOP_PATTERNS = [/\bworkshop\b/i, /\bsalon\b/i, /hosted session/i, /event[- ]program/i, /managed program/i];
const BANNED_EXCLUSIVITY_PATTERNS = [/quiet-luxe/i, /elevated salon/i, /collector-grade/i, /rarefied/i];

function buildPriorFeedbackContext(priorReviewerTurns: TrinityAgentTurn[]): string {
    if (priorReviewerTurns.length === 0) {
        return 'PRIOR_REVIEWER_FEEDBACK: none — this is the first review round.';
    }

    const latestPriorTurn = priorReviewerTurns[priorReviewerTurns.length - 1];
    const feedbackJson = JSON.stringify(latestPriorTurn.decision.feedback, null, 2);
    return `PRIOR_REVIEWER_FEEDBACK (round ${latestPriorTurn.round}):\n${feedbackJson}`;
}

function buildFeedback(
    code: string,
    message: string,
    targetRole: 'designer' | 'builder' | 'reviewer',
    severity: 'warning' | 'blocker',
): TrinityFeedbackItem {
    return { code, message, targetRole, severity };
}

function textMatchesPatterns(text: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(text));
}

function hasOptionalityLanguage(context: TrinityAgentContext): boolean {
    const text = [
        context.brief.communityExpression.participationStyle,
        context.brief.communityExpression.copyFramingRule,
        ...context.brief.communityExpression.optionalGatherings,
    ].join(' ');

    return /\b(optional|drop[- ]in|drop[- ]out|join\s+or\s+skip|low[- ]pressure|welcome\s+to\s+(?:join|drop[- ]in))\b/i.test(text);
}

function hasHeroSloganIssue(context: TrinityAgentContext): boolean {
    const wordCount = context.brief.messaging.heroSlogan.split(/\s+/).filter(Boolean).length;
    return wordCount > 6;
}

function hasAvoidDirectiveCoverage(context: TrinityAgentContext): boolean {
    if (!context.brief.productionBible) {
        return false;
    }

    const directives = context.brief.productionBible.avoidDirectives.join(' ').toLowerCase();
    const avoidedTerms = context.brief.visual.avoidList
        .map((item) => item.toLowerCase())
        .filter((item) => item.length >= 4);

    if (avoidedTerms.length === 0) {
        return true;
    }

    return avoidedTerms.some((item) => directives.includes(item));
}

function runDeterministicReview(context: TrinityAgentContext): {
    approved: boolean;
    reviewSummary: string;
    feedback: TrinityFeedbackItem[];
} {
    const feedback: TrinityFeedbackItem[] = [];
    const briefText = JSON.stringify(context.brief);

    if (textMatchesPatterns(briefText, BANNED_WORKSHOP_PATTERNS)) {
        feedback.push(buildFeedback(
            'workshop_language_survives',
            'Workshop, salon, hosted-session, or event-program language still appears in the brief.',
            'designer',
            'blocker',
        ));
    }

    if (textMatchesPatterns(briefText, BANNED_EXCLUSIVITY_PATTERNS)) {
        feedback.push(buildFeedback(
            'exclusive_lifestyle_language',
            'Exclusive lifestyle-marketing language still appears in the brief.',
            'designer',
            'blocker',
        ));
    }

    if (!hasOptionalityLanguage(context)) {
        feedback.push(buildFeedback(
            'optionality_language_missing',
            'communityExpression no longer clearly signals optional, low-pressure participation.',
            'designer',
            'blocker',
        ));
    }

    if (!/t-?shirt/i.test(context.brief.merch.coreItem.productType)) {
        feedback.push(buildFeedback(
            'merch_not_tshirt_first',
            'Merch core item is no longer T-shirt-first.',
            'designer',
            'blocker',
        ));
    }

    if (hasHeroSloganIssue(context)) {
        feedback.push(buildFeedback(
            'hero_slogan_too_long',
            'Hero slogan exceeds six words and should be tightened.',
            'designer',
            'warning',
        ));
    }

    if (!context.brief.productionBible || !context.brief.landingStillBible) {
        feedback.push(buildFeedback(
            'production_artifacts_missing',
            'Production artifacts are incomplete; both productionBible and landingStillBible are required.',
            'builder',
            'blocker',
        ));
    } else {
        try {
            trinityDeterministicKernel.assertProductionBibleFeasibility(context.brief.productionBible);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Production bible feasibility check failed.';
            feedback.push(buildFeedback('production_kernel_failure', message, 'builder', 'blocker'));
        }

        if (!hasAvoidDirectiveCoverage(context)) {
            feedback.push(buildFeedback(
                'avoid_directives_too_weak',
                'productionBible avoidDirectives do not clearly reflect the brief avoidList.',
                'builder',
                'warning',
            ));
        }
    }

    const blockerCount = feedback.filter((item) => item.severity === 'blocker').length;
    const approved = blockerCount === 0;
    const reviewSummary = approved
        ? 'Deterministic Trinity review passed. The brief cleared the stable policy checks and production feasibility gate.'
        : `Deterministic Trinity review found ${blockerCount} blocker(s) that still need revision.`;

    return {
        approved,
        reviewSummary,
        feedback: approved ? [] : feedback,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Agent implementation
// ────────────────────────────────────────────────────────────────────────────

export const trinityReviewerAgent: TrinityAgent = {
    name: 'reviewer',

    async run(context: TrinityAgentContext): Promise<TrinityAgentResult> {
        const priorReviewerTurns = context.history.filter((turn) => turn.agent === 'reviewer');
        const priorFeedbackContext = buildPriorFeedbackContext(priorReviewerTurns);
        console.log(`[trinity:reviewer] round=${context.round} evaluating brief for campaign=${context.campaign.id}`);
        console.log(`[trinity:reviewer] ${priorFeedbackContext}`);

        const decision = runDeterministicReview(context);

        console.log(`[trinity:reviewer] round=${context.round} approved=${decision.approved} feedbackItems=${decision.feedback.length}`);

        return {
            brief: context.brief,
            decision: {
                approved: decision.approved,
                feedback: decision.feedback,
            },
        };
    },
};
