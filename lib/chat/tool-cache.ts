import { createHash } from 'crypto';
import prismadb from '@/lib/prismadb';

const CACHE_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('ToolCache: DB timeout')), CACHE_TIMEOUT_MS)
        ),
    ]);
}

/**
 * Creates a deterministic SHA-256 hash of a JSON payload.
 * Sorts object keys so {a:1, b:2} and {b:2, a:1} hash to the same value.
 */
function hashPayload(payload: unknown): string {
    const stringified = JSON.stringify(payload, (_, value) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return Object.keys(value)
                .sort()
                .reduce((acc, key) => {
                    acc[key] = value[key as keyof typeof value];
                    return acc;
                }, {} as Record<string, unknown>);
        }
        return value;
    });

    return createHash('sha256').update(stringified).digest('hex');
}

/**
 * Checks the database for a valid, non-expired cache entry for a given tool and payload.
 */
export async function getToolCache<T>(toolId: string, payload: unknown): Promise<T | null> {
    const payloadHash = hashPayload(payload);

    try {
        const cached = await withTimeout(prismadb.agentToolCache.findUnique({
            where: {
                toolId_payloadHash: {
                    toolId,
                    payloadHash,
                },
            },
        }));

        if (!cached) {
            return null;
        }

        if (new Date() > cached.expiresAt) {
            // Delete expired cache asynchronously to clean up DB
            prismadb.agentToolCache.delete({
                where: { id: cached.id },
            }).catch(console.error);
            return null;
        }

        return JSON.parse(cached.response) as T;
    } catch (error) {
        console.error(`[ToolCache] Failed to get cache for ${toolId}:`, error);
        return null;
    }
}

/**
 * Saves a tool response to the database cache.
 * @param ttlSeconds How long the cache should live (default 24 hours)
 */
export async function setToolCache(
    toolId: string,
    payload: unknown,
    response: unknown,
    ttlSeconds: number = 86400
): Promise<void> {
    const payloadHash = hashPayload(payload);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const serializedResponse = JSON.stringify(response);

    try {
        await withTimeout(prismadb.agentToolCache.upsert({
            where: {
                toolId_payloadHash: {
                    toolId,
                    payloadHash,
                },
            },
            update: {
                response: serializedResponse,
                expiresAt,
            },
            create: {
                toolId,
                payloadHash,
                response: serializedResponse,
                expiresAt,
            },
        }));
    } catch (error) {
        console.error(`[ToolCache] Failed to set cache for ${toolId}:`, error);
    }
}
