import { randomUUID } from 'crypto';
import { approveForMedia, createOrRefreshBrief, getReadiness } from '@/lib/campaigns/brief-engine/orchestrator';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import {
    AgentJobRecordSchema,
    type AgentJobRecord,
    type AgentWorkflowInput,
} from './schema';
import { getAgentWorkflowDefinition } from './workflow-registry';
import { claimAgentJob, listQueuedAgentJobs, saveAgentJob } from './store';

function createPendingSteps(input: AgentWorkflowInput): AgentJobRecord['steps'] {
    if (input.workflowId === 'campaign_brief_generate') {
        return [
            { stepId: 'generate_brief', label: 'Generate or refresh brief', status: 'pending' },
            { stepId: 'load_readiness', label: 'Load stored readiness', status: 'pending' },
            { stepId: 'confirm_persistence', label: 'Confirm persisted brief exists', status: 'pending' },
        ];
    }

    if (input.workflowId === 'campaign_brief_approve') {
        return [
            { stepId: 'approve_brief', label: 'Approve brief for media', status: 'pending' },
            { stepId: 'load_readiness', label: 'Load stored readiness', status: 'pending' },
        ];
    }

    return [];
}

function markStep(
    record: AgentJobRecord,
    stepId: string,
    status: AgentJobRecord['steps'][number]['status'],
    message?: string,
): AgentJobRecord {
    const now = new Date().toISOString();
    return {
        ...record,
        steps: record.steps.map((step) => {
            if (step.stepId !== stepId) {
                return step;
            }

            return {
                ...step,
                status,
                startedAt: step.startedAt ?? (status === 'running' ? now : step.startedAt),
                completedAt: status === 'completed' || status === 'failed' || status === 'blocked' ? now : step.completedAt,
                message,
            };
        }),
    };
}

export async function createAgentJob(input: AgentWorkflowInput, requestedBy: string): Promise<AgentJobRecord> {
    const workflow = getAgentWorkflowDefinition(input.workflowId);
    const campaignSlug = input.campaignSlug;
    const record = AgentJobRecordSchema.parse({
        jobId: `agent_job_${randomUUID().slice(0, 12)}`,
        workflowId: input.workflowId,
        campaignSlug,
        status: 'queued',
        executionSurface: 'local_worker',
        requestedBy,
        createdAt: new Date().toISOString(),
        input,
        steps: createPendingSteps(input),
        summary: {
            message: `${workflow.displayName} queued for ${campaignSlug}`,
        },
    });

    await saveAgentJob(record);
    return record;
}

export async function submitAgentJob(
    input: AgentWorkflowInput,
    requestedBy: string,
    options?: { runNow?: boolean },
): Promise<AgentJobRecord> {
    const record = await createAgentJob(input, requestedBy);
    if (options?.runNow) {
        return runAgentJob(record);
    }
    return record;
}

export async function runAgentJob(record: AgentJobRecord): Promise<AgentJobRecord> {
    let currentRecord: AgentJobRecord = {
        ...record,
        status: 'running',
        executionSurface: 'local_worker',
        startedAt: record.startedAt ?? new Date().toISOString(),
    };
    await saveAgentJob(currentRecord);

    try {
        switch (record.input.workflowId) {
            case 'campaign_brief_generate': {
                currentRecord = markStep(currentRecord, 'generate_brief', 'running');
                await saveAgentJob(currentRecord);

                const generation = await createOrRefreshBrief(record.campaignSlug, {
                    instructions: record.input.instructions,
                });

                currentRecord = markStep(
                    currentRecord,
                    'generate_brief',
                    'completed',
                    generation.summary,
                );
                currentRecord = markStep(currentRecord, 'load_readiness', 'running');
                await saveAgentJob(currentRecord);

                const readiness = await getReadiness(record.campaignSlug);

                currentRecord = markStep(
                    currentRecord,
                    'load_readiness',
                    'completed',
                    readiness.summary,
                );
                currentRecord = markStep(currentRecord, 'confirm_persistence', 'running');
                await saveAgentJob(currentRecord);

                const persistedBrief = await getAestheticBrief(record.campaignSlug);
                const blockerCount = readiness.issues.filter(issue => issue.severity === 'blocker').length;
                const warningCount = readiness.issues.filter(issue => issue.severity === 'warning').length;

                currentRecord = markStep(
                    currentRecord,
                    'confirm_persistence',
                    persistedBrief ? 'completed' : 'failed',
                    persistedBrief ? 'Persisted brief found in storage' : 'Persisted brief missing from storage',
                );

                currentRecord = {
                    ...currentRecord,
                    status: persistedBrief ? (blockerCount > 0 ? 'blocked' : 'completed') : 'failed',
                    completedAt: new Date().toISOString(),
                    summary: {
                        message: generation.summary,
                        readiness: readiness.readiness,
                        blockerCount,
                        warningCount,
                        persisted: Boolean(persistedBrief),
                        approvalAttempted: false,
                        approvalSucceeded: false,
                    },
                };
                break;
            }

            case 'campaign_brief_approve': {
                currentRecord = markStep(currentRecord, 'approve_brief', 'running');
                await saveAgentJob(currentRecord);

                const approval = await approveForMedia(record.campaignSlug);

                currentRecord = markStep(
                    currentRecord,
                    'approve_brief',
                    'completed',
                    approval.summary,
                );
                currentRecord = markStep(currentRecord, 'load_readiness', 'running');
                await saveAgentJob(currentRecord);

                const readiness = await getReadiness(record.campaignSlug);

                currentRecord = markStep(
                    currentRecord,
                    'load_readiness',
                    'completed',
                    readiness.summary,
                );
                currentRecord = {
                    ...currentRecord,
                    status: 'completed',
                    completedAt: new Date().toISOString(),
                    summary: {
                        message: approval.summary,
                        readiness: readiness.readiness,
                        blockerCount: readiness.issues.filter(issue => issue.severity === 'blocker').length,
                        warningCount: readiness.issues.filter(issue => issue.severity === 'warning').length,
                        persisted: true,
                        approvalAttempted: true,
                        approvalSucceeded: true,
                    },
                };
                break;
            }

            default: {
                throw new Error(`Workflow ${record.input.workflowId} is registered but not yet executable through the direct Agent API runner.`);
            }
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Agent job execution failed';
        currentRecord = {
            ...currentRecord,
            status: 'failed',
            completedAt: new Date().toISOString(),
            error: message,
            summary: {
                message,
                approvalAttempted: record.input.workflowId === 'campaign_brief_approve',
                approvalSucceeded: false,
            },
        };
    }

    await saveAgentJob(currentRecord);
    return currentRecord;
}

export async function claimNextQueuedAgentJob(workerId: string, limit = 10): Promise<AgentJobRecord | null> {
    const candidates = await listQueuedAgentJobs(limit);

    for (const candidate of candidates) {
        const claimed = await claimAgentJob(candidate, workerId);
        if (claimed) {
            return claimed;
        }
    }

    return null;
}

export async function drainQueuedAgentJobs(
    workerId: string,
    options?: { batchSize?: number; maxJobs?: number },
): Promise<AgentJobRecord[]> {
    const batchSize = options?.batchSize ?? 10;
    const maxJobs = options?.maxJobs ?? Number.POSITIVE_INFINITY;
    const completed: AgentJobRecord[] = [];

    while (completed.length < maxJobs) {
        const claimed = await claimNextQueuedAgentJob(workerId, batchSize);
        if (!claimed) {
            break;
        }

        const result = await runAgentJob(claimed);
        completed.push(result);
    }

    return completed;
}
