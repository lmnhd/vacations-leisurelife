import { GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { chatDynamoDocumentClient } from '@/lib/chat/dynamo-client';
import type { AgentJobRecord } from './schema';

const TABLE_NAME = 'lll-shadow-campaigns';

export async function saveAgentJob(record: AgentJobRecord): Promise<void> {
    await chatDynamoDocumentClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
            PK: `CAMPAIGN#${record.campaignSlug}`,
            SK: `AGENT#JOB#${record.jobId}`,
            ...record,
        },
    }));
}

export async function getAgentJob(campaignSlug: string, jobId: string): Promise<AgentJobRecord | null> {
    const result = await chatDynamoDocumentClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: {
            PK: `CAMPAIGN#${campaignSlug}`,
            SK: `AGENT#JOB#${jobId}`,
        },
    }));

    return (result.Item as AgentJobRecord | undefined) ?? null;
}

export async function listAgentJobsForCampaign(campaignSlug: string): Promise<AgentJobRecord[]> {
    const result = await chatDynamoDocumentClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
            ':pk': `CAMPAIGN#${campaignSlug}`,
            ':prefix': 'AGENT#JOB#',
        },
        ScanIndexForward: false,
    }));

    return (result.Items ?? []) as AgentJobRecord[];
}

export async function listQueuedAgentJobs(limit = 10): Promise<AgentJobRecord[]> {
    const result = await chatDynamoDocumentClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'begins_with(SK, :prefix) AND #jobStatus = :queued',
        ExpressionAttributeNames: {
            '#jobStatus': 'status',
        },
        ExpressionAttributeValues: {
            ':prefix': 'AGENT#JOB#',
            ':queued': 'queued',
        },
    }));

    return ((result.Items ?? []) as AgentJobRecord[])
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .slice(0, limit);
}

export async function claimAgentJob(record: AgentJobRecord, workerId: string): Promise<AgentJobRecord | null> {
    const claimedAt = new Date().toISOString();

    try {
        const result = await chatDynamoDocumentClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: `CAMPAIGN#${record.campaignSlug}`,
                SK: `AGENT#JOB#${record.jobId}`,
            },
            UpdateExpression: 'SET #jobStatus = :running, executionSurface = :surface, claimedBy = :claimedBy, claimedAt = :claimedAt, startedAt = if_not_exists(startedAt, :claimedAt)',
            ConditionExpression: '#jobStatus = :queued',
            ExpressionAttributeNames: {
                '#jobStatus': 'status',
            },
            ExpressionAttributeValues: {
                ':queued': 'queued',
                ':running': 'running',
                ':surface': 'local_worker',
                ':claimedBy': workerId,
                ':claimedAt': claimedAt,
            },
            ReturnValues: 'ALL_NEW',
        }));

        return (result.Attributes as AgentJobRecord | undefined) ?? null;
    } catch (error) {
        const isConditionalFailure = error instanceof Error
            && 'name' in error
            && error.name === 'ConditionalCheckFailedException';
        if (isConditionalFailure) {
            return null;
        }
        throw error;
    }
}
