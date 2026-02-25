import { randomUUID } from 'node:crypto';
import type { ChatMessage } from './types';
import { appendSessionMessage } from './session-hydrator';
import { chatStorageService } from './chat-storage';

function deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...target };
    for (const key of Object.keys(source)) {
        const sourceValue = source[key];
        const targetValue = result[key];
        if (
            sourceValue !== null &&
            typeof sourceValue === 'object' &&
            !Array.isArray(sourceValue) &&
            targetValue !== null &&
            typeof targetValue === 'object' &&
            !Array.isArray(targetValue)
        ) {
            result[key] = deepMerge(
                targetValue as Record<string, unknown>,
                sourceValue as Record<string, unknown>
            );
        } else if (typeof sourceValue === 'boolean' && typeof targetValue === 'boolean' && targetValue === true && sourceValue === false) {
            // Never downgrade a confirmed true to false — a later turn not mentioning a fact doesn't negate it
        } else if (typeof sourceValue === 'string' && sourceValue.trim() === '' && typeof targetValue === 'string' && targetValue.trim() !== '') {
            // Never overwrite a populated string field with an empty string
        } else {
            result[key] = sourceValue;
        }
    }
    return result;
}

export async function updateState(input: {
    userId: string;
    sessionId: string;
    activeContextPath: string;
    assistantMessage: ChatMessage;
    userMessage: ChatMessage;
    extractedFacts: Record<string, unknown>;
    toolCallsLog: Array<Record<string, unknown>>;
}): Promise<void> {
    appendSessionMessage({
        sessionId: input.sessionId,
        message: input.assistantMessage,
    });

    const turnId = randomUUID();

    await Promise.all([
        chatStorageService.appendConversationTurn({
            userId: input.userId,
            turnId: `${turnId}-user`,
            sessionId: input.sessionId,
            role: 'user',
            content: input.userMessage.content,
            resolvedContext: input.activeContextPath,
            extractedFacts: {},
            toolCallsLog: [],
        }),
        chatStorageService.appendConversationTurn({
            userId: input.userId,
            turnId: `${turnId}-assistant`,
            sessionId: input.sessionId,
            role: 'assistant',
            content: input.assistantMessage.content,
            resolvedContext: input.activeContextPath,
            extractedFacts: input.extractedFacts,
            toolCallsLog: input.toolCallsLog,
        }),
    ]);

    const hasExtractedFields =
        Object.keys(input.extractedFacts).some((key) => key !== 'metadata');

    if (hasExtractedFields) {
        const existingProfile = await chatStorageService.getGuestProfile({
            userId: input.userId,
        });

        const existingGuestInfo =
            existingProfile && typeof existingProfile.guestInfo === 'object' && existingProfile.guestInfo !== null
                ? (existingProfile.guestInfo as Record<string, unknown>)
                : {};

        const existingCompletion =
            existingProfile && typeof existingProfile.profileCompletion === 'object' && existingProfile.profileCompletion !== null
                ? (existingProfile.profileCompletion as Record<string, unknown>)
                : {};

        const { metadata: _metadata, ...factsWithoutMetadata } = input.extractedFacts;

        const mergedGuestInfo: Record<string, unknown> = deepMerge(
            existingGuestInfo,
            factsWithoutMetadata
        );

        const updatedCompletion: Record<string, unknown> = {
            ...existingCompletion,
            lastUpdatedIso: new Date().toISOString(),
            lastContextPath: input.activeContextPath,
        };

        await chatStorageService.putGuestProfile({
            userId: input.userId,
            guestInfo: mergedGuestInfo,
            profileCompletion: updatedCompletion,
            anonSessionId: input.sessionId,
        });
    }
}
