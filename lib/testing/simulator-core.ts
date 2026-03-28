/**
 * Simulator Core — reusable simulation engine.
 * Extracted from simulator.ts so it can be used by both the CLI and the UI API route.
 */

import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { callLLM, ModelName } from '../ai/llm-gateway';
import { chatStorageService } from '../chat/chat-storage';

export type EndStateAssertion = {
    field: string;
    operator: 'set' | '==' | 'contains';
    value?: unknown;
};

export type ConversationalGate = {
    must_happen_before_turn: number;
    condition: string;
};

export type ScenarioAssertions = {
    end_state: EndStateAssertion[];
    conversational_gates: ConversationalGate[];
};

export type TestScenario = {
    scenario_id: string;
    description: string;
    simulator_prompt: string;
    max_turns: number;
    assertions: ScenarioAssertions;
};

export type TurnRecord = {
    turn: number;
    role: 'user' | 'agent';
    content: string;
};

export type GateResult = {
    condition: string;
    required_before_turn: number;
    passed: boolean;
    evaluated_at_turn: number | null;
};

export type EndStateResult = {
    field: string;
    passed: boolean;
    actual: unknown;
};

export type ToolCallEntry = {
    turn: number;
    toolId: string;
    status: string;
    payload: unknown;
};

export type SimulationResult = {
    scenario_id: string;
    passed: boolean;
    turns_completed: number;
    transcript: TurnRecord[];
    gate_results: GateResult[];
    end_state_results: EndStateResult[];
    tool_calls: ToolCallEntry[];
    total_cost_estimate_usd: number;
};

export type SimStreamEvent =
    | { type: 'turn_user'; turn: number; content: string }
    | { type: 'turn_agent'; turn: number; content: string; tool_calls: ToolCallEntry[] }
    | { type: 'gate_passed'; turn: number; condition: string }
    | { type: 'gate_failed'; condition: string; required_before: number }
    | { type: 'goal_achieved'; turn: number }
    | { type: 'end_state'; results: EndStateResult[] }
    | { type: 'done'; result: SimulationResult }
    | { type: 'error'; message: string };

const TOKENS_PER_TURN_ESTIMATE = 800;
const COST_PER_1K_TOKENS_USD = 0.00015;
const SCENARIOS_DIR = path.join(process.cwd(), 'tests', 'scenarios');

export async function listScenarios(): Promise<string[]> {
    const entries = await readdir(SCENARIOS_DIR);
    return entries
        .filter((fileName) => fileName.endsWith('.json'))
        .map((fileName) => fileName.replace('.json', ''));
}

export async function loadScenario(scenarioId: string): Promise<TestScenario> {
    const filePath = path.join(SCENARIOS_DIR, `${scenarioId}.json`);
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as TestScenario;
}

function buildSimulatorSystemPrompt(scenario: TestScenario): string {
    return [
        scenario.simulator_prompt,
        '',
        'Instructions for your role:',
        '- Respond naturally as this persona would in a real conversation.',
        '- Keep your responses concise (1-3 sentences) — you are a real user, not an AI.',
        '- When you believe your main goal has been achieved (e.g., you have selected a package), respond with exactly: GOAL_ACHIEVED',
        '- Never break character or mention that you are an AI or a test.',
    ].join('\n');
}

async function callChatApi(input: {
    message: string;
    sessionId: string;
    userId: string;
    apiUrl: string;
    agentModel: string;
}): Promise<{ reply: string; toolCallsLog: ToolCallEntry[] }> {
    const response = await fetch(input.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: input.message,
            sessionId: input.sessionId,
            userId: input.userId,
            channel: 'text',
            model: input.agentModel,
        }),
    });

    const data = await response.json() as { reply?: string; error?: string; toolCallsLog?: ToolCallEntry[] };
    if (!response.ok || !data.reply) {
        throw new Error(`Chat API error: ${data.error ?? 'No reply returned'}`);
    }

    return {
        reply: data.reply,
        toolCallsLog: data.toolCallsLog ?? [],
    };
}

async function getSimulatorResponse(input: {
    model: ModelName;
    systemPrompt: string;
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    agentReply: string;
}): Promise<string> {
    const historyText = input.conversationHistory
        .map((message) => `${message.role === 'user' ? 'USER' : 'ASSISTANT'}: ${message.content}`)
        .join('\n');
    const fullPrompt = historyText
        ? `${historyText}\nUSER: ${input.agentReply}`
        : `USER: ${input.agentReply}`;

    const { content } = await callLLM(input.model, fullPrompt, {
        systemPrompt: input.systemPrompt,
        maxTokens: 200,
        temperature: 0.9,
    });
    return content.trim() || 'GOAL_ACHIEVED';
}

async function evaluateConversationalGate(input: {
    model: ModelName;
    condition: string;
    transcript: TurnRecord[];
}): Promise<boolean> {
    const transcriptText = input.transcript
        .map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`)
        .join('\n');

    const { content } = await callLLM(input.model, `Given this conversation transcript:\n\n${transcriptText}\n\nDid the following occur? "${input.condition}"\n\nAnswer only: true or false`, {
        systemPrompt: 'You are a conversation evaluator. Answer only with "true" or "false".',
        maxTokens: 10,
        temperature: 0,
    });
    return (content.trim().toLowerCase() ?? 'false') === 'true';
}

function resolveFieldValue(snapshot: Record<string, unknown>, fieldPath: string): unknown {
    const parts = fieldPath.split('.');
    let current: unknown = snapshot;
    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

function evaluateEndStateAssertion(
    assertion: EndStateAssertion,
    snapshot: Record<string, unknown>
): { passed: boolean; actual: unknown } {
    const actual = resolveFieldValue(snapshot, assertion.field);
    if (assertion.operator === 'set') {
        return { passed: actual !== undefined && actual !== null && actual !== '', actual };
    }
    if (assertion.operator === '==') {
        return { passed: actual === assertion.value, actual };
    }
    if (assertion.operator === 'contains') {
        if (Array.isArray(actual)) {
            return { passed: actual.includes(assertion.value), actual };
        }
        if (typeof actual === 'string' && typeof assertion.value === 'string') {
            return { passed: actual.toLowerCase().includes(assertion.value.toLowerCase()), actual };
        }
        return { passed: false, actual };
    }
    return { passed: false, actual };
}

export async function runSimulationStreamed(input: {
    scenarioId: string;
    agentModel: string;
    simulatorModel?: ModelName;
    apiUrl: string;
    onEvent: (event: SimStreamEvent) => void;
}): Promise<SimulationResult> {
    const scenario = await loadScenario(input.scenarioId);
    const simulatorModel = input.simulatorModel ?? ModelName.CLAUDE_4_SONNET;

    const sessionId = `sim-${scenario.scenario_id}-${Date.now()}`;
    const userId = `sim-user-${scenario.scenario_id}-${Date.now()}`;
    const simulatorSystemPrompt = buildSimulatorSystemPrompt(scenario);

    const transcript: TurnRecord[] = [];
    const simulatorHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const allToolCalls: ToolCallEntry[] = [];

    const gateResults: GateResult[] = scenario.assertions.conversational_gates.map((gate) => ({
        condition: gate.condition,
        required_before_turn: gate.must_happen_before_turn,
        passed: false,
        evaluated_at_turn: null,
    }));

    let turnCount = 0;
    let currentUserMessage = 'Hi there!';
    let goalAchieved = false;

    while (turnCount < scenario.max_turns && !goalAchieved) {
        turnCount += 1;
        transcript.push({ turn: turnCount, role: 'user', content: currentUserMessage });
        simulatorHistory.push({ role: 'user', content: currentUserMessage });
        input.onEvent({ type: 'turn_user', turn: turnCount, content: currentUserMessage });

        const { reply: agentReply, toolCallsLog } = await callChatApi({
            message: currentUserMessage,
            sessionId,
            userId,
            apiUrl: input.apiUrl,
            agentModel: input.agentModel,
        });

        transcript.push({ turn: turnCount, role: 'agent', content: agentReply });
        simulatorHistory.push({ role: 'assistant', content: agentReply });
        allToolCalls.push(...toolCallsLog.map((toolCall) => ({ ...toolCall, turn: turnCount })));
        input.onEvent({ type: 'turn_agent', turn: turnCount, content: agentReply, tool_calls: toolCallsLog.map((toolCall) => ({ ...toolCall, turn: turnCount })) });

        for (const gate of gateResults) {
            if (gate.passed || turnCount > gate.required_before_turn) {
                continue;
            }

            const passed = await evaluateConversationalGate({
                model: simulatorModel,
                condition: gate.condition,
                transcript,
            });

            if (passed) {
                gate.passed = true;
                gate.evaluated_at_turn = turnCount;
                input.onEvent({ type: 'gate_passed', turn: turnCount, condition: gate.condition });
            }
        }

        currentUserMessage = await getSimulatorResponse({
            model: simulatorModel,
            systemPrompt: simulatorSystemPrompt,
            conversationHistory: simulatorHistory,
            agentReply,
        });

        if (currentUserMessage === 'GOAL_ACHIEVED') {
            goalAchieved = true;
            input.onEvent({ type: 'goal_achieved', turn: turnCount });
        }
    }

    const gateFailures = gateResults.filter((gate) => !gate.passed);
    for (const gate of gateFailures) {
        input.onEvent({
            type: 'gate_failed',
            condition: gate.condition,
            required_before: gate.required_before_turn,
        });
    }

    const snapshot = await chatStorageService.getFullSnapshot({
        userId,
        conversationLimit: scenario.max_turns * 2,
    });

    const guestInfoSnapshot: Record<string, unknown> = {
        guestInfo: snapshot.profile && typeof snapshot.profile.guestInfo === 'object'
            ? (snapshot.profile.guestInfo as Record<string, unknown>)
            : {},
        activeContextPath: snapshot.sessions[0]
            ? (snapshot.sessions[0] as Record<string, unknown>).activeContextPath
            : undefined,
    };

    const endStateResults = scenario.assertions.end_state.map((assertion) => {
        const { passed, actual } = evaluateEndStateAssertion(assertion, guestInfoSnapshot);
        return { field: assertion.field, passed, actual };
    });
    input.onEvent({ type: 'end_state', results: endStateResults });

    const passed = gateFailures.length === 0 && endStateResults.every((result) => result.passed);
    const result: SimulationResult = {
        scenario_id: scenario.scenario_id,
        passed,
        turns_completed: turnCount,
        transcript,
        gate_results: gateResults,
        end_state_results: endStateResults,
        tool_calls: allToolCalls,
        total_cost_estimate_usd: (turnCount * TOKENS_PER_TURN_ESTIMATE * COST_PER_1K_TOKENS_USD) / 1000,
    };

    input.onEvent({ type: 'done', result });
    return result;
}