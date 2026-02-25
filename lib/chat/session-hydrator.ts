import type { ChatMessage } from './types';

const inMemorySessionStore = new Map<string, ChatMessage[]>();

export function hydrateSession(input: {
    sessionId: string;
    systemPrompt: string;
}): ChatMessage[] {
    const existingHistory = inMemorySessionStore.get(input.sessionId);

    if (!existingHistory) {
        const seededHistory: ChatMessage[] = [
            {
                id: 'system-0',
                role: 'system',
                content: input.systemPrompt,
                timestamp: Date.now(),
            },
        ];

        inMemorySessionStore.set(input.sessionId, seededHistory);
        return seededHistory;
    }

    const systemMessageIndex = existingHistory.findIndex((message) => message.role === 'system');
    if (systemMessageIndex >= 0) {
        existingHistory[systemMessageIndex] = {
            ...existingHistory[systemMessageIndex],
            content: input.systemPrompt,
            timestamp: Date.now(),
        };
    }

    return existingHistory;
}

export function appendSessionMessage(input: {
    sessionId: string;
    message: ChatMessage;
}): void {
    const history = inMemorySessionStore.get(input.sessionId);
    if (!history) {
        throw new Error(`Session ${input.sessionId} is not hydrated.`);
    }

    history.push(input.message);
}

export function getConversationTextForSession(input: {
    sessionId: string;
    pendingMessage?: string;
}): string {
    const sessionHistory = inMemorySessionStore.get(input.sessionId) ?? [];
    const nonSystemContent = sessionHistory
        .filter((message) => message.role !== 'system')
        .map((message) => message.content);

    if (input.pendingMessage) {
        nonSystemContent.push(input.pendingMessage);
    }

    return nonSystemContent.join(' ');
}
