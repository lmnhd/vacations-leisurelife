import { randomUUID } from 'node:crypto';

import type {
    AestheticIssueRecord,
    AestheticRemediationPlan,
    CampaignAestheticBrief,
    OwningArtifact,
    RegenerationStep,
    RemediationMode,
} from '../schema';
import type { ValidationIssue } from './validation';

type SupervisorReviewStatus = 'pending' | 'revised' | 'approved';
type SupervisorOrigin = 'create_or_refresh' | 'structured_revision' | 'approval';

interface SupervisorStateOptions {
    issues: ValidationIssue[];
    reviewStatus: SupervisorReviewStatus;
    origin: SupervisorOrigin;
    revisionCycleCount?: number;
}

function mapIssueToRemediationMode(issue: ValidationIssue): RemediationMode {
    switch (issue.code) {
        case 'production_artifacts_missing':
            return 'regenerate';
        case 'avoid_directives_too_weak':
            return 'llm_patch';
        case 'launch_window_violation':
            return 'manual';
        default:
            return issue.autoFixable ? 'deterministic' : 'manual';
    }
}

function mapIssueToArtifact(issue: ValidationIssue): OwningArtifact {
    switch (issue.code) {
        case 'camera_move_feasibility':
        case 'storyboard_duration_alignment':
        case 'production_safety_ops_missing':
        case 'cabin_type_plausibility':
        case 'gangway_exchange_prohibited':
            return 'production_bible';
        case 'production_artifacts_missing':
        case 'launch_window_violation':
            return 'cross_artifact';
        default:
            return 'brief';
    }
}

function mapIssueToTargetPaths(issue: ValidationIssue): string[] {
    switch (issue.code) {
        case 'camera_move_feasibility':
        case 'storyboard_duration_alignment':
        case 'production_safety_ops_missing':
        case 'cabin_type_plausibility':
        case 'gangway_exchange_prohibited':
            return ['productionBible'];
        case 'production_artifacts_missing':
            return ['productionBible', 'landingStillBible'];
        case 'optionality_language_missing':
            return ['communityExpression'];
        case 'hero_slogan_too_long':
            return ['messaging.heroSlogan'];
        case 'merch_not_tshirt_first':
            return ['merch.coreItem'];
        case 'avoid_directives_too_weak':
            return ['productionBible.avoidDirectives'];
        case 'launch_window_violation':
            return ['campaign.targetDates', 'campaign.matchedSailDate'];
        default:
            return ['brief'];
    }
}

function mapIssueToClosureChecks(issue: ValidationIssue): string[] {
    switch (issue.code) {
        case 'production_artifacts_missing':
            return ['productionBible exists', 'landingStillBible exists'];
        case 'launch_window_violation':
            return ['launch window meets minimum lead days'];
        default:
            return [`${issue.code} no longer appears in validateBrief output`];
    }
}

function mapIssueToRegenerationSteps(issue: ValidationIssue): RegenerationStep[] {
    if (issue.code === 'production_artifacts_missing') {
        return ['productionBible', 'landingStillBible'];
    }

    if (mapIssueToArtifact(issue) === 'production_bible' && mapIssueToRemediationMode(issue) === 'regenerate') {
        return ['productionBible'];
    }

    return [];
}

export function buildSupervisorIssueLedger(issues: ValidationIssue[], createdAt: string = new Date().toISOString()): AestheticIssueRecord[] {
    return issues.map((issue) => {
        const owningArtifact = mapIssueToArtifact(issue);

        return {
            issueId: randomUUID(),
            issueCode: 'custom',
            severity: issue.severity,
            title: issue.code.replace(/_/g, ' '),
            summary: issue.message,
            evidence: [issue.message],
            owningArtifact,
            targetPaths: mapIssueToTargetPaths(issue),
            remediationMode: mapIssueToRemediationMode(issue),
            closureChecks: mapIssueToClosureChecks(issue),
            invalidates: {
                redTeamReview: issue.severity === 'blocker',
                productionBible: owningArtifact === 'production_bible' || issue.code === 'production_artifacts_missing',
                landingStillBible: issue.code === 'production_artifacts_missing',
                productionBuildLint: false,
            },
            status: 'open',
            createdAt,
        };
    });
}

export function buildSupervisorRemediationPlan(
    issues: ValidationIssue[],
    sourceReviewId: string = new Date().toISOString(),
): AestheticRemediationPlan | undefined {
    if (issues.length === 0) {
        return undefined;
    }

    const deterministicIssueIds: string[] = [];
    const llmPatchIssueIds: string[] = [];
    const regenerationSteps = new Set<RegenerationStep>();
    const manualEscalations: string[] = [];

    for (const issue of issues) {
        const issueId = `${issue.code}:${issue.severity}`;
        const mode = mapIssueToRemediationMode(issue);

        if (mode === 'deterministic') {
            deterministicIssueIds.push(issueId);
        } else if (mode === 'llm_patch') {
            llmPatchIssueIds.push(issueId);
        } else if (mode === 'regenerate') {
            for (const step of mapIssueToRegenerationSteps(issue)) {
                regenerationSteps.add(step);
            }
        } else {
            manualEscalations.push(`${issue.code}: ${issue.message}`);
        }
    }

    return {
        createdAt: sourceReviewId,
        sourceReviewId,
        deterministicIssueIds,
        llmPatchIssueIds,
        regenerationSteps: Array.from(regenerationSteps),
        manualEscalations,
    };
}

export function applySupervisorState(
    brief: CampaignAestheticBrief,
    options: SupervisorStateOptions,
): CampaignAestheticBrief {
    const blockerCount = options.issues.filter((issue) => issue.severity === 'blocker').length;
    const warningCount = options.issues.filter((issue) => issue.severity === 'warning').length;

    if (options.reviewStatus === 'approved' && blockerCount > 0) {
        throw new Error('Supervisor cannot persist approved status while blocker issues remain.');
    }

    const timestamp = new Date().toISOString();
    const issueLedger = buildSupervisorIssueLedger(options.issues, timestamp);
    const remediationPlan = buildSupervisorRemediationPlan(options.issues, timestamp);
    const summary = blockerCount > 0 || warningCount > 0
        ? `Supervisor ${options.origin}: ${blockerCount} blocker(s), ${warningCount} warning(s) recorded.`
        : `Supervisor ${options.origin}: no open validation issues.`;

    return {
        ...brief,
        humanReviewStatus: options.reviewStatus,
        revisionCycleCount: options.revisionCycleCount ?? brief.revisionCycleCount,
        issueLedger,
        activeRemediationPlan: remediationPlan,
        revisionNotes: summary,
    };
}

export type { SupervisorOrigin, SupervisorReviewStatus };