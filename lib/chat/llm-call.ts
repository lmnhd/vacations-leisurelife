import OpenAI from 'openai';
import type { ChatMessage } from './types';
import { generateObject } from 'ai';
import { openai as vercelOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { ModelName, getModelConfig, modelForTask } from '@/lib/ai/llm-gateway';

const COMPLETION_TOKENS_MODELS = ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5.2', 'gpt-5.2-pro', 'o1', 'o1-mini', 'o3', 'o3-mini'];

// ─── Model constants — resolved through the gateway registry ─────────────────
/** Primary reasoning / agentic chat model */
export const MODEL_MAIN  = ModelName.CLAUDE_4_SONNET;  // agentic: balanced utility + tool-use
/** Lightweight tasks: classification, intent, JSON extraction */
export const MODEL_FAST  = modelForTask('legacy_decision'); // legacy lightweight decision profile
/** Voice pipeline text-mode fallback */
export const MODEL_VOICE = ModelName.CLAUDE_4_SONNET;  // agentic

/**
 * Resolves a ModelName (or raw string for backward compat) to its API-level model ID.
 * ModelName values are looked up in the registry; unknown strings pass through as-is.
 */
export function resolveModelApiId(model: string): string {
    const allNames = Object.values(ModelName) as string[];
    if (allNames.includes(model)) {
        const cfg = getModelConfig(model as ModelName);
        return cfg.apiId ?? model;
    }
    return model; // backward-compat pass-through for unknown/legacy model strings
}

export async function callGlobalGenerateObject<T>(options: {
    system?: string;
    prompt: string;
    schema: z.ZodSchema<T>;
    modelName?: ModelName;
    timeoutMs?: number;
    maxOutputTokens?: number;
    operationName?: string;
    maxCandidates?: number;
    skipRepair?: boolean;
}) {
    const targetModel = options.modelName ?? MODEL_FAST;
    const apiId = resolveModelApiId(targetModel);
    const operationName = options.operationName ?? 'generateObject';
    const timeoutMs = options.timeoutMs ?? 120000;
    const baseMaxOutputTokens = options.maxOutputTokens ?? 4000;
    const fallbackApiId = process.env.OPENAI_FALLBACK_MODEL?.trim();
    const maxCandidates = options.maxCandidates ?? 3;
    const allCandidates = [
        apiId,
        apiId, // retry once on the same model for transient empty responses
        ...(fallbackApiId && fallbackApiId !== apiId ? [fallbackApiId] : []),
    ];
    const candidateModels = allCandidates.slice(0, maxCandidates);
    const attemptTokenLimits = candidateModels.map((_, index) => {
        const multiplier = index === 0 ? 1 : index === 1 ? 2 : 4;
        // Avoid 400s on models with smaller output-token caps (e.g. gpt-4o ~16k).
        return Math.min(baseMaxOutputTokens * multiplier, 16384);
    });
    
    console.log(`[${operationName}] Starting structured generation with ${apiId}...`);
    const startTime = Date.now();
    
    const openai = new OpenAI({ timeout: timeoutMs });
    
    try {
        let lastError: Error | null = null;

        for (let index = 0; index < candidateModels.length; index++) {
            const activeModel = candidateModels[index] ?? apiId;
            const maxOutputTokens = attemptTokenLimits[index] ?? baseMaxOutputTokens;
            const attempt = index + 1;
            const totalAttempts = candidateModels.length;

            try {
                if (attempt > 1) {
                    console.warn(`[${operationName}] Retry ${attempt}/${totalAttempts} using model ${activeModel} (maxOutputTokens=${maxOutputTokens})`);
                }

                const systemContent = [
                    'Return only valid JSON that matches the requested schema.',
                    options.system?.trim() ?? '',
                ].filter(Boolean).join('\n\n');

                const requestJson = async (userContent: string) => {
                    const completion = await openai.chat.completions.create({
                        model: activeModel,
                        messages: [
                            {
                                role: 'system' as const,
                                content: systemContent,
                            },
                            {
                                role: 'user' as const,
                                content: userContent,
                            },
                        ],
                        response_format: { type: 'json_object' },
                        ...tokenParam(activeModel, maxOutputTokens),
                        ...tempParam(activeModel, 0.7),
                    }, { timeout: timeoutMs });

                    const choice = completion.choices[0];
                    const rawJson = choice?.message?.content?.trim();
                    if (!rawJson) {
                        const refusal = (choice?.message as { refusal?: string | null } | undefined)?.refusal ?? null;
                        throw new Error(
                            `LLM returned empty response from model ${activeModel} (finish_reason=${choice?.finish_reason ?? 'unknown'}, refusal=${refusal ?? 'none'}, prompt_chars=${options.prompt.length}, max_output_tokens=${maxOutputTokens})`
                        );
                    }

                    return rawJson;
                };

                const parseSchema = (rawJson: string): T => {
                    const parsed = JSON.parse(rawJson);
                    return options.schema.parse(parsed);
                };

                const rawJson = await requestJson(options.prompt);
                let result: T;
                try {
                    result = parseSchema(rawJson);
                } catch (error) {
                    if (!(error instanceof z.ZodError)) {
                        throw error;
                    }

                    const issuePreview = JSON.stringify(error.issues.slice(0, 25), null, 2);

                    if (options.skipRepair) {
                        console.warn(`[${operationName}] Schema validation failed for model ${activeModel}; skipRepair=true, throwing immediately.`);
                        throw new Error(`Schema validation failed for model ${activeModel}. Issues: ${issuePreview}`);
                    }

                    console.warn(`[${operationName}] Schema validation failed for model ${activeModel}; attempting JSON repair.`);
                    const repairedRawJson = await requestJson([
                        'Repair the JSON below so it strictly satisfies the target schema.',
                        'Return only valid JSON with the same top-level structure.',
                        'Validation errors to fix:',
                        issuePreview,
                        'JSON to repair:',
                        rawJson,
                    ].join('\n\n'));

                    try {
                        result = parseSchema(repairedRawJson);
                    } catch (repairError) {
                        if (repairError instanceof z.ZodError) {
                            const repairIssuePreview = JSON.stringify(repairError.issues.slice(0, 25), null, 2);
                            throw new Error(`Schema repair failed for model ${activeModel}. Remaining issues: ${repairIssuePreview}`);
                        }
                        throw repairError;
                    }
                }

                const duration = Date.now() - startTime;
                console.log(`[${operationName}] ✅ Completed in ${duration}ms`);
                return { object: result };
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                const isLastAttempt = attempt >= totalAttempts;

                if (isLastAttempt) {
                    throw lastError;
                }

                console.warn(`[${operationName}] Attempt ${attempt} failed: ${lastError.message}`);
            }
        }

        throw lastError ?? new Error('LLM structured generation failed without a detailed error.');
        
    } catch (error) {
        const duration = Date.now() - startTime;
        if (error instanceof OpenAI.APIError && error.code === 'request_timeout') {
            console.error(`[${operationName}] ❌ TIMEOUT after ${duration}ms`);
            throw new Error(`${operationName} timed out after ${timeoutMs}ms`);
        }
        console.error(`[${operationName}] ❌ Failed after ${duration}ms: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

function tokenParam(model: string, count: number): Record<string, number> {
    return COMPLETION_TOKENS_MODELS.some((m) => model.startsWith(m))
        ? { max_completion_tokens: count }
        : { max_tokens: count };
}

function tempParam(model: string, value: number): Record<string, number> {
    return COMPLETION_TOKENS_MODELS.some((m) => model.startsWith(m))
        ? {}
        : { temperature: value };
}

async function callChatLlmAnthropic(apiId: string, history: ChatMessage[]): Promise<string> {
    // @ts-ignore — optional dependency; install @anthropic-ai/sdk to activate
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemMsg = history.find((m) => m.role === 'system');
    const turns = history
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const response = await client.messages.create({
        model: apiId,
        max_tokens: 2000,
        system: systemMsg?.content,
        messages: turns,
        temperature: 0.8,
    });

    const firstBlock = response.content[0];
    const text = firstBlock?.type === 'text' ? firstBlock.text : '';
    if (!text) throw new Error('LLM returned an empty assistant response.');
    return text;
}

export async function callChatLlm(input: {
    history: ChatMessage[];
    /** Pass a ModelName enum value; raw legacy strings are also accepted for backward compat. */
    model?: ModelName | string;
}): Promise<string> {
    const targetModel = input.model ?? MODEL_MAIN;
    const allNames = Object.values(ModelName) as string[];

    if (allNames.includes(targetModel as string)) {
        const config = getModelConfig(targetModel as ModelName);
        if (config.provider === 'anthropic') {
            const apiId = config.apiId ?? (targetModel as string);
            return callChatLlmAnthropic(apiId, input.history);
        }
    }

    // OpenAI-compatible path (openai, groq, legacy models)
    const openai = new OpenAI();
    const apiId = resolveModelApiId(targetModel);

    const completion = await openai.chat.completions.create({
        model: apiId,
        messages: input.history.map((message) => ({
            role: message.role,
            content: message.content,
        })),
        ...tokenParam(apiId, 2000),
        ...tempParam(apiId, 0.8),
    });

    const rawReply = completion.choices[0]?.message?.content;
    if (!rawReply) {
        throw new Error('LLM returned an empty assistant response.');
    }

    return rawReply;
}
