import {
    GetCommand,
    PutCommand,
    QueryCommand,
    UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { chatDynamoDocumentClient } from './dynamo-client';

const CHAT_SESSIONS_TABLE_NAME = process.env.CHAT_SESSIONS_TABLE_NAME ?? 'lll-chat-sessions';
const GUEST_PROFILES_TABLE_NAME = process.env.GUEST_PROFILES_TABLE_NAME ?? 'lll-guest-profiles';
const CONVERSATIONS_TABLE_NAME = process.env.CONVERSATIONS_TABLE_NAME ?? 'lll-conversations';

const SESSION_ID_INDEX_NAME = 'sessionId-index';

function assertTestEnvironment(): void {
    if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
        throw new Error('This method is test-only and requires NODE_ENV === "test".');
    }
}

export class ChatStorageService {
    public async getSession(input: {
        userId: string;
        sessionId: string;
    }): Promise<Record<string, unknown> | null> {
        const result = await chatDynamoDocumentClient.send(
            new GetCommand({
                TableName: CHAT_SESSIONS_TABLE_NAME,
                Key: {
                    PK: input.userId,
                    SK: `SESSION#${input.sessionId}`,
                },
            })
        );

        const sessionItem = result.Item;
        return sessionItem ? (sessionItem as Record<string, unknown>) : null;
    }

    public async putSession(input: {
        userId: string;
        sessionId: string;
        flowState: Record<string, unknown>;
        activeContextPath: string;
        ttl: number;
    }): Promise<void> {
        await chatDynamoDocumentClient.send(
            new PutCommand({
                TableName: CHAT_SESSIONS_TABLE_NAME,
                Item: {
                    PK: input.userId,
                    SK: `SESSION#${input.sessionId}`,
                    sessionId: input.sessionId,
                    flowState: input.flowState,
                    activeContextPath: input.activeContextPath,
                    ttl: input.ttl,
                    updatedAt: new Date().toISOString(),
                },
            })
        );
    }

    public async getGuestProfile(input: {
        userId: string;
    }): Promise<Record<string, unknown> | null> {
        const result = await chatDynamoDocumentClient.send(
            new GetCommand({
                TableName: GUEST_PROFILES_TABLE_NAME,
                Key: {
                    PK: input.userId,
                },
            })
        );

        const profileItem = result.Item;
        return profileItem ? (profileItem as Record<string, unknown>) : null;
    }

    public async putGuestProfile(input: {
        userId: string;
        guestInfo: Record<string, unknown>;
        profileCompletion: Record<string, unknown>;
        anonSessionId?: string;
    }): Promise<void> {
        await chatDynamoDocumentClient.send(
            new PutCommand({
                TableName: GUEST_PROFILES_TABLE_NAME,
                Item: {
                    PK: input.userId,
                    guestInfo: input.guestInfo,
                    profileCompletion: input.profileCompletion,
                    anonSessionId: input.anonSessionId,
                    updatedAt: new Date().toISOString(),
                },
            })
        );
    }

    public async appendConversationTurn(input: {
        userId: string;
        turnId: string;
        sessionId: string;
        role: 'user' | 'assistant';
        content: string;
        resolvedContext: string;
        extractedFacts: Record<string, unknown>;
        toolCallsLog: Array<Record<string, unknown>>;
        timestampIso?: string;
    }): Promise<void> {
        const timestampIso = input.timestampIso ?? new Date().toISOString();

        await chatDynamoDocumentClient.send(
            new PutCommand({
                TableName: CONVERSATIONS_TABLE_NAME,
                Item: {
                    PK: input.userId,
                    SK: `${timestampIso}#${input.turnId}`,
                    turnId: input.turnId,
                    sessionId: input.sessionId,
                    role: input.role,
                    content: input.content,
                    resolvedContext: input.resolvedContext,
                    extractedFacts: input.extractedFacts,
                    toolCallsLog: input.toolCallsLog,
                    createdAt: timestampIso,
                },
            })
        );
    }

    public async getRecentConversationTurnsByUser(input: {
        userId: string;
        limit: number;
    }): Promise<Array<Record<string, unknown>>> {
        const result = await chatDynamoDocumentClient.send(
            new QueryCommand({
                TableName: CONVERSATIONS_TABLE_NAME,
                KeyConditionExpression: 'PK = :userId',
                ExpressionAttributeValues: {
                    ':userId': input.userId,
                },
                ScanIndexForward: false,
                Limit: input.limit,
            })
        );

        const conversationItems = result.Items ?? [];
        return conversationItems as Array<Record<string, unknown>>;
    }

    public async getConversationTurnsBySession(input: {
        sessionId: string;
        limit: number;
    }): Promise<Array<Record<string, unknown>>> {
        const result = await chatDynamoDocumentClient.send(
            new QueryCommand({
                TableName: CONVERSATIONS_TABLE_NAME,
                IndexName: SESSION_ID_INDEX_NAME,
                KeyConditionExpression: 'sessionId = :sessionId',
                ExpressionAttributeValues: {
                    ':sessionId': input.sessionId,
                },
                ScanIndexForward: true,
                Limit: input.limit,
            })
        );

        const conversationItems = result.Items ?? [];
        return conversationItems as Array<Record<string, unknown>>;
    }

    public async injectTestState(input: {
        userId: string;
        sessionId: string;
        activeContextPath: string;
        flowState: Record<string, unknown>;
        ttl: number;
    }): Promise<void> {
        assertTestEnvironment();

        await chatDynamoDocumentClient.send(
            new UpdateCommand({
                TableName: CHAT_SESSIONS_TABLE_NAME,
                Key: {
                    PK: input.userId,
                    SK: `SESSION#${input.sessionId}`,
                },
                UpdateExpression:
                    'SET activeContextPath = :activeContextPath, flowState = :flowState, ttl = :ttl, updatedAt = :updatedAt',
                ExpressionAttributeValues: {
                    ':activeContextPath': input.activeContextPath,
                    ':flowState': input.flowState,
                    ':ttl': input.ttl,
                    ':updatedAt': new Date().toISOString(),
                },
            })
        );
    }

    public async getFullSnapshot(input: {
        userId: string;
        conversationLimit: number;
    }): Promise<{
        profile: Record<string, unknown> | null;
        sessions: Array<Record<string, unknown>>;
        conversations: Array<Record<string, unknown>>;
    }> {
        assertTestEnvironment();

        const profile = await this.getGuestProfile({ userId: input.userId });

        const sessionsResult = await chatDynamoDocumentClient.send(
            new QueryCommand({
                TableName: CHAT_SESSIONS_TABLE_NAME,
                KeyConditionExpression: 'PK = :userId AND begins_with(SK, :sessionPrefix)',
                ExpressionAttributeValues: {
                    ':userId': input.userId,
                    ':sessionPrefix': 'SESSION#',
                },
                ScanIndexForward: false,
            })
        );

        const conversations = await this.getRecentConversationTurnsByUser({
            userId: input.userId,
            limit: input.conversationLimit,
        });

        return {
            profile,
            sessions: (sessionsResult.Items ?? []) as Array<Record<string, unknown>>,
            conversations,
        };
    }
}

export const chatStorageService = new ChatStorageService();
