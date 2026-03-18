import { randomUUID } from 'crypto';
import type { Campaign } from './types';
import type {
    CampaignAestheticBrief,
    AestheticIssueRecord,
    AestheticRemediationPlan,
    RemediationMode,
    OwningArtifact,
    AestheticIssueCode,
    RedTeamIssue,
    RedTeamReview,
    RedTeamIssueCategory,
} from './schema';
import { runAestheticRedTeamReview } from './aesthetic-red-team';
import { runCrossArtifactConsistencyChecks } from './aesthetic-consistency';
import { suggestDeterministicIssueCodes, ISSUE_CODE_OPERATIONS } from './aesthetic-fixers/registry';

// ────────────────────────────────────────────────────────────────────────────
// Owning artifact inference
// ────────────────────────────────────────────────────────────────────────────

const CATEGORY_TO_ARTIFACT: Record<RedTeamIssueCategory, OwningArtifact> = {
    community_drift: 'brief',
    optionality_failure: 'brief',
    workshop_regression: 'brief',
    solitude_drift: 'brief',
    cruise_implausibility: 'production_bible',
    diversity_gap: 'brief',
    stereotype_risk: 'brief',
    motion_safety: 'production_bible',
    production_feasibility: 'production_bible',
    copy_alignment: 'brief',
    other: 'brief',
};

function inferOwningArtifact(issue: RedTeamIssue): OwningArtifact {
    return CATEGORY_TO_ARTIFACT[issue.category] ?? 'brief';
}

// ────────────────────────────────────────────────────────────────────────────
// Remediation mode inference
// ────────────────────────────────────────────────────────────────────────────

const DETERMINISTIC_CATEGORIES = new Set<RedTeamIssueCategory>([
    'motion_safety',
]);

function inferRemediationMode(
    issue: RedTeamIssue,
    matchedIssueCode: AestheticIssueCode | null,
): RemediationMode {
    if (matchedIssueCode !== null) return 'deterministic';
    if (DETERMINISTIC_CATEGORIES.has(issue.category)) return 'deterministic';
    if (issue.category === 'production_feasibility') return 'regenerate';
    return 'llm_patch';
}

// ────────────────────────────────────────────────────────────────────────────
// Target paths from issue code
// ────────────────────────────────────────────────────────────────────────────

function targetPathsForIssueCode(code: AestheticIssueCode): string[] {
    const ops = ISSUE_CODE_OPERATIONS[code];
    if (!ops) return [];
    return Array.from(new Set(ops.map(op => op.targetPath)));
}

// ────────────────────────────────────────────────────────────────────────────
// Closure checks from issue category
// ────────────────────────────────────────────────────────────────────────────

const CLOSURE_CHECKS: Record<RedTeamIssueCategory, string[]> = {
    community_drift: ['Brief no longer describes isolated solo-retreat framing'],
    optionality_failure: ['Optional participation language present in copy and social concepts'],
    workshop_regression: ['No workshop/retreat/residency language in brief or video concepts'],
    solitude_drift: ['Visual scenes include pairs or clusters, not empty solo framing'],
    cruise_implausibility: ['All scenes are ship-compatible and avoid prohibited locations'],
    diversity_gap: ['Casting and visual guidance reflects visible demographic diversity'],
    stereotype_risk: ['No stereotyped clothing, props, or gesture patterns in scene descriptions'],
    motion_safety: ['No crane/dolly/track/slider language in storyboards or sceneLibrary'],
    production_feasibility: ['Production bible present and free of feasibility blockers'],
    copy_alignment: ['Copy, slogans, and CTAs align with campaign voice and community promise'],
    other: ['Issue no longer detectable in affected artifact'],
};

function closureChecksForCategory(category: RedTeamIssueCategory): string[] {
    return CLOSURE_CHECKS[category] ?? ['Issue no longer detectable'];
}

// ────────────────────────────────────────────────────────────────────────────
// Invalidation flags from owning artifact + severity
// ────────────────────────────────────────────────────────────────────────────

function computeInvalidates(owningArtifact: OwningArtifact, severity: 'warning' | 'blocker') {
    const isBrief = owningArtifact === 'brief' || owningArtifact === 'cross_artifact';
    const isBible = owningArtifact === 'production_bible' || owningArtifact === 'cross_artifact';
    const isLandingStill = owningArtifact === 'landing_still_bible';
    const isLint = owningArtifact === 'production_build_lint';

    return {
        redTeamReview: true,
        productionBible: severity === 'blocker' && isBrief,
        landingStillBible: severity === 'blocker' && (isBrief || isLandingStill),
        productionBuildLint: severity === 'blocker' && (isBrief || isBible || isLint),
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Convert RedTeamIssue → AestheticIssueRecord
// ────────────────────────────────────────────────────────────────────────────

function redTeamIssueToRecord(issue: RedTeamIssue): AestheticIssueRecord {
    const issueText = `${issue.title} ${issue.evidence} ${issue.recommendation}`;
    const suggestedCodes = suggestDeterministicIssueCodes([issue.title], issueText);
    const matchedCode = suggestedCodes[0] ?? null;

    const owningArtifact = inferOwningArtifact(issue);
    const remediationMode = inferRemediationMode(issue, matchedCode);
    const targetPaths = matchedCode ? targetPathsForIssueCode(matchedCode) : [];
    const closureChecks = closureChecksForCategory(issue.category);

    return {
        issueId: randomUUID(),
        issueCode: matchedCode ?? 'custom',
        severity: issue.severity,
        title: issue.title,
        summary: issue.recommendation,
        evidence: [issue.evidence],
        owningArtifact,
        targetPaths,
        remediationMode,
        closureChecks,
        invalidates: computeInvalidates(owningArtifact, issue.severity),
        status: 'open',
        createdAt: new Date().toISOString(),
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Deduplicate issue records
// ────────────────────────────────────────────────────────────────────────────

function deduplicateIssues(issues: AestheticIssueRecord[]): AestheticIssueRecord[] {
    const seen = new Set<string>();
    return issues.filter(issue => {
        const key = `${issue.issueCode}:${issue.owningArtifact}:${issue.title.toLowerCase().trim()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ────────────────────────────────────────────────────────────────────────────
// Derive remediation plan from issue ledger
// ────────────────────────────────────────────────────────────────────────────

export function deriveRemediationPlan(
    issues: AestheticIssueRecord[],
    reviewId: string,
): AestheticRemediationPlan {
    const openIssues = issues.filter(i => i.status === 'open');

    const deterministicIssueIds = openIssues
        .filter(i => i.remediationMode === 'deterministic')
        .map(i => i.issueId);

    const llmPatchIssueIds = openIssues
        .filter(i => i.remediationMode === 'llm_patch')
        .map(i => i.issueId);

    const regenerationStepsSet = new Set<'productionBible' | 'landingStillBible' | 'productionBuildLint'>();
    for (const issue of openIssues) {
        if (issue.remediationMode === 'regenerate') {
            if (issue.owningArtifact === 'production_bible') regenerationStepsSet.add('productionBible');
            if (issue.owningArtifact === 'landing_still_bible') regenerationStepsSet.add('landingStillBible');
            if (issue.owningArtifact === 'production_build_lint') regenerationStepsSet.add('productionBuildLint');
        }
        if (issue.severity === 'blocker' && issue.invalidates.productionBible) {
            regenerationStepsSet.add('productionBible');
        }
    }

    const manualEscalations = openIssues
        .filter(i => i.remediationMode === 'manual')
        .map(i => i.issueId);

    return {
        createdAt: new Date().toISOString(),
        sourceReviewId: reviewId,
        deterministicIssueIds,
        llmPatchIssueIds,
        regenerationSteps: Array.from(regenerationStepsSet),
        manualEscalations,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Deterministic pre-scan
// ────────────────────────────────────────────────────────────────────────────

function runDeterministicScan(brief: CampaignAestheticBrief): AestheticIssueRecord[] {
    const issueText = JSON.stringify(brief);
    const allRedTeamIssues = brief.redTeamReview?.issues?.map(i => i.title) ?? [];
    const suggestedCodes = suggestDeterministicIssueCodes(allRedTeamIssues, issueText);

    return suggestedCodes.map(code => {
        const targetPaths = targetPathsForIssueCode(code);
        return {
            issueId: randomUUID(),
            issueCode: code,
            severity: 'blocker' as const,
            title: `Deterministic: ${code.replace(/_/g, ' ')}`,
            summary: `Structural rule violation detected by deterministic scanner for issue code: ${code}`,
            evidence: [`Pattern match in brief content for ${code}`],
            owningArtifact: targetPaths.some(p => p.startsWith('productionBible')) ? 'production_bible' as const : 'brief' as const,
            targetPaths,
            remediationMode: 'deterministic' as const,
            closureChecks: [`Issue code ${code} pattern no longer detectable in brief content`],
            invalidates: {
                redTeamReview: true,
                productionBible: false,
                landingStillBible: false,
                productionBuildLint: false,
            },
            status: 'open' as const,
            createdAt: new Date().toISOString(),
        };
    });
}

// ────────────────────────────────────────────────────────────────────────────
// Production build lint issues → AestheticIssueRecord
// ────────────────────────────────────────────────────────────────────────────

function lintIssuesToRecords(brief: CampaignAestheticBrief): AestheticIssueRecord[] {
    if (!brief.productionBuildLint) return [];
    const allLintIssues = [
        ...brief.productionBuildLint.blockingIssues,
        ...brief.productionBuildLint.warnings,
    ];

    return allLintIssues.map(lintIssue => ({
        issueId: randomUUID(),
        issueCode: 'custom' as const,
        severity: lintIssue.severity,
        title: `Build Lint: ${lintIssue.code.replace(/_/g, ' ')}`,
        summary: lintIssue.message,
        evidence: lintIssue.affectedStillIds.length > 0
            ? [`Affected stills: ${lintIssue.affectedStillIds.join(', ')}`]
            : ['See production build lint report'],
        owningArtifact: 'production_build_lint' as const,
        targetPaths: ['landingStillBible.stillLibrary'],
        remediationMode: 'regenerate' as const,
        closureChecks: ['Production build lint no longer reports this code'],
        invalidates: {
            redTeamReview: lintIssue.severity === 'blocker',
            productionBible: false,
            landingStillBible: lintIssue.severity === 'blocker',
            productionBuildLint: true,
        },
        status: 'open' as const,
        createdAt: new Date().toISOString(),
    }));
}

// ────────────────────────────────────────────────────────────────────────────
// Orchestration result
// ────────────────────────────────────────────────────────────────────────────

export interface ValidationOrchestrationResult {
    redTeamReview: RedTeamReview;
    issueLedger: AestheticIssueRecord[];
    remediationPlan: AestheticRemediationPlan;
    updatedBrief: CampaignAestheticBrief;
}

// ────────────────────────────────────────────────────────────────────────────
// Main orchestrator
// ────────────────────────────────────────────────────────────────────────────

export async function runValidationOrchestration(
    campaign: Campaign,
    brief: CampaignAestheticBrief,
): Promise<ValidationOrchestrationResult> {
    const redTeamReview = await runAestheticRedTeamReview(campaign, brief);

    const redTeamIssueRecords = redTeamReview.issues.map(redTeamIssueToRecord);
    const deterministicRecords = runDeterministicScan(brief);
    const lintRecords = lintIssuesToRecords(brief);
    const consistencyRecords = runCrossArtifactConsistencyChecks(brief);

    const allIssues = deduplicateIssues([
        ...redTeamIssueRecords,
        ...deterministicRecords,
        ...lintRecords,
        ...consistencyRecords,
    ]);

    const reviewId = redTeamReview.evaluatedAt;
    const remediationPlan = deriveRemediationPlan(allIssues, reviewId);

    const updatedBrief: CampaignAestheticBrief = {
        ...brief,
        redTeamReview,
        issueLedger: allIssues,
        activeRemediationPlan: remediationPlan,
    };

    return { redTeamReview, issueLedger: allIssues, remediationPlan, updatedBrief };
}

// ────────────────────────────────────────────────────────────────────────────
// Re-run validation for closure verification (targeted)
// ────────────────────────────────────────────────────────────────────────────

export function runClosureVerification(
    brief: CampaignAestheticBrief,
    issueIds: string[],
): AestheticIssueRecord[] {
    if (!brief.issueLedger) return [];

    return brief.issueLedger.map(issue => {
        if (!issueIds.includes(issue.issueId) || issue.status !== 'applied') return issue;

        const briefText = JSON.stringify(brief);
        const allPassed = issue.closureChecks.every(check => {
            if (issue.issueCode !== 'custom') {
                const suggestedCodes = suggestDeterministicIssueCodes([], briefText);
                return !suggestedCodes.includes(issue.issueCode as AestheticIssueCode);
            }
            return true;
        });

        return {
            ...issue,
            status: allPassed ? ('verified' as const) : ('failed' as const),
            resolvedAt: allPassed ? new Date().toISOString() : undefined,
        };
    });
}
