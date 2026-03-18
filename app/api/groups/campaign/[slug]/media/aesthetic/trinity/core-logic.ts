import { getCampaignBlueprint, getAestheticBrief, saveAestheticBrief } from '@/lib/campaigns/campaign-store';
import { runTrinitySession } from '@/lib/campaigns/trinity/orchestrator';
import { trinityDeterministicKernel } from '@/lib/campaigns/trinity/deterministic-kernel';
import { trinityDesignerAgent } from '@/lib/campaigns/trinity/agents/designer';
import { trinityBuilderAgent } from '@/lib/campaigns/trinity/agents/builder';
import { trinityReviewerAgent } from '@/lib/campaigns/trinity/agents/reviewer';
import { dynamoTrinitySessionStore } from '@/lib/campaigns/trinity/session-store';
import type { TrinityRunResult } from '@/lib/campaigns/trinity/types';

const DEFAULT_MAX_ROUNDS = 3;

// ────────────────────────────────────────────────────────────────────────────
// Request / Response contracts
// ────────────────────────────────────────────────────────────────────────────

export interface TrinityRunRequest {
    maxRounds?: number;
}

export interface TrinityRunResponse {
    sessionId: string;
    campaignId: string;
    status: string;
    round: number;
    approved: boolean;
    briefPersisted: boolean;
    rejectionFeedback: TrinityRunResult['rejectionFeedback'];
    history: TrinityRunResult['session']['history'];
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic
// ────────────────────────────────────────────────────────────────────────────

export async function runTrinityCoreLogic(
    slug: string,
    request: TrinityRunRequest,
): Promise<TrinityRunResponse> {
    const maxRounds = request.maxRounds ?? DEFAULT_MAX_ROUNDS;

    const [campaign, existingBrief] = await Promise.all([
        getCampaignBlueprint(slug),
        getAestheticBrief(slug),
    ]);

    if (!campaign) {
        throw new Error(`Campaign not found: ${slug}`);
    }

    if (!existingBrief) {
        throw new Error(`Aesthetic brief not found for campaign: ${slug}. Generate the brief before running Trinity.`);
    }

    const result = await runTrinitySession(
        campaign,
        existingBrief,
        maxRounds,
        {
            kernel: trinityDeterministicKernel,
            designer: trinityDesignerAgent,
            builder: trinityBuilderAgent,
            reviewer: trinityReviewerAgent,
        },
    );

    await dynamoTrinitySessionStore.save(result.session);

    let briefPersisted = false;
    if (result.approved) {
        const approvedBrief = {
            ...result.session.brief,
            humanReviewStatus: 'approved' as const,
        };
        await saveAestheticBrief(approvedBrief);
        briefPersisted = true;
        console.log(`[trinity:core-logic] Brief approved and persisted for campaign ${slug}`);
    } else {
        console.log(`[trinity:core-logic] Session ended without approval for campaign ${slug} — status: ${result.session.status}`);
    }

    return {
        sessionId: result.session.sessionId,
        campaignId: result.session.campaignId,
        status: result.session.status,
        round: result.session.round,
        approved: result.approved,
        briefPersisted,
        rejectionFeedback: result.rejectionFeedback,
        history: result.session.history,
    };
}
