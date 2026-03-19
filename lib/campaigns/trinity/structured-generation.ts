import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getModelConfig, ModelName } from '@/lib/ai/llm-gateway';
import { z } from 'zod';

const TRINITY_GENERATION_TIMEOUT_MS = Number(process.env.TRINITY_GENERATION_TIMEOUT_MS ?? '60000');

function isModelAvailabilityError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    const message = error.message.toLowerCase();
    return message.includes('does not exist')
        || message.includes('do not have access')
        || message.includes('unknown model')
        || message.includes('unsupported model')
        || message.includes('model_not_found');
}

function getStructuredFallbackModel(): string {
    const trinityFallbackModel = process.env.TRINITY_STRUCTURED_FALLBACK_MODEL?.trim();
    if (trinityFallbackModel) {
        return trinityFallbackModel;
    }

    const highTierFallback = getModelConfig(ModelName.GPT_5_HIGH).apiId?.trim();
    if (highTierFallback) {
        return highTierFallback;
    }

    const instantModel = process.env.OPENAI_INSTANT_MODEL?.trim();
    if (instantModel) {
        return instantModel;
    }

    const fallbackModel = process.env.OPENAI_FALLBACK_MODEL?.trim();
    if (fallbackModel) {
        return fallbackModel;
    }

    return 'gpt-5.4-instant';
}

function isRetryableStructuredGenerationError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    const message = error.message.toLowerCase();
    return message.includes('headers timeout')
        || message.includes('cannot connect to api')
        || message.includes('maxretriesexceeded');
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, modelId: string): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
            reject(new Error(`Trinity structured generation timed out after ${timeoutMs}ms using model "${modelId}".`));
        }, timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}

function resolveStructuredModel(
    preferredModel: ModelName,
    warnings: string[],
): { apiId: string; usedFallbackProvider: boolean } {
    const config = getModelConfig(preferredModel);
    if (config.provider === 'openai') {
        return {
            apiId: config.apiId ?? preferredModel,
            usedFallbackProvider: false,
        };
    }

    const fallbackModel = getStructuredFallbackModel();
    warnings.push(
        `Structured Trinity generation does not yet support provider "${config.provider}" directly. Falling back to OpenAI model "${fallbackModel}".`,
    );

    return {
        apiId: fallbackModel,
        usedFallbackProvider: true,
    };
}

export interface StructuredGenerationResult<T> {
    object: T;
    warnings: string[];
    modelId: string;
}

export async function generateStructuredTrinityObject<TSchema extends z.ZodTypeAny>(options: {
    preferredModel: ModelName;
    schema: TSchema;
    system: string;
    prompt: string;
}): Promise<StructuredGenerationResult<z.infer<TSchema>>> {
    const warnings: string[] = [];
    const resolved = resolveStructuredModel(options.preferredModel, warnings);

    const attempt = async (apiId: string) => {
        console.log(`[trinity:structured] attempt model=${apiId}`);
        const { object } = await withTimeout(
            generateObject({
                model: openai(apiId),
                schema: options.schema,
                system: options.system,
                prompt: options.prompt,
            }),
            TRINITY_GENERATION_TIMEOUT_MS,
            apiId,
        );

        return object;
    };

    try {
        const object = await attempt(resolved.apiId);
        return { object, warnings, modelId: resolved.apiId };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown structured generation error';
        console.warn(`[trinity:structured] model=${resolved.apiId} failed: ${message}`);
        if (!isModelAvailabilityError(error) && !isRetryableStructuredGenerationError(error)) {
            throw error;
        }

        const fallbackModel = getStructuredFallbackModel();
        if (resolved.apiId === fallbackModel) {
            throw error;
        }

        warnings.push(
            `Primary structured model "${resolved.apiId}" failed with "${message}". Retrying with fallback model "${fallbackModel}".`,
        );

        const object = await attempt(fallbackModel);
        return { object, warnings, modelId: fallbackModel };
    }
}
