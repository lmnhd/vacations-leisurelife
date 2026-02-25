import type { ChatMessage } from './types';
import { appendSessionMessage } from './session-hydrator';

export async function updateState(input: {
    sessionId: string;
    assistantMessage: ChatMessage;
    extractedFacts: Record<string, unknown>;
}): Promise<void> {
    appendSessionMessage({
        sessionId: input.sessionId,
        message: input.assistantMessage,
    });
}
