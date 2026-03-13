import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { chatDynamoDocumentClient } from '@/lib/chat/dynamo-client';
import { normalizeElevenLabsVoiceId, type ElevenLabsVoicePreferences } from './elevenlabs-voices';

const TABLE_NAME = 'lll-shadow-campaigns';
const VOICE_PREFERENCE_PK = 'APP_CONFIG#MEDIA';
const VOICE_PREFERENCE_SK = 'SETTINGS#VOICE_PREFERENCES';

interface StoredVoicePreferenceRecord {
    PK: string;
    SK: string;
    narrationVoiceId: string;
    narrationVoiceName?: string | null;
    hypeVoiceId: string;
    hypeVoiceName?: string | null;
    updatedAt: string;
}

function normalizeVoiceName(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

export async function getPersistedElevenLabsVoicePreferences(): Promise<Partial<ElevenLabsVoicePreferences> | null> {
    const response = await chatDynamoDocumentClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: {
            PK: VOICE_PREFERENCE_PK,
            SK: VOICE_PREFERENCE_SK,
        },
        ConsistentRead: true,
    }));

    const item = response.Item as StoredVoicePreferenceRecord | undefined;
    const narrationVoiceId = normalizeElevenLabsVoiceId(item?.narrationVoiceId);
    const hypeVoiceId = normalizeElevenLabsVoiceId(item?.hypeVoiceId);

    if (!narrationVoiceId && !hypeVoiceId) {
        return null;
    }

    return {
        ...(narrationVoiceId ? {
            narrationVoiceId,
            narrationVoiceName: normalizeVoiceName(item?.narrationVoiceName),
        } : {}),
        ...(hypeVoiceId ? {
            hypeVoiceId,
            hypeVoiceName: normalizeVoiceName(item?.hypeVoiceName),
        } : {}),
    };
}

export async function savePersistedElevenLabsVoicePreferences(preferences: ElevenLabsVoicePreferences): Promise<void> {
    await chatDynamoDocumentClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
            PK: VOICE_PREFERENCE_PK,
            SK: VOICE_PREFERENCE_SK,
            narrationVoiceId: preferences.narrationVoiceId,
            narrationVoiceName: preferences.narrationVoiceName,
            hypeVoiceId: preferences.hypeVoiceId,
            hypeVoiceName: preferences.hypeVoiceName,
            updatedAt: new Date().toISOString(),
        } satisfies StoredVoicePreferenceRecord,
    }));
}
