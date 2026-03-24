import {
    AgentWorkflowDefinitionSchema,
    type AgentWorkflowDefinition,
    type AgentWorkflowId,
} from './schema';

const RAW_WORKFLOW_DEFINITIONS = [
    {
        workflowId: 'campaign_brief_generate',
        displayName: 'Campaign Brief Generate',
        category: 'brief',
        availability: 'implemented',
        persistsState: true,
        stopsBeforeMedia: true,
        description: 'Generate or refresh a campaign brief, persist it, and stop before media generation.',
    },
    {
        workflowId: 'campaign_brief_approve',
        displayName: 'Campaign Brief Approve',
        category: 'brief',
        availability: 'implemented',
        persistsState: true,
        stopsBeforeMedia: true,
        description: 'Approve a persisted campaign brief when structural and production-build gates pass.',
    },
    {
        workflowId: 'campaign_distribution_plan',
        displayName: 'Campaign Distribution Plan',
        category: 'distribution',
        availability: 'planned',
        persistsState: true,
        stopsBeforeMedia: false,
        description: 'Build and persist a distribution schedule for a campaign using the canonical planner.',
    },
    {
        workflowId: 'campaign_distribution_dispatch',
        displayName: 'Campaign Distribution Dispatch',
        category: 'distribution',
        availability: 'planned',
        persistsState: true,
        stopsBeforeMedia: false,
        description: 'Dispatch scheduled campaign distribution posts and persist execution results.',
    },
    {
        workflowId: 'campaign_media_generate',
        displayName: 'Campaign Media Generate',
        category: 'media',
        availability: 'planned',
        persistsState: true,
        stopsBeforeMedia: false,
        description: 'Generate campaign media assets from an approved brief and persist the media manifest.',
    },
    {
        workflowId: 'campaign_marketing_dispatch',
        displayName: 'Campaign Marketing Dispatch',
        category: 'marketing',
        availability: 'planned',
        persistsState: true,
        stopsBeforeMedia: false,
        description: 'Run near-real-time advertising and marketing dispatch workflows for a campaign.',
    },
] as const;

const WORKFLOW_DEFINITIONS = RAW_WORKFLOW_DEFINITIONS.map(def => AgentWorkflowDefinitionSchema.parse(def));

export function listAgentWorkflowDefinitions(): AgentWorkflowDefinition[] {
    return WORKFLOW_DEFINITIONS;
}

export function getAgentWorkflowDefinition(workflowId: AgentWorkflowId): AgentWorkflowDefinition {
    const workflow = WORKFLOW_DEFINITIONS.find(item => item.workflowId === workflowId);
    if (!workflow) {
        throw new Error(`Unknown agent workflow: ${workflowId}`);
    }
    return workflow;
}
