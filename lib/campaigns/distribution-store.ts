import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { chatDynamoDocumentClient } from '@/lib/chat/dynamo-client';
import type { DistributionExecutionRecord, DistributionPostStatus, DistributionSchedule } from './schema';

const TABLE_NAME = 'lll-shadow-campaigns';

function mergeMetadataNotes(existing: string[] | undefined, incoming: string[] | undefined): string[] | undefined {
    if (!incoming || incoming.length === 0) {
        return existing;
    }

    const next = [...(existing ?? [])];

    for (const note of incoming) {
        const separatorIndex = note.indexOf('=');
        if (separatorIndex === -1) {
            if (!next.includes(note)) {
                next.push(note);
            }
            continue;
        }

        const key = note.slice(0, separatorIndex);
        const existingIndex = next.findIndex((entry) => entry.startsWith(`${key}=`));
        if (existingIndex === -1) {
            next.push(note);
        } else {
            next[existingIndex] = note;
        }
    }

    return next;
}

export async function saveDistributionSchedule(schedule: DistributionSchedule): Promise<void> {
    await chatDynamoDocumentClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
            PK: `CAMPAIGN#${schedule.campaignSlug}`,
            SK: 'MEDIA#DISTRIBUTION_SCHEDULE',
            scheduleJson: JSON.stringify(schedule),
            generatedAt: schedule.generatedAt,
            generatedBy: schedule.generatedBy,
            timezone: schedule.timezone,
            version: schedule.version,
            totalPosts: schedule.posts.length,
        },
    }));
}

export async function getDistributionSchedule(slug: string): Promise<DistributionSchedule | null> {
    const result = await chatDynamoDocumentClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: {
            PK: `CAMPAIGN#${slug}`,
            SK: 'MEDIA#DISTRIBUTION_SCHEDULE',
        },
    }));

    if (!result.Item?.scheduleJson) {
        return null;
    }

    return JSON.parse(result.Item.scheduleJson as string) as DistributionSchedule;
}

export async function saveDistributionExecution(record: DistributionExecutionRecord): Promise<void> {
    await chatDynamoDocumentClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
            PK: `CAMPAIGN#${record.campaignSlug}`,
            SK: `MEDIA#DISTRIBUTION_EXECUTION#${record.executionId}`,
            ...record,
        },
    }));
}

export async function listDistributionExecutions(slug: string): Promise<DistributionExecutionRecord[]> {
    const result = await chatDynamoDocumentClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
            ':pk': `CAMPAIGN#${slug}`,
            ':prefix': 'MEDIA#DISTRIBUTION_EXECUTION#',
        },
        ScanIndexForward: false,
    }));

    return (result.Items ?? []) as DistributionExecutionRecord[];
}

export async function updateDistributionExecution(record: DistributionExecutionRecord): Promise<void> {
    await saveDistributionExecution(record);
}

export async function updateScheduledPostStatus(
    slug: string,
    postId: string,
    status: DistributionPostStatus,
    externalPostId?: string,
    externalReviewUrl?: string,
    metadataNotes?: string[],
): Promise<void> {
    const schedule = await getDistributionSchedule(slug);
    if (!schedule) {
        throw new Error(`Distribution schedule not found for campaign ${slug}`);
    }

    const nextSchedule: DistributionSchedule = {
        ...schedule,
        posts: schedule.posts.map((post) => {
            if (post.postId !== postId) {
                return post;
            }

            const mergedNotes = mergeMetadataNotes(post.notes, metadataNotes);
            const draftTypeNote = mergedNotes?.find((entry) => entry.startsWith('draftType='));
            const providerDraftType = draftTypeNote?.split('=')[1];
            const normalizedProviderDraftType = providerDraftType === 'organic_post' || providerDraftType === 'paid_lead_gen_ad'
                ? providerDraftType
                : post.providerDraftType;

            return {
                ...post,
                status,
                ...(externalPostId ? { externalPostId } : {}),
                ...(externalReviewUrl ? { externalReviewUrl } : {}),
                ...(normalizedProviderDraftType ? { providerDraftType: normalizedProviderDraftType } : {}),
                notes: mergedNotes ?? post.notes,
            };
        }),
    };

    await saveDistributionSchedule(nextSchedule);
}

export async function updateCampaignDistributionStatus(
    slug: string,
    status: 'not_started' | 'scheduled' | 'active' | 'halted',
): Promise<void> {
    await chatDynamoDocumentClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
            PK: `CAMPAIGN#${slug}`,
            SK: 'METADATA',
        },
        UpdateExpression: 'SET distributionStatus = :status, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
            ':status': status,
            ':updatedAt': new Date().toISOString(),
        },
    }));
}