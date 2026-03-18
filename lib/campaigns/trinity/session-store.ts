import { PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { chatDynamoDocumentClient } from '@/lib/chat/dynamo-client';
import type { TrinitySession } from './types';

// ────────────────────────────────────────────────────────────────────────────
// Contract
// ────────────────────────────────────────────────────────────────────────────

export interface TrinitySessionStore {
    save(session: TrinitySession): Promise<void>;
    get(sessionId: string): Promise<TrinitySession | null>;
    listForCampaign(campaignId: string): Promise<TrinitySession[]>;
}

export class TrinitySessionStoreNotImplementedError extends Error {
    constructor() {
        super('Trinity session store is not implemented yet.');
        this.name = 'TrinitySessionStoreNotImplementedError';
    }
}

// ────────────────────────────────────────────────────────────────────────────
// DynamoDB implementation — reuses lll-shadow-campaigns table
// PK: CAMPAIGN#${campaignId}  SK: TRINITY#SESSION#${sessionId}
// ────────────────────────────────────────────────────────────────────────────

const TABLE_NAME = 'lll-shadow-campaigns';

function buildPK(campaignId: string): string {
    return `CAMPAIGN#${campaignId}`;
}

function buildSK(sessionId: string): string {
    return `TRINITY#SESSION#${sessionId}`;
}

export const dynamoTrinitySessionStore: TrinitySessionStore = {
    async save(session: TrinitySession): Promise<void> {
        const params = {
            TableName: TABLE_NAME,
            Item: {
                PK: buildPK(session.campaignId),
                SK: buildSK(session.sessionId),
                ...session,
            },
        };

        try {
            await chatDynamoDocumentClient.send(new PutCommand(params));
        } catch (error) {
            console.error(`[trinity:session-store] Failed to save session ${session.sessionId}:`, error);
            throw error;
        }
    },

    async get(sessionId: string): Promise<TrinitySession | null> {
        const scanParams = {
            TableName: TABLE_NAME,
            FilterExpression: 'sessionId = :sid',
            ExpressionAttributeValues: { ':sid': sessionId },
        };

        // NOTE: sessionId lookup without campaignId requires a Scan.
        // For production scale, add a GSI on sessionId. For now this is test-only traffic.
        try {
            const response = await chatDynamoDocumentClient.send(new ScanCommand(scanParams));
            if (!response.Items || response.Items.length === 0) return null;
            const { PK, SK, ...sessionData } = response.Items[0];
            return sessionData as TrinitySession;
        } catch (error) {
            console.error(`[trinity:session-store] Failed to get session ${sessionId}:`, error);
            throw error;
        }
    },

    async listForCampaign(campaignId: string): Promise<TrinitySession[]> {
        const params = {
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
            ExpressionAttributeValues: {
                ':pk': buildPK(campaignId),
                ':skPrefix': 'TRINITY#SESSION#',
            },
        };

        try {
            const response = await chatDynamoDocumentClient.send(new QueryCommand(params));
            if (!response.Items) return [];
            return response.Items.map(({ PK, SK, ...sessionData }) => sessionData as TrinitySession);
        } catch (error) {
            console.error(`[trinity:session-store] Failed to list sessions for campaign ${campaignId}:`, error);
            throw error;
        }
    },
};
