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
}) {
    // Resolve model through the gateway registry — falls back to MODEL_FAST (legacy decision profile)
    const targetModel = options.modelName ?? MODEL_FAST;
    const apiId = resolveModelApiId(targetModel);
    const model = vercelOpenAI(apiId);
    return generateObject({
        model,
        schema: options.schema,
        system: options.system,
        prompt: options.prompt,
    });
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

export async function callChatLlm(input: {
    history: ChatMessage[];
    /** Pass a ModelName enum value; raw legacy strings are also accepted for backward compat. */
    model?: ModelName | string;
}): Promise<string> {
    const openai = new OpenAI();
    // Resolve through the gateway registry so model selection stays centralised.
    const apiId = resolveModelApiId(input.model ?? MODEL_MAIN);

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
