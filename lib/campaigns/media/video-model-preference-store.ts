import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { chatDynamoDocumentClient } from '@/lib/chat/dynamo-client';
import { normalizeVideoModelPresetId, type VideoModelPresetId } from './video-models';

const TABLE_NAME = 'lll-shadow-campaigns';
const VIDEO_MODEL_PREFERENCE_PK = 'APP_CONFIG#MEDIA';
const VIDEO_MODEL_PREFERENCE_SK = 'SETTINGS#VIDEO_MODEL_PREFERENCE';

interface StoredVideoModelPreferenceRecord {
    PK: string;
    SK: string;
    presetId: string;
    updatedAt: string;
}

export async function getPersistedVideoModelPresetId(): Promise<VideoModelPresetId | null> {
    const response = await chatDynamoDocumentClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: {
            PK: VIDEO_MODEL_PREFERENCE_PK,
            SK: VIDEO_MODEL_PREFERENCE_SK,
        },
    }));

    const item = response.Item as StoredVideoModelPreferenceRecord | undefined;
    return normalizeVideoModelPresetId(item?.presetId) ?? null;
}

export async function savePersistedVideoModelPresetId(presetId: VideoModelPresetId): Promise<void> {
    await chatDynamoDocumentClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
            PK: VIDEO_MODEL_PREFERENCE_PK,
            SK: VIDEO_MODEL_PREFERENCE_SK,
            presetId,
            updatedAt: new Date().toISOString(),
        } satisfies StoredVideoModelPreferenceRecord,
    }));
}