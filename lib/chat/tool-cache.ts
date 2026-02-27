import { createHash } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

// ─── DynamoDB client ──────────────────────────────────────────────────────────

const TABLE_NAME = 'AgentToolCache';

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const ddb = DynamoDBDocumentClient.from(ddbClient);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a deterministic SHA-256 hash of a JSON payload.
 * Sorts object keys so {a:1, b:2} and {b:2, a:1} hash to the same value.
 */
function hashPayload(payload: unknown): string {
    const stringified = JSON.stringify(payload, (_, value) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return Object.keys(value as Record<string, unknown>)
                .sort()
                .reduce((acc, key) => {
                    acc[key] = (value as Record<string, unknown>)[key];
                    return acc;
                }, {} as Record<string, unknown>);
        }
        return value;
    });

    return createHash('sha256').update(stringified).digest('hex');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Checks DynamoDB for a valid, non-expired cache entry for a given tool and payload.
 */
export async function getToolCache<T>(toolId: string, payload: unknown): Promise<T | null> {
    const payloadHash = hashPayload(payload);

    try {
        const result = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { toolId, payloadHash },
        }));

        const item = result.Item;
        if (!item) return null;

        const expiresAtMs = (item['expiresAt'] as number) * 1000;
        if (Date.now() > expiresAtMs) return null;

        return JSON.parse(item['response'] as string) as T;
    } catch (error) {
        console.error(`[ToolCache] Failed to get cache for ${toolId}:`, error);
        return null;
    }
}

/**
 * Saves a tool response to DynamoDB cache.
 * @param ttlSeconds How long the cache should live (default 24 hours).
 *                   DynamoDB TTL expects epoch seconds on the item attribute.
 */
export async function setToolCache(
    toolId: string,
    payload: unknown,
    response: unknown,
    ttlSeconds: number = 86400
): Promise<void> {
    const payloadHash = hashPayload(payload);
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

    try {
        await ddb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                toolId,
                payloadHash,
                response: JSON.stringify(response),
                expiresAt,
            },
        }));
    } catch (error) {
        console.error(`[ToolCache] Failed to set cache for ${toolId}:`, error);
    }
}
