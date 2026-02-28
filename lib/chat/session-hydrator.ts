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

const MAX_STORED_TURNS = 20;  // hard cap in store — system message not counted
const MAX_LLM_TURNS = 12;     // window sent to LLM each call

export function appendSessionMessage(input: {
    sessionId: string;
    message: ChatMessage;
}): void {
    const history = inMemorySessionStore.get(input.sessionId);
    if (!history) {
        throw new Error(`Session ${input.sessionId} is not hydrated.`);
    }

    history.push(input.message);

    // Cap non-system messages in the store so history never bloats server-side
    const systemMessages = history.filter(m => m.role === 'system');
    const nonSystemMessages = history.filter(m => m.role !== 'system');
    if (nonSystemMessages.length > MAX_STORED_TURNS) {
        const trimmed = nonSystemMessages.slice(-MAX_STORED_TURNS);
        history.splice(0, history.length, ...systemMessages, ...trimmed);
    }
}

export function pruneHistoryForLlm(history: ChatMessage[]): ChatMessage[] {
    const systemMessages = history.filter(m => m.role === 'system');
    const nonSystemMessages = history.filter(m => m.role !== 'system');
    const pruned = nonSystemMessages.slice(-MAX_LLM_TURNS);
    return [...systemMessages, ...pruned];
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
