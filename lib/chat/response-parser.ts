/**
 * Response Parser — Extracts display directives from raw LLM output.
 *
 * Directive syntax the agent uses:
 *   [Image: "Celebrity Cruise Ship Swimming pool"]
 *   [Image: "Celebrity Cruise Ship Swimming pool" (3)]
 *   [Image: "Celebrity Cruise Ship Swimming pool (3)"]
 *
 * The parser strips these from the reply text and returns them
 * as structured data alongside the clean message.
 */

import type { ParsedFormDirective } from './types';

// ─── Parsed Result ────────────────────────────────────────────────────────────

export interface ParsedImageDirective {
    query: string;
    count?: number;
    index?: number;
}

export interface ParsedResponse {
    cleanText: string;
    image?: ParsedImageDirective;
    form?: ParsedFormDirective;
    mood?: string;
}

// ─── Regex Patterns ───────────────────────────────────────────────────────────

// Catch [Image: "Query" (N)] or [Images: "Query" (N)]
const IMAGE_DIRECTIVE_REGEX = /\[(Images?):\s*"([^"]+)"(?:\s*\((\d+)\))?\]/gi;

// Catch [Form: { "id": "...", "fields": [...] }] (allows multi-line JSON)
const FORM_DIRECTIVE_REGEX = /\[Form:\s*(\{[\s\S]*?\})\]/gi;

// Catch [Mood: "tropical-day-outdoor"]
const MOOD_DIRECTIVE_REGEX = /\[Mood:\s*"([^"]+)"\]/gi;

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseResponse(rawText: string): ParsedResponse {
    let cleanText = rawText;
    let image: ParsedImageDirective | undefined;
    let mood: string | undefined;

    // Extract [Image: "..."] or [Images: "..."] — take the first one found
    const imageMatch = IMAGE_DIRECTIVE_REGEX.exec(rawText);
    if (imageMatch) {
        const isSlideshow = imageMatch[1] === 'Images';
        let query = imageMatch[2].trim();
        let numberArg: number | undefined;

        // If matched outside quotes: [Image: "Query" (3)]
        if (imageMatch[3]) {
            numberArg = parseInt(imageMatch[3], 10);
        } else {
            // Or embedded inside quotes: [Image: "Query (3)"]
            const embeddedMatch = query.match(/^(.*?)\s*\((\d+)\)$/);
            if (embeddedMatch) {
                query = embeddedMatch[1].trim();
                numberArg = parseInt(embeddedMatch[2], 10);
            }
        }

        if (isSlideshow) {
            image = { query, count: numberArg ? Math.max(1, numberArg) : 3 };
        } else {
            image = { query, index: numberArg ? Math.max(0, numberArg - 1) : undefined };
        }

        // Remove ALL image directives from the display text
        cleanText = cleanText.replace(IMAGE_DIRECTIVE_REGEX, '').trim();
    }

    // Extract [Form: {...}] — parse as JSON
    const formMatch = FORM_DIRECTIVE_REGEX.exec(cleanText);
    let form: ParsedFormDirective | undefined;
    if (formMatch) {
        try {
            const rawJson = formMatch[1];
            // Simple validation: needs id and fields array
            const parsedForm = JSON.parse(rawJson);
            if (parsedForm && typeof parsedForm === 'object' && parsedForm.id && Array.isArray(parsedForm.fields)) {
                form = parsedForm as ParsedFormDirective;
            }
        } catch (err) {
            console.error('[ResponseParser] Failed to parse Form JSON payload:', err);
        }
        // Remove ALL form directives
        cleanText = cleanText.replace(FORM_DIRECTIVE_REGEX, '').trim();
    }

    // Extract [Mood: "xxx"]
    const moodMatch = MOOD_DIRECTIVE_REGEX.exec(cleanText);
    if (moodMatch) {
        mood = moodMatch[1].trim(); // just the string e.g "ship-exterior-day-forward"
        cleanText = cleanText.replace(MOOD_DIRECTIVE_REGEX, '').trim();
    }

    // Reset regex lastIndex (since it's global)
    IMAGE_DIRECTIVE_REGEX.lastIndex = 0;
    FORM_DIRECTIVE_REGEX.lastIndex = 0;
    MOOD_DIRECTIVE_REGEX.lastIndex = 0;

    return { cleanText, image, form, mood };
}
