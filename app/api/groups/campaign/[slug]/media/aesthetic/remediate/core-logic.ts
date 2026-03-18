import { getCampaignBlueprint, getAestheticBrief, saveAestheticBrief } from '@/lib/campaigns/campaign-store';
import type {
    CampaignAestheticBrief,
    AestheticIssueRecord,
    RemediationExecutionSummary,
    RegenerationStep,
    RemediationStepResult,
} from '@/lib/campaigns/schema';
import { runAestheticModification } from '@/lib/campaigns/aesthetic-modification';
import { generateVisualPlanningFromBrief } from '@/lib/campaigns/aesthetic-engine';
import { runAestheticPatch, buildPatchRequestsFromIssues } from '@/lib/campaigns/aesthetic-patch-engine';
import { lintProductionBuild } from '@/lib/campaigns/media/production-build-lint';
import { runValidationOrchestration } from '@/lib/campaigns/aesthetic-validation-orchestrator';

// ────────────────────────────────────────────────────────────────────────────
// Apply deterministic fixes for issues marked 'deterministic'
// ────────────────────────────────────────────────────────────────────────────

async function applyDeterministicBatch(
    slug: string,
    brief: CampaignAestheticBrief,
    issueIds: string[],
): Promise<{ brief: CampaignAestheticBrief; stepResults: RemediationStepResult[] }> {
    const ledger = brief.issueLedger ?? [];
    const deterministicIssues = ledger.filter(
        i => issueIds.includes(i.issueId) && i.remediationMode === 'deterministic' && i.status === 'open',
    );

    if (deterministicIssues.length === 0) {
        return { brief, stepResults: [] };
    }

    const issueCodesToApply = Array.from(new Set(
        deterministicIssues
            .map(i => i.issueCode)
            .filter((code): code is Exclude<typeof code, 'custom'> => code !== 'custom'),
    ));

    if (issueCodesToApply.length === 0) {
        return {
            brief,
            stepResults: deterministicIssues.map(i => ({
                issueId: i.issueId,
                mode: 'deterministic' as const,
                outcome: 'failed' as const,
                detail: 'No known issue code — cannot auto-apply deterministic fix',
            })),
        };
    }

    const stepResults: RemediationStepResult[] = [];

    try {
        const modResult = await runAestheticModification(slug, {
            mode: 'apply',
            source: 'issue_codes',
            actor: { type: 'agent', id: 'remediation-orchestrator', label: 'Remediation Orchestrator' },
            issueCodes: issueCodesToApply,
            reason: `V2 remediation batch — issue IDs: ${issueIds.join(', ')}`,
        });

        const updatedLedger = markIssuesApplied(brief.issueLedger ?? [], issueIds, 'deterministic', `Applied via deterministic fixer: ${modResult.appliedOperations.map(o => o.summary).join('; ')}`);
        const updatedBrief = modResult.brief as CampaignAestheticBrief;
        updatedBrief.issueLedger = updatedLedger;
        updatedBrief.activeRemediationPlan = brief.activeRemediationPlan;

        for (const issue of deterministicIssues) {
            const applied = modResult.appliedOperations.some(o => o.status === 'applied');
            stepResults.push({
                issueId: issue.issueId,
                mode: 'deterministic',
                outcome: applied ? 'applied' : 'failed',
                detail: applied
                    ? modResult.appliedOperations.find(o => o.status === 'applied')?.summary ?? 'Applied'
                    : 'Deterministic fix was a no-op — content may already be compliant',
            });
        }

        return { brief: updatedBrief, stepResults };

    } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : 'Deterministic fix failed';
        return {
            brief,
            stepResults: deterministicIssues.map(i => ({
                issueId: i.issueId,
                mode: 'deterministic' as const,
                outcome: 'failed' as const,
                detail,
            })),
        };
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Apply LLM patch batch
// ────────────────────────────────────────────────────────────────────────────

async function applyLlmPatchBatch(
    slug: string,
    brief: CampaignAestheticBrief,
    issueIds: string[],
): Promise<{ brief: CampaignAestheticBrief; stepResults: RemediationStepResult[] }> {
    const ledger = brief.issueLedger ?? [];
    const patchIssues = ledger.filter(
        i => issueIds.includes(i.issueId) && i.remediationMode === 'llm_patch' && i.status === 'open',
    );

    if (patchIssues.length === 0) return { brief, stepResults: [] };

    const patchRequests = buildPatchRequestsFromIssues(patchIssues);
    let currentBrief = brief;
    const stepResults: RemediationStepResult[] = [];

    for (const patchRequest of patchRequests) {
        const { result, updatedBrief } = await runAestheticPatch(slug, currentBrief, patchRequest, patchIssues);
        currentBrief = updatedBrief;

        for (const issueId of patchRequest.issueIds) {
            stepResults.push({
                issueId,
                mode: 'llm_patch',
                outcome: result.success ? 'applied' : 'failed',
                detail: result.success ? result.patchSummary : (result.failureReason ?? 'LLM patch failed'),
            });
        }
    }

    const appliedIssueIds = stepResults.filter(s => s.outcome === 'applied').map(s => s.issueId);
    const updatedLedger = markIssuesApplied(
        currentBrief.issueLedger ?? [],
        appliedIssueIds,
        'llm_patch',
        'Applied via targeted LLM patch engine',
    );
    currentBrief = { ...currentBrief, issueLedger: updatedLedger };

    return { brief: currentBrief, stepResults };
}

// ────────────────────────────────────────────────────────────────────────────
// Mark issues as applied in the ledger
// ────────────────────────────────────────────────────────────────────────────

function markIssuesApplied(
    ledger: AestheticIssueRecord[],
    issueIds: string[],
    kind: 'deterministic' | 'llm_patch' | 'regenerate' | 'manual',
    reference: string,
): AestheticIssueRecord[] {
    return ledger.map(issue => {
        if (!issueIds.includes(issue.issueId)) return issue;
        return {
            ...issue,
            status: 'applied' as const,
            resolver: { kind, reference },
        };
    });
}

// ────────────────────────────────────────────────────────────────────────────
// Execute scheduled regeneration steps
// ────────────────────────────────────────────────────────────────────────────

async function applyRegenerationSteps(
    campaign: Awaited<ReturnType<typeof getCampaignBlueprint>>,
    brief: CampaignAestheticBrief,
    regenerationSteps: RegenerationStep[],
): Promise<{ brief: CampaignAestheticBrief; stepResults: RemediationStepResult[] }> {
    if (!campaign || regenerationSteps.length === 0) {
        return { brief, stepResults: [] };
    }

    const relevantIssues = (brief.issueLedger ?? []).filter(issue =>
        issue.status === 'open'
        && issue.remediationMode === 'regenerate'
        && (
            (regenerationSteps.includes('productionBible') && issue.owningArtifact === 'production_bible')
            || (regenerationSteps.includes('landingStillBible') && issue.owningArtifact === 'landing_still_bible')
            || (regenerationSteps.includes('productionBuildLint') && issue.owningArtifact === 'production_build_lint')
            || (regenerationSteps.includes('productionBible') && issue.owningArtifact === 'cross_artifact')
        ),
    );

    try {
        const visualPlanning = await generateVisualPlanningFromBrief(campaign, brief);
        const lintReport = lintProductionBuild({
            landingStillBible: visualPlanning.landingStillBible,
            productionBible: visualPlanning.productionBible,
            themeName: campaign.name,
            nicheKeywords: campaign.targetingKeywords ?? [],
        });

        const nextHumanReviewStatus = brief.humanReviewStatus === 'approved' || brief.humanReviewStatus === 'revised'
            ? 'revised' as const
            : 'pending' as const;

        const regeneratedBrief: CampaignAestheticBrief = {
            ...brief,
            landingStillBible: regenerationSteps.includes('landingStillBible') || regenerationSteps.includes('productionBible')
                ? visualPlanning.landingStillBible
                : brief.landingStillBible,
            productionBible: regenerationSteps.includes('productionBible')
                ? visualPlanning.productionBible
                : brief.productionBible,
            productionBuildLint: lintReport,
            productionBuildStatus: lintReport.verdict,
            productionBuildEvaluatedAt: lintReport.evaluatedAt,
            humanReviewStatus: nextHumanReviewStatus,
            redTeamReview: undefined,
        };

        const updatedLedger = markIssuesApplied(
            regeneratedBrief.issueLedger ?? [],
            relevantIssues.map(issue => issue.issueId),
            'regenerate',
            `Regenerated visual planning bundle for: ${regenerationSteps.join(', ')}`,
        );

        return {
            brief: {
                ...regeneratedBrief,
                issueLedger: updatedLedger,
                activeRemediationPlan: brief.activeRemediationPlan,
            },
            stepResults: relevantIssues.map(issue => ({
                issueId: issue.issueId,
                mode: 'regenerate' as const,
                outcome: 'applied' as const,
                detail: `Regenerated visual planning to address: ${issue.title}`,
            })),
        };
    } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : 'Regeneration failed';
        return {
            brief,
            stepResults: relevantIssues.map(issue => ({
                issueId: issue.issueId,
                mode: 'regenerate' as const,
                outcome: 'failed' as const,
                detail,
            })),
        };
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Build execution summary
// ────────────────────────────────────────────────────────────────────────────

function buildExecutionSummary(
    slug: string,
    allStepResults: RemediationStepResult[],
    finalLedger: AestheticIssueRecord[],
    regenerationScheduled: RegenerationStep[],
    manualEscalations: string[],
): RemediationExecutionSummary {
    const remainingOpenIssues = finalLedger
        .filter(i => i.status === 'open' || i.status === 'failed')
        .map(i => i.issueId);

    return {
        executedAt: new Date().toISOString(),
        slug,
        stepsExecuted: allStepResults,
        remainingOpenIssues,
        regenerationScheduled,
        manualEscalations,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Public: run full remediation
// ────────────────────────────────────────────────────────────────────────────

export interface RemediationCoreResult {
    brief: CampaignAestheticBrief;
    summary: RemediationExecutionSummary;
    hasRemainingBlockers: boolean;
}

export async function runRemediationCore(slug: string): Promise<RemediationCoreResult> {
    const [campaign, brief] = await Promise.all([
        getCampaignBlueprint(slug),
        getAestheticBrief(slug),
    ]);

    if (!campaign) throw new Error(`Campaign not found: ${slug}`);
    if (!brief) throw new Error(`Aesthetic brief not found: ${slug}`);
    if (!brief.issueLedger || brief.issueLedger.length === 0) {
        throw new Error('No issue ledger found. Run validation first via POST /media/aesthetic/validate');
    }
    if (!brief.activeRemediationPlan) {
        throw new Error('No active remediation plan found. Run validation first.');
    }

    const plan = brief.activeRemediationPlan;
    let currentBrief = brief;
    const allStepResults: RemediationStepResult[] = [];

    // ── Phase A: Deterministic fixes ──────────────────────────────────────────
    if (plan.deterministicIssueIds.length > 0) {
        const { brief: afterDeterministic, stepResults } = await applyDeterministicBatch(
            slug, currentBrief, plan.deterministicIssueIds,
        );
        currentBrief = afterDeterministic;
        allStepResults.push(...stepResults);
    }

    // ── Phase B: LLM patch fixes ──────────────────────────────────────────────
    if (plan.llmPatchIssueIds.length > 0) {
        const { brief: afterPatch, stepResults } = await applyLlmPatchBatch(
            slug, currentBrief, plan.llmPatchIssueIds,
        );
        currentBrief = afterPatch;
        allStepResults.push(...stepResults);
    }

    // ── Phase C: Scheduled regeneration ───────────────────────────────────────
    if (plan.regenerationSteps.length > 0) {
        const { brief: afterRegeneration, stepResults } = await applyRegenerationSteps(
            campaign,
            currentBrief,
            plan.regenerationSteps,
        );
        currentBrief = afterRegeneration;
        allStepResults.push(...stepResults);
    }

    // ── Phase D: Refresh validation against the updated artifacts ─────────────
    const validation = await runValidationOrchestration(campaign, currentBrief);
    currentBrief = validation.updatedBrief;

    // ── Manual escalations recorded as open ───────────────────────────────────
    for (const issueId of plan.manualEscalations) {
        allStepResults.push({
            issueId,
            mode: 'manual',
            outcome: 'open',
            detail: 'Manual escalation required — no automated fix available',
        });
    }

    // ── Persist updated brief ─────────────────────────────────────────────────
    await saveAestheticBrief(currentBrief);

    const finalLedger = currentBrief.issueLedger ?? [];
    const summary = buildExecutionSummary(
        slug,
        allStepResults,
        finalLedger,
        currentBrief.activeRemediationPlan?.regenerationSteps ?? [],
        currentBrief.activeRemediationPlan?.manualEscalations ?? [],
    );

    const hasRemainingBlockers = finalLedger.some(
        i => i.severity === 'blocker' && (i.status === 'open' || i.status === 'failed'),
    );

    return { brief: currentBrief, summary, hasRemainingBlockers };
}
