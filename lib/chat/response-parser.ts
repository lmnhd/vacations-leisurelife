/**
 * Response Parser — Extracts display directives from raw LLM output.
 *
 * Directive syntax the agent uses:
 *   [Image: "Celebrity Cruise Ship Swimming pool"]
 *
 * The parser strips these from the reply text and returns them
 * as structured data alongside the clean message.
 */

// ─── Parsed Result ────────────────────────────────────────────────────────────

export interface ParsedImageDirective {
    query: string;
}

export interface ParsedResponse {
    cleanText: string;
    image?: ParsedImageDirective;
}

// ─── Regex Patterns ───────────────────────────────────────────────────────────

const IMAGE_DIRECTIVE_REGEX = /\[Image:\s*"([^"]+)"\]/gi;

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseResponse(rawText: string): ParsedResponse {
    let cleanText = rawText;
    let image: ParsedImageDirective | undefined;

    // Extract [Image: "..."] — take the first one found
    const imageMatch = IMAGE_DIRECTIVE_REGEX.exec(rawText);
    if (imageMatch) {
        image = { query: imageMatch[1] };
        // Remove ALL image directives from the display text
        cleanText = cleanText.replace(IMAGE_DIRECTIVE_REGEX, '').trim();
    }

    // Reset regex lastIndex (since it's global)
    IMAGE_DIRECTIVE_REGEX.lastIndex = 0;

    return { cleanText, image };
}
