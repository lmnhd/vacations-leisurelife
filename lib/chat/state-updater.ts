import { randomUUID } from 'node:crypto';
import type { ChatMessage } from './types';
import { appendSessionMessage } from './session-hydrator';
import { chatStorageService } from './chat-storage';

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

        const mergedGuestInfo: Record<string, unknown> = {
            ...existingGuestInfo,
            ...factsWithoutMetadata,
        };

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
