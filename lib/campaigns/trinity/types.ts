import type { CampaignAestheticBrief, ProductionBible } from '../schema';
import type { Campaign } from '../types';

export type TrinityAgentName = 'designer' | 'builder' | 'reviewer';

export type TrinitySessionStatus =
    | 'running'
    | 'approved'
    | 'rejected'
    | 'max_rounds_exhausted';

export interface TrinityFeedbackItem {
    code: string;
    message: string;
    targetRole: TrinityAgentName;
    severity: 'warning' | 'blocker';
}

export interface TrinityAgentDecision {
    approved: boolean;
    feedback: TrinityFeedbackItem[];
}

export interface TrinityAgentTurn {
    agent: TrinityAgentName;
    round: number;
    brief: CampaignAestheticBrief;
    decision: TrinityAgentDecision;
    createdAt: string;
}

export interface TrinitySession {
    sessionId: string;
    campaignId: string;
    round: number;
    maxRounds: number;
    consensus: boolean;
    status: TrinitySessionStatus;
    brief: CampaignAestheticBrief;
    history: TrinityAgentTurn[];
    startedAt: string;
    updatedAt: string;
}

export interface TrinityAgentContext {
    campaign: Campaign;
    brief: CampaignAestheticBrief;
    round: number;
    history: TrinityAgentTurn[];
    kernelNotes: string[];
}

export interface TrinityAgentResult {
    brief: CampaignAestheticBrief;
    decision: TrinityAgentDecision;
}

export interface DeterministicKernelContract {
    validateCampaignContext(campaign: Campaign): void;
    assertBriefValidity(brief: CampaignAestheticBrief): void;
    assertProductionBibleFeasibility(bible: ProductionBible): void;
}

export interface TrinityAgent {
    readonly name: TrinityAgentName;
    run(context: TrinityAgentContext): Promise<TrinityAgentResult>;
}

export interface TrinityOrchestratorDependencies {
    kernel: DeterministicKernelContract;
    designer: TrinityAgent;
    builder: TrinityAgent;
    reviewer: TrinityAgent;
}

export interface TrinityRunResult {
    session: TrinitySession;
    approved: boolean;
    rejectionFeedback: TrinityFeedbackItem[];
}
