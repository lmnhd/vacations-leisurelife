/**
 * Chat Pipeline Orchestrator — Stub implementation.
 *
 * Currently: Single-stage OpenAI chat completion.
 * Target:    10-stage pipeline per CHAT_SYSTEM_BLUEPRINT.md §5.
 *
 * Stages (TODO):
 *  1. Session Hydrator
 *  2. Context Resolver
 *  3. Rule Injector
 *  4. Skill Loader
 *  5. Prompt Assembler
 *  6. LLM Call           ← currently implemented
 *  7. Tool Dispatcher
 *  8. Response Processor
 *  9. Memory Extractor
 * 10. State Updater
 */

import OpenAI from 'openai';
import { parseResponse } from './response-parser';
import type { PipelineInput, PipelineOutput, ChatMessage, DisplayDirective } from './types';

// ─── In-Memory Session Store (Dev Only) ───────────────────────────────────────

const sessionStore = new Map<string, ChatMessage[]>();

// ─── System Prompt (Placeholder — will move to prompt-schema.json) ────────────

const SYSTEM_PROMPT = `You are the Leisure Life Vacations travel agent — a warm, knowledgeable cruise specialist powered by Cruise Brothers Travel Agency.

Your personality:
- Enthusiastic but not pushy
- Deeply knowledgeable about cruises, destinations, and travel logistics
- You remember everything the user tells you and use it to personalize recommendations
- You speak in concise, engaging "hero headline" style for short responses

Your current goal: Get to know the user's travel preferences through natural conversation.
Start by asking about their past travel experiences.`;

// ─── Pipeline Entry Point ─────────────────────────────────────────────────────

export async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
    const openai = new OpenAI();

    // Stage 1 (stub): Session Hydrator — load or create session history
    let history = sessionStore.get(input.sessionId);
    if (!history) {
        history = [
            {
                id: 'system-0',
                role: 'system',
                content: SYSTEM_PROMPT,
                timestamp: Date.now(),
            },
        ];
        sessionStore.set(input.sessionId, history);
    }

    // Add user message to history
    const userMessage: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: input.message,
        timestamp: Date.now(),
    };
    history.push(userMessage);

    // Stage 6: LLM Call
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: history.map((m) => ({
            role: m.role,
            content: m.content,
        })),
        max_tokens: 500,
        temperature: 0.8,
    });

    const rawReply = completion.choices[0]?.message?.content ?? '';
    const { cleanText, image, form } = parseResponse(rawReply);
    const reply = cleanText || 'I\'d love to help you plan the perfect cruise! Tell me — have you been on a cruise before?';

    // Add assistant reply to history
    const assistantMessage: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
    };
    history.push(assistantMessage);

    // Assemble display directives
    let display: DisplayDirective | undefined;
    if (image || form) {
        display = { heroTextMode: 'typewriter' };
        if (image) {
            display.media = [{
                type: image.count && image.count > 1 ? 'image_slideshow' : 'image',
                // We'll pass the query and count/index as custom fields or encoded in URL for the client to handle
                // Currently page.tsx does its own fetching based on just knowing there's an image.
                // We'll actually just attach the raw parsed data to the form for now, and handle image logic client side if needed.
            }];
        }
        if (form) {
            display.form = form;
        }
    }

    return {
        reply,
        sessionId: input.sessionId,
        display,
    };
}
