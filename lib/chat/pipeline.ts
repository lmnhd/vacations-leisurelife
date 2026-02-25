/**
 * Chat Pipeline Orchestrator — Step 3 explicit 10-stage skeleton.
 */

import { assembleSystemPrompt } from './prompt-assembler';
import { resolveContext } from './context-resolver';
import { hydrateSession, appendSessionMessage, getConversationTextForSession } from './session-hydrator';
import { injectRules } from './rule-injector';
import { loadSkills } from './skill-loader';
import { callChatLlm } from './llm-call';
import { dispatchTools } from './tool-dispatcher';
import { processResponse } from './response-processor';
import { extractMemoryFacts } from './memory-extractor';
import { updateState } from './state-updater';
import type { PipelineInput, PipelineOutput, ChatMessage, Channel } from './types';

function deriveSessionSignal(conversationText: string): {
    hasCruised: boolean | null;
    requestedSpecificCruise: boolean;
    incompleteProfile: boolean;
    discussesPastCruise: boolean;
    onActiveBooking: boolean;
    completedCruise: boolean;
} {
    const normalizedConversationText = conversationText.toLowerCase();

    const hasCruisedFromConversation =
        normalizedConversationText.includes('i have cruised') ||
        normalizedConversationText.includes('we have cruised') ||
        normalizedConversationText.includes('been on a cruise');

    const hasNotCruisedFromConversation =
        normalizedConversationText.includes("i haven't cruised") ||
        normalizedConversationText.includes('i have not cruised') ||
        normalizedConversationText.includes('never been on a cruise');

    return {
        hasCruised: hasCruisedFromConversation
            ? true
            : hasNotCruisedFromConversation
                ? false
                : null,
        requestedSpecificCruise:
            normalizedConversationText.includes('book') ||
            normalizedConversationText.includes('specific cruise') ||
            normalizedConversationText.includes('sailing on'),
        incompleteProfile: normalizedConversationText.trim().length === 0,
        discussesPastCruise:
            normalizedConversationText.includes('last cruise') ||
            normalizedConversationText.includes('previous cruise') ||
            normalizedConversationText.includes('past cruise'),
        onActiveBooking:
            normalizedConversationText.includes('my booking') ||
            normalizedConversationText.includes('already booked') ||
            normalizedConversationText.includes('upcoming cruise'),
        completedCruise:
            normalizedConversationText.includes('just got back') ||
            normalizedConversationText.includes('after my cruise') ||
            normalizedConversationText.includes('returned from'),
    };
}

export async function getPromptPreviewForSession(input: {
    sessionId: string;
    channel: Channel;
}): Promise<{
    sessionId: string;
    activeContextPath: string;
    systemPrompt: string;
}> {
    const conversationText = getConversationTextForSession({ sessionId: input.sessionId });
    const signal = deriveSessionSignal(conversationText);
    const resolvedContext = await resolveContext({
        hasCruised: signal.hasCruised,
        requestedSpecificCruise: signal.requestedSpecificCruise,
        incompleteProfile: conversationText.trim().length === 0,
        discussesPastCruise: signal.discussesPastCruise,
        onActiveBooking: signal.onActiveBooking,
        completedCruise: signal.completedCruise,
    });

    const activeRules = await injectRules({
        activeContextPath: resolvedContext.activeContextPath,
        sessionId: input.sessionId,
    });

    const loadedSkills = await loadSkills({
        activeContextPath: resolvedContext.activeContextPath,
        instructionRefs: resolvedContext.instructionRefs,
    });

    const assembledPrompt = await assembleSystemPrompt({
        channel: input.channel,
        hasCruised: signal.hasCruised,
        requestedSpecificCruise: signal.requestedSpecificCruise,
        incompleteProfile: signal.incompleteProfile,
        discussesPastCruise: signal.discussesPastCruise,
        preResolvedContext: resolvedContext,
        activeRules,
        loadedSkills,
    });

    return {
        sessionId: input.sessionId,
        activeContextPath: assembledPrompt.activeContextPath,
        systemPrompt: assembledPrompt.systemPrompt,
    };
}

// ─── Pipeline Entry Point ─────────────────────────────────────────────────────

export async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
    const existingConversationText = getConversationTextForSession({
        sessionId: input.sessionId,
    });

    const fullConversationText = getConversationTextForSession({
        sessionId: input.sessionId,
        pendingMessage: input.message,
    });
    const signal = deriveSessionSignal(fullConversationText);

    // Stage 2 — Context Resolver
    const resolvedContext = await resolveContext({
        hasCruised: signal.hasCruised,
        requestedSpecificCruise: signal.requestedSpecificCruise,
        incompleteProfile: existingConversationText.trim().length === 0,
        discussesPastCruise: signal.discussesPastCruise,
        onActiveBooking: signal.onActiveBooking,
        completedCruise: signal.completedCruise,
    });

    // Stage 3 — Rule Injector
    const activeRules = await injectRules({
        activeContextPath: resolvedContext.activeContextPath,
        sessionId: input.sessionId,
    });

    // Stage 4 — Skill Loader
    const loadedSkills = await loadSkills({
        activeContextPath: resolvedContext.activeContextPath,
        instructionRefs: resolvedContext.instructionRefs,
    });

    // Stage 5 — Prompt Assembler
    const { systemPrompt } = await assembleSystemPrompt({
        channel: input.channel,
        hasCruised: signal.hasCruised,
        requestedSpecificCruise: signal.requestedSpecificCruise,
        incompleteProfile: existingConversationText.trim().length === 0,
        discussesPastCruise: signal.discussesPastCruise,
        preResolvedContext: resolvedContext,
        activeRules,
        loadedSkills,
    });

    // Stage 1 — Session Hydrator
    const history = hydrateSession({
        sessionId: input.sessionId,
        systemPrompt,
    });

    // Stage 1 continuation — append user turn
    const userMessage: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: input.message,
        timestamp: Date.now(),
    };
    appendSessionMessage({
        sessionId: input.sessionId,
        message: userMessage,
    });

    // Stage 6 — LLM Call
    const rawLlmText = await callChatLlm({
        history,
    });

    // Stage 7 — Tool Dispatcher
    const toolDispatchResult = await dispatchTools({
        llmResponseText: rawLlmText,
        activeContextPath: resolvedContext.activeContextPath,
        allowedToolIds: resolvedContext.availableTools,
    });

    // Stage 8 — Response Processor
    const processedResponse = processResponse({
        llmText: toolDispatchResult.finalLlmText,
    });

    const assistantMessage: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: processedResponse.reply,
        timestamp: Date.now(),
        display: processedResponse.display,
    };

    // Stage 9 — Memory Extractor
    const extractedFacts = await extractMemoryFacts({
        sessionId: input.sessionId,
        activeContextPath: resolvedContext.activeContextPath,
        userMessage: input.message,
        assistantReply: processedResponse.reply,
    });

    // Stage 10 — State Updater
    await updateState({
        sessionId: input.sessionId,
        assistantMessage,
        extractedFacts,
    });

    return {
        reply: processedResponse.reply,
        sessionId: input.sessionId,
        display: processedResponse.display,
    };
}
