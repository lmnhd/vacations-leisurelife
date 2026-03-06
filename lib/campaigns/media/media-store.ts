import { PutCommand, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { chatDynamoDocumentClient } from '@/lib/chat/dynamo-client';
import {
    AssetRecord,
    MediaGenerationJob,
    CampaignMediaManifest,
    AssetType,
    ReviewStatus,
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

export async function getActiveAssetRecord(slug: string, assetId: string): Promise<AssetRecord | null> {
    const result = await chatDynamoDocumentClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${slug}`, SK: `MEDIA#ASSET#${assetId}` },
    }));
    if (!result.Item) return null;
    return result.Item as AssetRecord;
}

export async function deactivateAssetRecord(slug: string, assetId: string): Promise<void> {
    await chatDynamoDocumentClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${slug}`, SK: `MEDIA#ASSET#${assetId}` },
        UpdateExpression: 'SET active = :false',
        ExpressionAttributeValues: { ':false': false },
    }));
}

function updateAssetInCollection(records: AssetRecord[], updatedRecord: AssetRecord): AssetRecord[] {
    return records.map((record) => {
        if (record.assetId !== updatedRecord.assetId) {
            return record;
        }

        return updatedRecord;
    });
}

function updateAssetInManifest(manifest: CampaignMediaManifest, updatedRecord: AssetRecord): CampaignMediaManifest {
    return {
        ...manifest,
        images: {
            ...manifest.images,
            shipReferences: updateAssetInCollection(manifest.images.shipReferences, updatedRecord),
            hero: updateAssetInCollection(manifest.images.hero, updatedRecord),
            aestheticConcepts: updateAssetInCollection(manifest.images.aestheticConcepts, updatedRecord),
            platformCrops: Object.fromEntries(
                Object.entries(manifest.images.platformCrops).map(([formatKey, records]) => [
                    formatKey,
                    updateAssetInCollection(records, updatedRecord),
                ])
            ) as CampaignMediaManifest['images']['platformCrops'],
        },
        videos: {
            tiktokSeed: manifest.videos.tiktokSeed?.assetId === updatedRecord.assetId ? updatedRecord : manifest.videos.tiktokSeed,
            heroExplainer: manifest.videos.heroExplainer?.assetId === updatedRecord.assetId ? updatedRecord : manifest.videos.heroExplainer,
            thresholdAnnouncement: manifest.videos.thresholdAnnouncement?.assetId === updatedRecord.assetId ? updatedRecord : manifest.videos.thresholdAnnouncement,
            countdown: updateAssetInCollection(manifest.videos.countdown, updatedRecord),
            broll: updateAssetInCollection(manifest.videos.broll, updatedRecord),
        },
        audio: {
            ambientNarration: manifest.audio.ambientNarration?.assetId === updatedRecord.assetId ? updatedRecord : manifest.audio.ambientNarration,
            hypeClip: manifest.audio.hypeClip?.assetId === updatedRecord.assetId ? updatedRecord : manifest.audio.hypeClip,
            themeMusic: manifest.audio.themeMusic?.assetId === updatedRecord.assetId ? updatedRecord : manifest.audio.themeMusic,
        },
        merch: {
            ...manifest.merch,
            designs: updateAssetInCollection(manifest.merch.designs, updatedRecord),
            mockups: updateAssetInCollection(manifest.merch.mockups, updatedRecord),
        },
    };
}

export async function updateAssetReview(
    slug: string,
    assetId: string,
    reviewStatus: ReviewStatus,
    reviewNotes?: string,
): Promise<AssetRecord> {
    const existingRecord = await getActiveAssetRecord(slug, assetId);
    if (!existingRecord) {
        throw new Error(`Media asset not found: ${assetId}`);
    }

    const updatedRecord: AssetRecord = {
        ...existingRecord,
        reviewStatus,
        reviewedAt: new Date().toISOString(),
        ...(reviewNotes !== undefined ? { reviewNotes } : {}),
    };

    if (reviewNotes === undefined && existingRecord.reviewNotes !== undefined) {
        delete updatedRecord.reviewNotes;
    }

    await saveAssetRecord(slug, updatedRecord);

    const existingManifest = await getMediaManifest(slug);
    if (existingManifest) {
        const updatedManifest = updateAssetInManifest(existingManifest, updatedRecord);
        await saveMediaManifest(updatedManifest);
    }

    return updatedRecord;
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

// ── Asset Binary Storage (DynamoDB fallback when R2 is unavailable) ───────
// DynamoDB max item: 400 KB. Caller must ensure base64-encoded buffer fits.

export async function storeAssetBinary(
    slug: string,
    assetId: string,
    bufferBase64: string,
    mimeType: string,
): Promise<void> {
    await chatDynamoDocumentClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
            PK: `CAMPAIGN#${slug}`,
            SK: `MEDIA#BINARY#${assetId}`,
            bufferBase64,
            mimeType,
            storedAt: new Date().toISOString(),
        },
    }));
}

export async function getAssetBinary(
    slug: string,
    assetId: string,
): Promise<{ bufferBase64: string; mimeType: string } | null> {
    const result = await chatDynamoDocumentClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${slug}`, SK: `MEDIA#BINARY#${assetId}` },
    }));
    if (!result.Item) return null;
    return {
        bufferBase64: result.Item.bufferBase64 as string,
        mimeType: result.Item.mimeType as string,
    };
}

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
