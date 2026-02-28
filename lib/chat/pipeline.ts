/**
 * Chat Pipeline Orchestrator — Step 3 explicit 10-stage skeleton.
 */

import { assembleSystemPrompt } from './prompt-assembler';
import { resolveContext } from './context-resolver';
import { hydrateSession, appendSessionMessage, getConversationTextForSession } from './session-hydrator';
import { injectRules } from './rule-injector';
import { loadSkills } from './skill-loader';
import { callChatLlm, MODEL_VOICE } from './llm-call';
import { dispatchTools } from './tool-dispatcher';
import { processResponse } from './response-processor';
import { extractMemoryFacts } from './memory-extractor';
import { updateState } from './state-updater';
import type { PipelineInput, PipelineOutput, ChatMessage, Channel } from './types';
import { pipelineLog } from './pipeline-logger';
import { classifyIntent } from './intent-classifier';

export async function getPromptPreviewForSession(input: {
    sessionId: string;
    channel: Channel;
}): Promise<{
    sessionId: string;
    activeContextPath: string;
    systemPrompt: string;
}> {
    const conversationText = getConversationTextForSession({ sessionId: input.sessionId });
    const signal = await classifyIntent(conversationText);
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
    const signal = await classifyIntent(fullConversationText);

    pipelineLog.stage('session-hydrator', input.sessionId, { userId: input.userId, channel: input.channel });

    // Stage 2 — Context Resolver
    const resolvedContext = await resolveContext({
        hasCruised: signal.hasCruised,
        requestedSpecificCruise: signal.requestedSpecificCruise,
        incompleteProfile: existingConversationText.trim().length === 0,
        discussesPastCruise: signal.discussesPastCruise,
        onActiveBooking: signal.onActiveBooking,
        completedCruise: signal.completedCruise,
        startingContext: input.startingContext,
    });

    pipelineLog.stage('context-resolver', input.sessionId, { activeContextPath: resolvedContext.activeContextPath, availableTools: resolvedContext.availableTools });

    // Stage 3 — Rule Injector
    const activeRules = await injectRules({
        activeContextPath: resolvedContext.activeContextPath,
        sessionId: input.sessionId,
    });

    pipelineLog.stage('rule-injector', input.sessionId, { activeRulesCount: activeRules.length });

    // Stage 4 — Skill Loader
    const loadedSkills = await loadSkills({
        activeContextPath: resolvedContext.activeContextPath,
        instructionRefs: resolvedContext.instructionRefs,
    });

    pipelineLog.stage('skill-loader', input.sessionId, { loadedSkillsCount: loadedSkills.length });

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
        startingContext: input.startingContext,
    });

    pipelineLog.stage('prompt-assembler', input.sessionId, { systemPromptLength: systemPrompt.length });

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
    pipelineLog.llm(input.sessionId, 'call_start', { historyTurns: history.length, model: input.model ?? 'gpt-4o-mini' });
    const rawLlmText = await callChatLlm({
        history,
        model: input.model,
    });

    pipelineLog.llm(input.sessionId, 'call_complete', { responseLength: rawLlmText.length, rawPreview: rawLlmText.slice(0, 120) });

    // Stage 7 — Tool Dispatcher
    const toolDispatchResult = await dispatchTools({
        llmResponseText: rawLlmText,
        activeContextPath: resolvedContext.activeContextPath,
        allowedToolIds: resolvedContext.availableTools,
    });

    pipelineLog.stage('tool-dispatcher', input.sessionId, { toolCallsLog: toolDispatchResult.toolCallsLog });

    // Stage 7.5 — Result Summarizer
    // VTG results: always rewrite instruction block as spoken prose (all channels).
    // Other tools on voice_hybrid: rewrite raw data as spoken prose.
    let finalLlmText = toolDispatchResult.finalLlmText;
    const vtgFired = toolDispatchResult.toolCallsLog.some(t => t.toolId === 'vtg_price_lookup');
    const toolsFired = toolDispatchResult.toolCallsLog.length > 0;

    if (vtgFired) {
        try {
            const vtgSummaryPrompt = [
                'You are a cruise shopping assistant. The following contains a VTG_RESULT instruction block with cruise deal data.',
                'Your job: read FIRST_DEAL and present it in exactly 2 natural spoken sentences.',
                'Include: ship name, number of nights, departure port, sailing date, and price per person.',
                'Use ONLY the exact field values from FIRST_DEAL — do not invent, infer, or embellish anything.',
                'The price shown is already adjusted — present it using approximate language like "starting around" or "approximately".',
                'End with exactly this question: "Want to hear another option, or does this sound like what you\'re looking for?"',
                'Rules: no JSON, no code blocks, no bullet points, no markdown — plain prose only.',
                '',
                finalLlmText,
            ].join('\n');
            const vtgReply = await callChatLlm({
                history: [{ id: `vtg-sum-${input.sessionId}`, role: 'user', content: vtgSummaryPrompt, timestamp: Date.now() }],
                model: MODEL_VOICE,
            });
            pipelineLog.stage('vtg-summarizer', input.sessionId, { responseLength: vtgReply.length, rawPreview: vtgReply.slice(0, 120) });
            finalLlmText = vtgReply;
        } catch (err) {
            pipelineLog.warn('vtg-summarizer', input.sessionId, 'summarizer failed, using raw dispatcher output', { err });
        }
    } else if (input.channel === 'voice_hybrid' && toolsFired) {
        const voiceSummaryPrompt = [
            'You are a voice assistant. Rewrite the following agent response as 3-5 natural spoken sentences.',
            'Rules: no markdown, no bullet points, no JSON, no code blocks, no headers.',
            'Surface 2-3 of the most interesting and specific insights — not generic summaries.',
            'If the data contains named cruise lines, specific trends, or concrete details, include them by name.',
            'End with exactly one conversational question relevant to what was just shared.',
            '',
            finalLlmText,
        ].join('\n');
        const voiceReply = await callChatLlm({
            history: [{ id: 'vs-1', role: 'user', content: voiceSummaryPrompt, timestamp: Date.now() }],
            model: MODEL_VOICE,
        });
        pipelineLog.stage('voice-summarizer', input.sessionId, { responseLength: voiceReply.length, rawPreview: voiceReply.slice(0, 120) });
        finalLlmText = voiceReply;
    }

    // Stage 8 — Response Processor
    const processedResponse = processResponse({
        llmText: finalLlmText,
    });

    const assistantMessage: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: processedResponse.reply,
        timestamp: Date.now(),
        display: processedResponse.display,
    };

    pipelineLog.stage('response-processor', input.sessionId, { replyLength: processedResponse.reply.length, hasDisplay: !!processedResponse.display });

    // Stage 9 — Memory Extractor
    const extractedFacts = await extractMemoryFacts({
        sessionId: input.sessionId,
        activeContextPath: resolvedContext.activeContextPath,
        userMessage: input.message,
        assistantReply: processedResponse.reply,
    });

    pipelineLog.memory(input.sessionId, 'extracted', { fieldCount: Object.keys(extractedFacts).filter(k => k !== 'metadata').length, facts: extractedFacts });

    // Stage 10 — State Updater
    await updateState({
        userId: input.userId,
        sessionId: input.sessionId,
        activeContextPath: resolvedContext.activeContextPath,
        assistantMessage,
        userMessage,
        extractedFacts,
        toolCallsLog: toolDispatchResult.toolCallsLog as Array<Record<string, unknown>>,
    });

    pipelineLog.stage('state-updater', input.sessionId, { activeContextPath: resolvedContext.activeContextPath });

    return {
        reply: processedResponse.reply,
        sessionId: input.sessionId,
        display: processedResponse.display,
        toolCallsLog: toolDispatchResult.toolCallsLog,
    };
}
