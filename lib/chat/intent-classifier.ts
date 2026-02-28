/**
 * Intent Classifier
 *
 * Replaces keyword-based deriveSessionSignal in pipeline.ts.
 * Uses gpt-4o-mini to read the conversation and return structured intent signals
 * that drive context resolution (which tools are available, which skill loads, etc.)
 */

import { z } from 'zod';
import { callChatLlm, MODEL_FAST } from './llm-call';

const IntentSignalSchema = z.object({
    hasCruised: z.boolean().nullable(),
    requestedSpecificCruise: z.boolean(),
    incompleteProfile: z.boolean(),
    discussesPastCruise: z.boolean(),
    onActiveBooking: z.boolean(),
    completedCruise: z.boolean(),
});

export type IntentSignal = z.infer<typeof IntentSignalSchema>;

const CLASSIFIER_PROMPT = {
    role: 'user' as const,
    content: `You are a session intent classifier for a cruise booking AI assistant.

Read the conversation below and return a JSON object with these exact fields:

{
  "hasCruised": true | false | null,
  "requestedSpecificCruise": true | false,
  "incompleteProfile": true | false,
  "discussesPastCruise": true | false,
  "onActiveBooking": true | false,
  "completedCruise": true | false
}

Field definitions:
- hasCruised: Has the user indicated they have previously been on a cruise? null if not mentioned.
- requestedSpecificCruise: Is the user actively trying to find, search, book, or price a cruise right now? True for any intent to search or shop for a cruise — regardless of phrasing. Examples that should be true: "find me a cruise", "what's available from Miami", "I want to go to the Bahamas", "show me options", "any cruises in July?", "look for something for two people".
- incompleteProfile: Is this the very start of the conversation with no user context yet?
- discussesPastCruise: Is the user talking about a cruise they previously took?
- onActiveBooking: Is the user asking about a booking they have already made?
- completedCruise: Did the user recently return from a cruise?

Return ONLY the raw JSON object. No markdown, no explanation.`,
};

export async function classifyIntent(conversationText: string): Promise<IntentSignal> {
    if (!conversationText.trim()) {
        return {
            hasCruised: null,
            requestedSpecificCruise: false,
            incompleteProfile: true,
            discussesPastCruise: false,
            onActiveBooking: false,
            completedCruise: false,
        };
    }

    const userMessage = {
        id: 'ic-1',
        role: 'user' as const,
        content: `${CLASSIFIER_PROMPT.content}\n\n---\nCONVERSATION:\n${conversationText}`,
        timestamp: Date.now(),
    };

    try {
        const raw = await callChatLlm({
            history: [userMessage],
            model: MODEL_FAST,
        });

        const cleaned = raw.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
        const parsed = JSON.parse(cleaned) as unknown;
        return IntentSignalSchema.parse(parsed);
    } catch (err) {
        console.error('[intent-classifier] Failed to parse LLM response, using safe defaults:', err);
        return {
            hasCruised: null,
            requestedSpecificCruise: false,
            incompleteProfile: false,
            discussesPastCruise: false,
            onActiveBooking: false,
            completedCruise: false,
        };
    }
}
