import type { Campaign } from './types';
import type {
    DiscoveryIterationEvent,
    DiscoveryIterationState,
    DiscoveryRevisionClosurePlan,
    DiscoveryRevisionMode,
    RedTeamIssue,
    RedTeamReview,
} from './schema';

const MAX_HISTORY_EVENTS = 8;
const FINGERPRINT_SIMILARITY_THRESHOLD = 0.78;
const STRUCTURAL_REVIEW_CATEGORIES = new Set([
    'community_drift',
    'optionality_failure',
    'workshop_regression',
    'solitude_drift',
    'cruise_implausibility',
    'diversity_gap',
    'stereotype_risk',
]);

function isOpsOnlyIssue(issue: RedTeamIssue): boolean {
    if (issue.severity === 'blocker') {
        return false;
    }

    if (STRUCTURAL_REVIEW_CATEGORIES.has(issue.category)) {
        return false;
    }

    const combinedText = `${issue.title} ${issue.evidence} ${issue.recommendation}`.toLowerCase();
    return /venue|deck|backup|protocol|safety|sharps|chat|moderator|metadata|slug|identifier|copy|wording|approval|permission|checklist|sop|wifi|offline|signage|display|overflow/.test(combinedText)
        || ['production_feasibility', 'copy_alignment', 'motion_safety', 'other'].includes(issue.category);
}

function isOperatorCleanupReview(review: RedTeamReview): boolean {
    if (review.verdict === 'pass' || review.issues.length === 0) {
        return false;
    }

    return review.issues.every(isOpsOnlyIssue);
}

function uniqueSorted(values: string[]): string[] {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

function tokenize(value: string): string[] {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 4);
}

function toTokenSet(value: string): Set<string> {
    return new Set(tokenize(value));
}

function jaccardSimilarity(left: string, right: string): number {
    const leftTokens = toTokenSet(left);
    const rightTokens = toTokenSet(right);

    if (leftTokens.size === 0 && rightTokens.size === 0) {
        return 1;
    }

    const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
    const union = new Set([...Array.from(leftTokens), ...Array.from(rightTokens)]).size;

    return union === 0 ? 0 : intersection / union;
}

function buildIssueCategories(review: RedTeamReview): string[] {
    return uniqueSorted(review.issues.map((issue) => issue.category));
}

export function buildDiscoveryIssueSignature(review: RedTeamReview): string {
    const issueCategories = buildIssueCategories(review);
    const leadFixes = uniqueSorted(review.requiredFixes.slice(0, 3));
    return [review.verdict, ...issueCategories, ...leadFixes].join(' | ');
}

export function buildDiscoveryFingerprint(campaign: Campaign): string {
    return uniqueSorted([
        campaign.name,
        campaign.aesthetic ?? '',
        campaign.description,
        campaign.targetDestination ?? '',
        campaign.shipTarget ?? '',
        campaign.nicheExpressionMode ?? '',
        campaign.communityFitRationale ?? '',
        campaign.optionalityStyle ?? '',
        ...(campaign.cruiseNativeMoments ?? []),
        ...(campaign.optionalGatheringMoments ?? []),
        ...(campaign.allowedThemeSignals ?? []),
    ]).join(' | ');
}

function normalizeDiscoveryIterationState(input?: DiscoveryIterationState | null): DiscoveryIterationState {
    return {
        history: input?.history ?? [],
        reviewCount: input?.reviewCount ?? 0,
        revisionCount: input?.revisionCount ?? 0,
        consecutiveNonPassReviews: input?.consecutiveNonPassReviews ?? 0,
        stagnant: input?.stagnant ?? false,
        stagnationReason: input?.stagnationReason,
        recommendedNextAction: input?.recommendedNextAction ?? 'review',
        currentFingerprint: input?.currentFingerprint,
        currentIssueSignature: input?.currentIssueSignature,
        retiredAt: input?.retiredAt,
        retirementReason: input?.retirementReason,
    };
}

function getLastReviewEvent(history: DiscoveryIterationEvent[]): DiscoveryIterationEvent | undefined {
    return [...history].reverse().find((event) => event.eventType === 'review');
}

function countRevisionEventsSinceLastPass(history: DiscoveryIterationEvent[]): number {
    let revisionCount = 0;
    for (let index = history.length - 1; index >= 0; index -= 1) {
        const event = history[index];
        if (event.eventType === 'review' && event.verdict === 'pass') {
            break;
        }
        if (event.eventType === 'revision') {
            revisionCount += 1;
        }
    }
    return revisionCount;
}

function truncateHistory(history: DiscoveryIterationEvent[]): DiscoveryIterationEvent[] {
    return history.slice(-MAX_HISTORY_EVENTS);
}

export function applyDiscoveryReviewIteration(campaign: Campaign, review: RedTeamReview): Campaign {
    const now = new Date().toISOString();
    const state = normalizeDiscoveryIterationState(campaign.discoveryIteration);
    const fingerprint = buildDiscoveryFingerprint(campaign);
    const issueCategories = buildIssueCategories(review);
    const issueSignature = buildDiscoveryIssueSignature(review);
    const lastReview = getLastReviewEvent(state.history);

    const previousIssueCategories = lastReview?.issueCategories ?? [];
    const persistingIssueCategories = uniqueSorted(issueCategories.filter((category) => previousIssueCategories.includes(category)));
    const resolvedIssueCategories = uniqueSorted(previousIssueCategories.filter((category) => !issueCategories.includes(category)));
    const fingerprintSimilarity = lastReview ? jaccardSimilarity(lastReview.fingerprint, fingerprint) : 0;
    const repeatedIssueSignature = !!lastReview && (lastReview.issueCategories.join('|') === issueCategories.join('|'));
    const consecutiveNonPassReviews = review.verdict === 'pass' ? 0 : state.consecutiveNonPassReviews + 1;
    const revisionsSinceLastPass = countRevisionEventsSinceLastPass(state.history);
    const operatorCleanupOnly = isOperatorCleanupReview(review);

    const stagnant = review.verdict !== 'pass' && !!lastReview && (
        repeatedIssueSignature
        || fingerprintSimilarity >= FINGERPRINT_SIMILARITY_THRESHOLD
        || persistingIssueCategories.length >= Math.max(2, Math.min(issueCategories.length, previousIssueCategories.length))
    );

    const stagnationReason = stagnant
        ? repeatedIssueSignature
            ? 'The same issue mix is repeating across consecutive reviews.'
            : fingerprintSimilarity >= FINGERPRINT_SIMILARITY_THRESHOLD
                ? 'The latest revision is too similar to the previous reviewed version.'
                : 'The core failure categories are persisting across iterations.'
        : undefined;

    let recommendedNextAction: DiscoveryIterationState['recommendedNextAction'] = review.verdict === 'pass'
        ? 'hold'
        : operatorCleanupOnly
            ? 'operator_cleanup'
        : stagnant || consecutiveNonPassReviews >= 2
            ? 'branch'
            : 'continue';

    let retiredAt: string | undefined;
    let retirementReason: string | undefined;
    if (!retiredAt && !operatorCleanupOnly && review.verdict !== 'pass' && revisionsSinceLastPass >= 2 && (stagnant || consecutiveNonPassReviews >= 3)) {
        retiredAt = now;
        retirementReason = 'Retired after repeated non-improving review cycles.';
        recommendedNextAction = 'retire';
    }

    if (operatorCleanupOnly) {
        retiredAt = undefined;
        retirementReason = undefined;
    }

    const nextEvent: DiscoveryIterationEvent = {
        eventType: 'review',
        createdAt: now,
        fingerprint,
        verdict: review.verdict,
        approvalRecommendation: review.approvalRecommendation,
        issueCategories,
        requiredFixes: review.requiredFixes,
        targetedIssues: [],
        changesMade: [],
        improvement: {
            resolvedIssueCategories,
            persistingIssueCategories,
            repeatedIssueSignature,
            fingerprintSimilarity,
        },
    };

    return {
        ...campaign,
        discoveryIteration: {
            history: truncateHistory([...state.history, nextEvent]),
            reviewCount: state.reviewCount + 1,
            revisionCount: state.revisionCount,
            consecutiveNonPassReviews,
            stagnant,
            stagnationReason,
            recommendedNextAction,
            currentFingerprint: fingerprint,
            currentIssueSignature: issueSignature,
            retiredAt,
            retirementReason,
        },
    };
}

export function applyDiscoveryRevisionIteration(
    campaign: Campaign,
    closurePlan: DiscoveryRevisionClosurePlan,
    revisionMode: DiscoveryRevisionMode,
    branchesConsidered: number,
    selectionRationale?: string,
): Campaign {
    const now = new Date().toISOString();
    const state = normalizeDiscoveryIterationState(campaign.discoveryIteration);
    const fingerprint = buildDiscoveryFingerprint(campaign);

    const nextEvent: DiscoveryIterationEvent = {
        eventType: 'revision',
        createdAt: now,
        fingerprint,
        issueCategories: [],
        requiredFixes: [],
        targetedIssues: closurePlan.targetedIssues,
        changesMade: closurePlan.changesMade,
        successHypothesis: closurePlan.successHypothesis,
        revisionMode,
        branchesConsidered,
        selectionRationale,
    };

    return {
        ...campaign,
        discoveryIteration: {
            history: truncateHistory([...state.history, nextEvent]),
            reviewCount: state.reviewCount,
            revisionCount: state.revisionCount + 1,
            consecutiveNonPassReviews: state.consecutiveNonPassReviews,
            stagnant: false,
            stagnationReason: undefined,
            recommendedNextAction: 'review',
            currentFingerprint: fingerprint,
            currentIssueSignature: state.currentIssueSignature,
            retiredAt: undefined,
            retirementReason: undefined,
        },
    };
}

export function getDiscoveryRevisionMode(campaign: Campaign): 'single' | 'branch' | 'retire' {
    const state = normalizeDiscoveryIterationState(campaign.discoveryIteration);
    if (state.retiredAt || state.recommendedNextAction === 'retire') {
        return 'branch';
    }
    if (state.recommendedNextAction === 'branch' || state.stagnant) {
        return 'branch';
    }
    return 'single';
}