import { PutCommand, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { chatDynamoDocumentClient } from '@/lib/chat/dynamo-client';
import {
    AssetRecord,
    MediaGenerationJob,
    CampaignMediaManifest,
    AssetType,
} from '../schema';

// ────────────────────────────────────────────────────────────────────────────
// DynamoDB Media Operations
// Table: lll-shadow-campaigns
// Records: MEDIA#MANIFEST, MEDIA#ASSET#{assetId}, MEDIAJOB#{jobId}
// ────────────────────────────────────────────────────────────────────────────

const TABLE_NAME = 'lll-shadow-campaigns';

// ── Media Generation Jobs ──────────────────────────────────────────────────

export async function saveMediaJob(job: MediaGenerationJob): Promise<void> {
    await chatDynamoDocumentClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
            PK: `CAMPAIGN#${job.campaignSlug}`,
            SK: `MEDIAJOB#${job.jobId}`,
            ...job,
        },
    }));
}

export async function updateMediaJobStatus(
    slug: string,
    jobId: string,
    status: MediaGenerationJob['status'],
    outputUrl?: string,
    error?: string
): Promise<void> {
    const updateParts: string[] = ['#status = :status'];
    const exprNames: Record<string, string> = { '#status': 'status' };
    const exprValues: Record<string, string> = { ':status': status };

    if (status === 'complete') {
        updateParts.push('completedAt = :completedAt');
        exprValues[':completedAt'] = new Date().toISOString();
    }
    if (outputUrl) {
        updateParts.push('outputUrl = :outputUrl');
        exprValues[':outputUrl'] = outputUrl;
    }
    if (error) {
        updateParts.push('#error = :error');
        exprNames['#error'] = 'error';
        exprValues[':error'] = error;
    }

    await chatDynamoDocumentClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${slug}`, SK: `MEDIAJOB#${jobId}` },
        UpdateExpression: `SET ${updateParts.join(', ')}`,
        ExpressionAttributeNames: exprNames,
        ExpressionAttributeValues: exprValues,
    }));
}

// ── Asset Records ──────────────────────────────────────────────────────────

export async function saveAssetRecord(slug: string, record: AssetRecord): Promise<void> {
    await chatDynamoDocumentClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
            PK: `CAMPAIGN#${slug}`,
            SK: `MEDIA#ASSET#${record.assetId}`,
            ...record,
        },
    }));
}

export async function getAssetsByType(slug: string, assetType: AssetType): Promise<AssetRecord[]> {
    const result = await chatDynamoDocumentClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        FilterExpression: 'assetType = :assetType AND active = :active',
        ExpressionAttributeValues: {
            ':pk': `CAMPAIGN#${slug}`,
            ':prefix': 'MEDIA#ASSET#',
            ':assetType': assetType,
            ':active': true,
        },
    }));
    return (result.Items ?? []) as AssetRecord[];
}

// ── Media Manifest ─────────────────────────────────────────────────────────

export async function saveMediaManifest(manifest: CampaignMediaManifest): Promise<void> {
    await chatDynamoDocumentClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
            PK: `CAMPAIGN#${manifest.slug}`,
            SK: 'MEDIA#MANIFEST',
            manifestJson: JSON.stringify(manifest),
            generatedAt: manifest.generatedAt,
            totalAssets: manifest.totalAssets,
            completionStatus: manifest.completionStatus,
        },
    }));
}

export async function getMediaManifest(slug: string): Promise<CampaignMediaManifest | null> {
    const result = await chatDynamoDocumentClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${slug}`, SK: 'MEDIA#MANIFEST' },
    }));
    if (!result.Item) return null;
    return JSON.parse(result.Item.manifestJson as string) as CampaignMediaManifest;
}

// ── Campaign METADATA Updates ──────────────────────────────────────────────

export type MediaStatus = 'not_started' | 'generating' | 'partial' | 'ready';

export async function updateCampaignMediaStatus(
    slug: string,
    mediaStatus: MediaStatus,
    mediaManifestUrl?: string
): Promise<void> {
    const updateParts = ['mediaStatus = :mediaStatus', 'updatedAt = :updatedAt'];
    const exprValues: Record<string, string> = {
        ':mediaStatus': mediaStatus,
        ':updatedAt': new Date().toISOString(),
    };

    if (mediaStatus === 'ready' || mediaStatus === 'partial') {
        updateParts.push('mediaGeneratedAt = :mediaGeneratedAt');
        exprValues[':mediaGeneratedAt'] = new Date().toISOString();
    }
    if (mediaManifestUrl) {
        updateParts.push('mediaManifestUrl = :mediaManifestUrl');
        exprValues[':mediaManifestUrl'] = mediaManifestUrl;
    }

    await chatDynamoDocumentClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${slug}`, SK: 'METADATA' },
        UpdateExpression: `SET ${updateParts.join(', ')}`,
        ExpressionAttributeValues: exprValues,
    }));
}
