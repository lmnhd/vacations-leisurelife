import { randomUUID } from 'crypto';
import type { CampaignAestheticBrief } from '../schema';
import type { Campaign } from '../types';
import type {
    TrinityAgent,
    TrinityAgentContext,
    TrinityAgentTurn,
    TrinityFeedbackItem,
    TrinityOrchestratorDependencies,
    TrinityRunResult,
    TrinitySession,
} from './types';

function nowIso(): string {
    return new Date().toISOString();
}

function buildContext(
    campaign: Campaign,
    brief: CampaignAestheticBrief,
    round: number,
    history: TrinityAgentTurn[],
): TrinityAgentContext {
    return {
        campaign,
        brief,
        round,
        history,
        kernelNotes: [
            'Kernel assertions run before the first agent turn and after reviewer approval.',
            'Kernel throws on structural violations and never rewrites content.',
        ],
    };
}

async function runAgent(
    agent: TrinityAgent,
    campaign: Campaign,
    brief: CampaignAestheticBrief,
    round: number,
    history: TrinityAgentTurn[],
): Promise<TrinityAgentTurn> {
    const result = await agent.run(buildContext(campaign, brief, round, history));

    return {
        agent: agent.name,
        round,
        brief: result.brief,
        decision: result.decision,
        createdAt: nowIso(),
    };
}

function latestReviewerFeedback(history: TrinityAgentTurn[]): TrinityFeedbackItem[] {
    const reviewerTurn = [...history].reverse().find((turn) => turn.agent === 'reviewer');
    return reviewerTurn?.decision.feedback ?? [];
}

export async function runTrinitySession(
    campaign: Campaign,
    initialBrief: CampaignAestheticBrief,
    maxRounds: number,
    dependencies: TrinityOrchestratorDependencies,
): Promise<TrinityRunResult> {
    dependencies.kernel.validateCampaignContext(campaign);
    dependencies.kernel.assertBriefValidity(initialBrief);

    const session: TrinitySession = {
        sessionId: randomUUID(),
        campaignId: campaign.id,
        round: 0,
        maxRounds,
        consensus: false,
        status: 'running',
        brief: initialBrief,
        history: [],
        startedAt: nowIso(),
        updatedAt: nowIso(),
    };

    for (let round = 1; round <= maxRounds; round++) {
        session.round = round;

        const designerTurn = await runAgent(
            dependencies.designer,
            campaign,
            session.brief,
            round,
            session.history,
        );
        session.history.push(designerTurn);
        session.brief = designerTurn.brief;

        const builderTurn = await runAgent(
            dependencies.builder,
            campaign,
            session.brief,
            round,
            session.history,
        );
        session.history.push(builderTurn);
        session.brief = builderTurn.brief;

        const reviewerTurn = await runAgent(
            dependencies.reviewer,
            campaign,
            session.brief,
            round,
            session.history,
        );
        session.history.push(reviewerTurn);
        session.brief = reviewerTurn.brief;
        session.updatedAt = nowIso();

        if (reviewerTurn.decision.approved) {
            if (session.brief.productionBible) {
                dependencies.kernel.assertProductionBibleFeasibility(session.brief.productionBible);
            }
            dependencies.kernel.assertBriefValidity(session.brief);

            session.consensus = true;
            session.status = 'approved';

            return {
                session,
                approved: true,
                rejectionFeedback: [],
            };
        }
    }

    session.status = 'max_rounds_exhausted';
    session.updatedAt = nowIso();

    return {
        session,
        approved: false,
        rejectionFeedback: latestReviewerFeedback(session.history),
    };
}
