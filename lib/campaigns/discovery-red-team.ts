import { ModelName } from '@/lib/ai/llm-gateway';
import { callGlobalGenerateObject } from '@/lib/chat/llm-call';
import type { Campaign } from './types';
import {
    RedTeamAssessment,
    RedTeamAssessmentSchema,
    RedTeamIssue,
    RedTeamReview,
    RedTeamReviewSchema,
} from './schema';
import { buildShipCopyAlignmentReview } from './ship-copy-alignment';

export const DISCOVERY_RED_TEAM_PROMPT_VERSION = '2026-03-15-discovery-red-team-v2';
const DISCOVERY_RED_TEAM_MODEL = ModelName.GPT_5_HIGH;

const DISCOVERY_BLUEPRINT_FIELDS = [
    'name',
    'description',
    'aesthetic',
    'targetDates',
    'targetDestination',
    'shipTarget',
    'highlightEvents',
    'targetingKeywords',
    'researchRationale',
    'successLogic',
    'audienceSignals',
    'vacationFitRationale',
    'cruiseNativeMoments',
    'nicheExpressionMode',
    'implausibleLiteralizations',
    'allowedThemeSignals',
    'discouragedThemeSignals',
    'communityFitRationale',
    'optionalGatheringMoments',
    'optionalityStyle',
    'solitudeRisks',
];

const NON_BLUEPRINT_OPERATOR_REQUEST_PATTERN = /(matchedshipname|matchedsaildate|activitiesapproval|activities approval|written approval|attach|attachment|citation|screenshot|pdf|playbook|host roster|hostroster|coverage schedule|alias map|signed[- ]off|backup venue\/time|link assets|storage\/printing protocol|upload .*teach|rights[- ]safe teach|asset|artifacts?|sharedlibrary|hostcoverage|codeofconduct|spacemanagementpolicy|beveragepolicy|windcheckprotocol|activity confirmation|approval[s]? with backup|audience artifact|confirmation placeholder|nightly coverage|coverage grid)/i;

function buildDeterministicIssues(campaign: Campaign): RedTeamIssue[] {
    const issues: RedTeamIssue[] = [];

    if (!campaign.communityFitRationale?.trim()) {
        issues.push({
            category: 'community_drift',
            severity: 'blocker',
            title: 'Community logic missing',
            evidence: 'The blueprint does not explain why strangers with this shared interest would actually want to be around each other on a cruise.',
            recommendation: 'Rewrite the blueprint with explicit social logic that makes the group version emotionally necessary.',
        });
    }

    if (!campaign.optionalityStyle?.trim() || !campaign.optionalGatheringMoments?.length) {
        issues.push({
            category: 'optionality_failure',
            severity: 'blocker',
            title: 'Optionality plan missing or underdefined',
            evidence: 'The blueprint does not clearly define drop-in participation norms and low-pressure gathering moments.',
            recommendation: 'Add explicit optionality framing and 3-5 ambient gathering moments that feel voluntary and easy to ignore.',
        });
    }

    if (!campaign.vacationFitRationale?.trim() || !campaign.cruiseNativeMoments?.length) {
        issues.push({
            category: 'cruise_implausibility',
            severity: 'blocker',
            title: 'Cruise plausibility is not yet defensible',
            evidence: 'The blueprint lacks enough proof that this concept feels like a real cruise vacation instead of a themed idea pasted onto a ship.',
            recommendation: 'Strengthen the vacation-fit reasoning and add believable cruise-native moments before progressing.',
        });
    }

    if (!campaign.solitudeRisks?.length) {
        issues.push({
            category: 'solitude_drift',
            severity: 'warning',
            title: 'Solitude failure modes not articulated',
            evidence: 'The blueprint does not explicitly name the ways this concept could drift into lonely or socially hollow territory.',
            recommendation: 'List the key loneliness and exclusivity risks so the next iteration can actively avoid them.',
        });
    }

    return issues;
}

function mergeIssues(primary: RedTeamIssue[], secondary: RedTeamIssue[]): RedTeamIssue[] {
    const seen = new Set<string>();
    const merged: RedTeamIssue[] = [];

    for (const issue of [...primary, ...secondary]) {
        const key = `${issue.category}:${issue.severity}:${issue.title}`.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        merged.push(issue);
    }

    return merged;
}

function isNonBlueprintOperatorIssue(issue: RedTeamIssue): boolean {
    const combinedText = `${issue.title} ${issue.evidence} ${issue.recommendation}`;
    return NON_BLUEPRINT_OPERATOR_REQUEST_PATTERN.test(combinedText);
}

function isNonBlueprintOperatorFix(value: string): boolean {
    return NON_BLUEPRINT_OPERATOR_REQUEST_PATTERN.test(value);
}

function splitOperatorFollowUps(assessment: RedTeamAssessment): {
    structuralIssues: RedTeamIssue[];
    operatorFollowUps: string[];
    structuralRequiredFixes: string[];
} {
    const operatorFollowUps = new Set<string>();

    const structuralIssues = assessment.issues.filter((issue) => {
        if (!isNonBlueprintOperatorIssue(issue)) {
            return true;
        }

        operatorFollowUps.add(issue.recommendation);
        return false;
    });

    const structuralRequiredFixes = assessment.requiredFixes.filter((fix) => {
        if (!isNonBlueprintOperatorFix(fix)) {
            return true;
        }

        operatorFollowUps.add(fix);
        return false;
    });

    return {
        structuralIssues,
        operatorFollowUps: Array.from(operatorFollowUps),
        structuralRequiredFixes,
    };
}

function normalizeAssessment(campaign: Campaign, assessment: RedTeamAssessment): RedTeamReview {
    const deterministicIssues = buildDeterministicIssues(campaign);
    const shipCopyAlignment = buildShipCopyAlignmentReview(campaign);
    const { structuralIssues, operatorFollowUps, structuralRequiredFixes } = splitOperatorFollowUps(assessment);
    const issues = mergeIssues(mergeIssues(deterministicIssues, shipCopyAlignment.issues), structuralIssues);
    const forcedBlock = issues.some((issue) => issue.severity === 'blocker');
    const requiredFixes = Array.from(new Set([
        ...issues
            .filter((issue) => issue.severity === 'blocker')
            .map((issue) => issue.recommendation),
        ...shipCopyAlignment.requiredFixes,
        ...structuralRequiredFixes,
    ])).filter((fix) => !isNonBlueprintOperatorFix(fix));
    const demotedToWarn = !forcedBlock && assessment.verdict === 'pass' && requiredFixes.length > 0;
    const approvalRecommendation = demotedToWarn
        ? `Discovery review downgraded to warn because required fixes remain before Phase 2: ${requiredFixes.slice(0, 3).join('; ')}`
        : assessment.approvalRecommendation;

    const operatorFollowUpSuffix = operatorFollowUps.length > 0
        ? ` Operator follow-ups outside the discovery blueprint contract: ${operatorFollowUps.slice(0, 4).join('; ')}.`
        : '';

    return RedTeamReviewSchema.parse({
        ...assessment,
        verdict: forcedBlock ? 'block' : demotedToWarn ? 'warn' : assessment.verdict,
        issues,
        requiredFixes,
        approvalRecommendation: `${approvalRecommendation}${operatorFollowUpSuffix}`.trim(),
        optionalImprovements: Array.from(new Set([
            ...assessment.optionalImprovements,
            ...shipCopyAlignment.optionalImprovements,
            ...operatorFollowUps,
        ])),
        evaluatedAt: new Date().toISOString(),
        model: DISCOVERY_RED_TEAM_MODEL,
        promptVersion: DISCOVERY_RED_TEAM_PROMPT_VERSION,
    });
}

export async function runDiscoveryRedTeamReview(campaign: Campaign): Promise<RedTeamReview> {
    const system = `You are the discovery-stage red-team reviewer for Leisure Life Interactive shadow-group cruise campaigns.
Your job is to evaluate a raw blueprint before any aesthetic brief is generated.

Audit for:
- weak or decorative community logic
- optionality failures or introvert-hostile participation assumptions
- workshop, retreat, residency, conference, or event-program drift
- lonely premium-solo-retreat drift
- cruise implausibility or ship-incompatible activities
- matched-ship or ship-class copy conflicts after Phase B inventory matching
- stale overlap with previous quiet-luxury/lounge/introspective themes
- stereotype risk or shallow community framing
- missing reasoning that would make downstream aesthetics too speculative

Contract boundary:
- Judge only what can be changed inside the current discovery blueprint fields.
- Valid blueprint fields are: ${DISCOVERY_BLUEPRINT_FIELDS.join(', ')}.
- Do not require external artifacts, screenshots, PDFs, written approvals, Activities sign-off, alias maps, host rosters, attached playbooks, or explicit matchedShipName/matchedSailDate fields as discovery-stage required fixes.
- If those operator follow-ups would still help later, mention them as optional improvements, not blockers.

Be strict. If the blueprint is not a strong candidate for Phase 2, say so. Return only valid JSON with no markdown.`;

    const prompt = `Review this discovery blueprint as an upstream gate before aesthetics. Use the exact JSON schema below.

Required JSON shape:
{
  "verdict": "pass" | "warn" | "block",
  "summary": "one-paragraph summary",
  "approvalRecommendation": "clear recommendation to the operator",
  "strengths": ["..."],
  "issues": [
    {
      "category": "community_drift" | "optionality_failure" | "workshop_regression" | "solitude_drift" | "cruise_implausibility" | "diversity_gap" | "stereotype_risk" | "motion_safety" | "production_feasibility" | "copy_alignment" | "other",
      "severity": "warning" | "blocker",
      "title": "short issue title",
      "evidence": "concrete evidence from the blueprint",
      "recommendation": "specific fix"
    }
  ],
  "requiredFixes": ["..."],
  "optionalImprovements": ["..."]
}

Scoring rules:
- Use "block" if this blueprint should not advance to aesthetics in its current form.
- Use "warn" if the core idea is viable but the discovery logic needs revision first.
- Use "pass" only if the blueprint already contains enough social, vacation, and plausibility grounding to justify an aesthetic brief right now.
- If any pre-Phase-2 requirement still must be satisfied before aesthetics begins, that is a required fix and the verdict must be "warn", not "pass".
- For a true "pass", keep "requiredFixes" empty and put all remaining polish into "optionalImprovements".
- Weak social necessity, generic luxury substitution, workshop drift, or cruise implausibility should usually block.
- If inventory metadata names a matched ship, treat that ship as authoritative reality; stale references to a different line, class, venue, or layout must not pass.
- Never require fields or deliverables outside the discovery blueprint contract as required fixes.

Blueprint:
${JSON.stringify(campaign, null, 2)}`;

    const { object } = await callGlobalGenerateObject({
        system,
        prompt,
        schema: RedTeamAssessmentSchema,
        modelName: DISCOVERY_RED_TEAM_MODEL,
    });

    return normalizeAssessment(campaign, object as RedTeamAssessment);
}