import { ModelName, callLLM } from '@/lib/ai/llm-gateway';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { Campaign } from './types';
import {
    CampaignAestheticBrief,
    RedTeamAssessment,
    RedTeamAssessmentSchema,
    RedTeamIssue,
    RedTeamReview,
    RedTeamReviewSchema,
} from './schema';

export const AESTHETIC_RED_TEAM_PROMPT_VERSION = '2026-03-13-red-team-v1';
const AESTHETIC_RED_TEAM_MODEL = ModelName.GPT_5_HIGH;

function buildDeterministicIssues(brief: CampaignAestheticBrief): RedTeamIssue[] {
    const issues: RedTeamIssue[] = [];

    if (!brief.productionBible) {
        issues.push({
            category: 'production_feasibility',
            severity: 'blocker',
            title: 'Production bible missing',
            evidence: 'The brief has no productionBible, so scene feasibility and motion safety cannot be fully audited before launch.',
            recommendation: 'Generate the production bible, then rerun red team before approval.',
        });
    }

    if (!brief.landingStillBible) {
        issues.push({
            category: 'production_feasibility',
            severity: 'warning',
            title: 'Landing still bible missing',
            evidence: 'The brief has no landingStillBible, so the hero-image plan is less explicit than the rest of the campaign.',
            recommendation: 'Generate landing-still planning before final launch if the hero image prompts still need tightening.',
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

function normalizeAssessment(brief: CampaignAestheticBrief, assessment: RedTeamAssessment): RedTeamReview {
    const deterministicIssues = buildDeterministicIssues(brief);
    const issues = mergeIssues(deterministicIssues, assessment.issues);
    const forcedBlock = deterministicIssues.some((issue) => issue.severity === 'blocker');
    const requiredFixes = Array.from(new Set([
        ...deterministicIssues
            .filter((issue) => issue.severity === 'blocker')
            .map((issue) => issue.recommendation),
        ...assessment.requiredFixes,
    ]));

    return RedTeamReviewSchema.parse({
        ...assessment,
        verdict: forcedBlock ? 'block' : assessment.verdict,
        issues,
        requiredFixes,
        evaluatedAt: new Date().toISOString(),
        model: AESTHETIC_RED_TEAM_MODEL,
        promptVersion: AESTHETIC_RED_TEAM_PROMPT_VERSION,
    });
}

export async function runAestheticRedTeamReview(
    campaign: Campaign,
    brief: CampaignAestheticBrief,
): Promise<RedTeamReview> {
    const systemPrompt = `You are the final pre-launch red-team reviewer for Leisure Life Interactive shadow-group campaigns.
Your job is to stop campaigns that drift away from the intended product.

Audit for:
- loss of ambient community or common-interest energy
- workshop, retreat, residency, or event-program takeover
- lonely premium-solo-retreat drift
- cruise implausibility or ship-incompatible scenes
- weak optionality or introvert-hostile framing
- poor ethnic diversity, repetitive casting, or stereotype risk
- human-motion violations in video planning
- copy or visual systems that conflict with the group promise
- missing planning detail that prevents confident launch

Be strict. If the campaign is not ready, say so. Return only valid JSON with no markdown.`;

    const prompt = `Review this campaign as the final pre-launch red team. Use the exact JSON schema below.

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
      "evidence": "concrete evidence from the brief or campaign",
      "recommendation": "specific fix"
    }
  ],
  "requiredFixes": ["..."],
  "optionalImprovements": ["..."]
}

Scoring rules:
- Use "block" if the campaign should not be approved yet.
- Use "warn" if it is close but still needs deliberate revision before launch.
- Use "pass" only if you would personally clear it for approval now.
- Missing production planning, human-motion violations, lonely drift, workshop drift, or representation problems should usually block.

Campaign metadata:
${JSON.stringify({
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        targetDates: campaign.targetDates,
        targetDestination: campaign.targetDestination,
        shipTarget: campaign.shipTarget,
        researchRationale: campaign.researchRationale,
        successLogic: campaign.successLogic,
        audienceSignals: campaign.audienceSignals,
        vacationFitRationale: campaign.vacationFitRationale,
        cruiseNativeMoments: campaign.cruiseNativeMoments,
        nicheExpressionMode: campaign.nicheExpressionMode,
        implausibleLiteralizations: campaign.implausibleLiteralizations,
        allowedThemeSignals: campaign.allowedThemeSignals,
        discouragedThemeSignals: campaign.discouragedThemeSignals,
        communityFitRationale: campaign.communityFitRationale,
        optionalGatheringMoments: campaign.optionalGatheringMoments,
        optionalityStyle: campaign.optionalityStyle,
        solitudeRisks: campaign.solitudeRisks,
    }, null, 2)}

Aesthetic brief:
${JSON.stringify(brief, null, 2)}`;

    const model = openai('gpt-5');
    
    const { object } = await generateObject({
        model,
        schema: RedTeamAssessmentSchema,
        system: systemPrompt,
        prompt,
        temperature: 0.2,
        maxTokens: 4000,
    });

    return normalizeAssessment(brief, object);
}

export function getRedTeamGateFailureReason(brief: CampaignAestheticBrief, slug: string): string | null {
    if (!brief.redTeamReview) {
        return `Aesthetic brief for ${slug} has no red-team review. Run red team before approval or media generation.`;
    }

    if (brief.redTeamReview.verdict !== 'pass') {
        const leadFix = brief.redTeamReview.requiredFixes[0] ?? brief.redTeamReview.approvalRecommendation;
        return `Aesthetic brief for ${slug} did not pass red team (verdict: ${brief.redTeamReview.verdict}). ${leadFix}`;
    }

    return null;
}

export function assertAestheticBriefPassedRedTeam(brief: CampaignAestheticBrief, slug: string): void {
    const failureReason = getRedTeamGateFailureReason(brief, slug);
    if (failureReason) {
        throw new Error(failureReason);
    }
}

export function assertAestheticBriefReadyForMedia(brief: CampaignAestheticBrief, slug: string): void {
    if (brief.humanReviewStatus !== 'approved') {
        throw new Error(`Aesthetic brief for ${slug} not approved (status: ${brief.humanReviewStatus}).`);
    }

    assertAestheticBriefPassedRedTeam(brief, slug);
}