import { callLLM, modelForTask } from '@/lib/ai/llm-gateway';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const PROMPT_DATA_ROOT = path.join(process.cwd(), 'lib', 'chat', 'prompt-data');
const PREFERENCE_MINING_SKILL_PATH = path.join(
    PROMPT_DATA_ROOT,
    'skills',
    'data-collection',
    'preference-mining.md'
);

async function loadExtractionPrompt(): Promise<string> {
    return readFile(PREFERENCE_MINING_SKILL_PATH, 'utf-8');
}

function buildExtractionUserMessage(input: {
    userMessage: string;
    assistantReply: string;
}): string {
    return [
        'User said:',
        input.userMessage,
        '',
        'Assistant replied:',
        input.assistantReply,
    ].join('\n');
}

function parseExtractedJson(rawText: string): Record<string, unknown> {
    const trimmed = rawText.trim();
    if (trimmed === '{}' || trimmed.length === 0) {
        return {};
    }

    try {
        const parsed: unknown = JSON.parse(trimmed);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
        return {};
    } catch {
        return {};
    }
}

export async function extractMemoryFacts(input: {
    sessionId: string;
    activeContextPath: string;
    userMessage: string;
    assistantReply: string;
}): Promise<Record<string, unknown>> {
    const extractionPrompt = await loadExtractionPrompt();
    const userMessage = buildExtractionUserMessage(input);

    // Legacy extraction profile: cheap, deterministic extraction task — routed through the gateway
    const { content: rawReply } = await callLLM(modelForTask('legacy_extraction'), userMessage, {
        systemPrompt: extractionPrompt,
        maxTokens:    400,
        temperature:  0,
    });

    const extractedFields = parseExtractedJson(rawReply);

    return {
        metadata: {
            sessionId: input.sessionId,
            activeContextPath: input.activeContextPath,
            extractedAtIso: new Date().toISOString(),
        },
        ...extractedFields,
    };
}
