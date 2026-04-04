import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { chatDynamoDocumentClient } from '@/lib/chat/dynamo-client';

/**
 * DynamoDB table shared with campaigns and agent jobs.
 * Provider token items use:
 *   PK = PROVIDER_TOKEN#<provider>   (e.g. PROVIDER_TOKEN#tiktok)
 *   SK = ACCOUNT#<accountLabel>      (e.g. ACCOUNT#business)
 */
const TABLE_NAME = 'lll-shadow-campaigns';

/**
 * Mutable fields written on every upsert.
 * Timestamps are stored as ISO-8601 strings for DynamoDB compatibility.
 */
export interface ProviderTokenData {
    accessToken: string;
    refreshToken: string;
    openId: string;
    scope: string | null;
    accessTokenExpiresAt: Date | null;
    refreshTokenExpiresAt: Date | null;
    lastRefreshedAt: Date | null;
}

export interface ProviderTokenRecord extends ProviderTokenData {
    provider: string;
    accountLabel: string;
    createdAt: string;
    updatedAt: string;
}

interface ProviderTokenDynamoItem {
    PK: string;
    SK: string;
    provider: string;
    accountLabel: string;
    accessToken: string;
    refreshToken: string;
    openId: string;
    scope: string | null;
    accessTokenExpiresAt: string | null;
    refreshTokenExpiresAt: string | null;
    lastRefreshedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

function itemToRecord(item: ProviderTokenDynamoItem): ProviderTokenRecord {
    return {
        provider: item.provider,
        accountLabel: item.accountLabel,
        accessToken: item.accessToken,
        refreshToken: item.refreshToken,
        openId: item.openId,
        scope: item.scope,
        accessTokenExpiresAt: item.accessTokenExpiresAt ? new Date(item.accessTokenExpiresAt) : null,
        refreshTokenExpiresAt: item.refreshTokenExpiresAt ? new Date(item.refreshTokenExpiresAt) : null,
        lastRefreshedAt: item.lastRefreshedAt ? new Date(item.lastRefreshedAt) : null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    };
}

/**
 * Loads the stored token record for a given provider + accountLabel.
 * Returns null when no record has been written yet (bootstrap required).
 */
export async function loadProviderToken(
    provider: string,
    accountLabel: string,
): Promise<ProviderTokenRecord | null> {
    const result = await chatDynamoDocumentClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: {
            PK: `PROVIDER_TOKEN#${provider}`,
            SK: `ACCOUNT#${accountLabel}`,
        },
    }));

    if (!result.Item) {
        return null;
    }

    return itemToRecord(result.Item as ProviderTokenDynamoItem);
}

/**
 * Creates or updates the token record for a given provider + accountLabel.
 * Call this after a successful OAuth exchange or token refresh so that
 * subsequent local runs load the current token set without env edits.
 */
export async function upsertProviderToken(
    provider: string,
    accountLabel: string,
    data: ProviderTokenData,
): Promise<ProviderTokenRecord> {
    const now = new Date().toISOString();

    // Preserve original createdAt if record already exists
    const existing = await loadProviderToken(provider, accountLabel);
    const createdAt = existing?.createdAt ?? now;

    const item: ProviderTokenDynamoItem = {
        PK: `PROVIDER_TOKEN#${provider}`,
        SK: `ACCOUNT#${accountLabel}`,
        provider,
        accountLabel,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        openId: data.openId,
        scope: data.scope,
        accessTokenExpiresAt: data.accessTokenExpiresAt?.toISOString() ?? null,
        refreshTokenExpiresAt: data.refreshTokenExpiresAt?.toISOString() ?? null,
        lastRefreshedAt: data.lastRefreshedAt?.toISOString() ?? null,
        createdAt,
        updatedAt: now,
    };

    await chatDynamoDocumentClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
    }));

    return itemToRecord(item);
}
