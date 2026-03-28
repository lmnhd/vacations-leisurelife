import { z } from 'zod';
import { DistributionCallerEnum, DistributionPlatformEnum } from '@/lib/campaigns/schema';

export const AgentWorkflowIdEnum = z.enum([
    'campaign_brief_generate',
    'campaign_brief_approve',
    'campaign_landing_stills_generate',
    'campaign_production_bible_generate',
    'campaign_production_lint_resync',
    'campaign_status_update',
    'campaign_distribution_plan',
    'campaign_distribution_dispatch',
    'campaign_media_generate',
    'campaign_marketing_dispatch',
]);
export type AgentWorkflowId = z.infer<typeof AgentWorkflowIdEnum>;

export const AgentJobStatusEnum = z.enum([
    'queued',
    'running',
    'completed',
    'failed',
    'blocked',
    'cancelled',
]);
export type AgentJobStatus = z.infer<typeof AgentJobStatusEnum>;

export const AgentExecutionSurfaceEnum = z.enum([
    'local_worker',
    'http_api',
]);
export type AgentExecutionSurface = z.infer<typeof AgentExecutionSurfaceEnum>;

export const AgentWorkflowCategoryEnum = z.enum([
    'campaign',
    'brief',
    'artifact',
    'distribution',
    'media',
    'marketing',
]);
export type AgentWorkflowCategory = z.infer<typeof AgentWorkflowCategoryEnum>;

export const AgentWorkflowAvailabilityEnum = z.enum([
    'implemented',
    'planned',
]);
export type AgentWorkflowAvailability = z.infer<typeof AgentWorkflowAvailabilityEnum>;

export const AgentStepStatusEnum = z.enum([
    'pending',
    'running',
    'completed',
    'failed',
    'blocked',
    'skipped',
]);
export type AgentStepStatus = z.infer<typeof AgentStepStatusEnum>;

export const AgentExecutionStepSchema = z.object({
    stepId: z.string(),
    label: z.string(),
    status: AgentStepStatusEnum,
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    message: z.string().optional(),
});
export type AgentExecutionStep = z.infer<typeof AgentExecutionStepSchema>;

const BriefReadinessEnum = z.enum(['drafting', 'needs_review', 'ready_for_media']);

const AgentBriefGenerateInputSchema = z.object({
    workflowId: z.literal('campaign_brief_generate'),
    campaignSlug: z.string().min(1),
    instructions: z.string().min(1).optional(),
    stopBeforeMedia: z.literal(true).default(true),
});

const AgentBriefApproveInputSchema = z.object({
    workflowId: z.literal('campaign_brief_approve'),
    campaignSlug: z.string().min(1),
});

const AgentDistributionPlanInputSchema = z.object({
    workflowId: z.literal('campaign_distribution_plan'),
    campaignSlug: z.string().min(1),
    caller: DistributionCallerEnum.default('agent'),
    dryRun: z.boolean().default(false),
    platforms: z.array(DistributionPlatformEnum).optional(),
    stages: z.array(z.string().min(1)).optional(),
    timezone: z.string().min(1).optional(),
});

const AgentStatusUpdateInputSchema = z.object({
    workflowId: z.literal('campaign_status_update'),
    campaignSlug: z.string().min(1),
    targetStatus: z.enum(['DRAFT', 'GATHERING_INTEREST', 'THRESHOLD_MET', 'CONVERTED', 'EXPIRED']),
});

const AgentDistributionDispatchInputSchema = z.object({
    workflowId: z.literal('campaign_distribution_dispatch'),
    campaignSlug: z.string().min(1),
    caller: DistributionCallerEnum.default('agent'),
    dryRun: z.boolean().default(false),
    platforms: z.array(DistributionPlatformEnum).optional(),
    stages: z.array(z.string().min(1)).optional(),
    providerMode: z.enum(['simulate', 'live']).default('simulate'),
    forceDispatch: z.boolean().default(false),
});

const AgentLandingStillsGenerateInputSchema = z.object({
    workflowId: z.literal('campaign_landing_stills_generate'),
    campaignSlug: z.string().min(1),
    instructions: z.string().min(1).optional(),
});

const AgentProductionBibleGenerateInputSchema = z.object({
    workflowId: z.literal('campaign_production_bible_generate'),
    campaignSlug: z.string().min(1),
    instructions: z.string().min(1).optional(),
});

const AgentProductionLintResyncInputSchema = z.object({
    workflowId: z.literal('campaign_production_lint_resync'),
    campaignSlug: z.string().min(1),
});

const AgentMediaGenerateInputSchema = z.object({
    workflowId: z.literal('campaign_media_generate'),
    campaignSlug: z.string().min(1),
});

const AgentMarketingDispatchInputSchema = z.object({
    workflowId: z.literal('campaign_marketing_dispatch'),
    campaignSlug: z.string().min(1),
    platforms: z.array(DistributionPlatformEnum).optional(),
});

export const AgentWorkflowInputSchema = z.discriminatedUnion('workflowId', [
    AgentBriefGenerateInputSchema,
    AgentBriefApproveInputSchema,
    AgentLandingStillsGenerateInputSchema,
    AgentProductionBibleGenerateInputSchema,
    AgentProductionLintResyncInputSchema,
    AgentStatusUpdateInputSchema,
    AgentDistributionPlanInputSchema,
    AgentDistributionDispatchInputSchema,
    AgentMediaGenerateInputSchema,
    AgentMarketingDispatchInputSchema,
]);
export type AgentWorkflowInput = z.infer<typeof AgentWorkflowInputSchema>;

export const AgentJobSummarySchema = z.object({
    message: z.string(),
    readiness: BriefReadinessEnum.optional(),
    blockerCount: z.number().int().min(0).optional(),
    warningCount: z.number().int().min(0).optional(),
    persisted: z.boolean().optional(),
    approvalAttempted: z.boolean().optional(),
    approvalSucceeded: z.boolean().optional(),
});
export type AgentJobSummary = z.infer<typeof AgentJobSummarySchema>;

export const AgentJobRecordSchema = z.object({
    jobId: z.string(),
    workflowId: AgentWorkflowIdEnum,
    campaignSlug: z.string().min(1),
    status: AgentJobStatusEnum,
    executionSurface: AgentExecutionSurfaceEnum,
    requestedBy: z.string().min(1),
    createdAt: z.string(),
    claimedBy: z.string().optional(),
    claimedAt: z.string().optional(),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    input: AgentWorkflowInputSchema,
    steps: z.array(AgentExecutionStepSchema).default([]),
    summary: AgentJobSummarySchema.optional(),
    error: z.string().optional(),
    failureDiagnostics: z.any().optional(),
});
export type AgentJobRecord = z.infer<typeof AgentJobRecordSchema>;

export const AgentWorkflowDefinitionSchema = z.object({
    workflowId: AgentWorkflowIdEnum,
    displayName: z.string(),
    category: AgentWorkflowCategoryEnum,
    availability: AgentWorkflowAvailabilityEnum,
    persistsState: z.boolean(),
    stopsBeforeMedia: z.boolean(),
    description: z.string(),
});
export type AgentWorkflowDefinition = z.infer<typeof AgentWorkflowDefinitionSchema>;
