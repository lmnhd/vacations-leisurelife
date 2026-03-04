/**
 * Simulator Core — reusable simulation engine.
 * Extracted from simulator.ts so it can be used by both the CLI and the UI API route.
 */

import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { callLLM, ModelName } from '../lib/ai/llm-gateway';
import { chatStorageService } from '../lib/chat/chat-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Stream event types (for SSE) ─────────────────────────────────────────────

export type SimStreamEvent =
    | { type: 'turn_user';   turn: number; content: string }
    | { type: 'turn_agent';  turn: number; content: string; tool_calls: ToolCallEntry[] }
    | { type: 'gate_passed'; turn: number; condition: string }
    | { type: 'gate_failed'; condition: string; required_before: number }
    | { type: 'goal_achieved'; turn: number }
    | { type: 'end_state';   results: EndStateResult[] }
    | { type: 'done';        result: SimulationResult }
    | { type: 'error';       message: string };

// ─── Config ───────────────────────────────────────────────────────────────────

const TOKENS_PER_TURN_ESTIMATE = 800;

const COMPLETION_TOKENS_MODELS = ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5.2', 'gpt-5.2-pro', 'o1', 'o1-mini', 'o3', 'o3-mini'];

function tokenParam(model: string, count: number): Record<string, number> {
    return COMPLETION_TOKENS_MODELS.some((m) => model.startsWith(m))
        ? { max_completion_tokens: count }
        : { max_tokens: count };
}

function tempParam(model: string, value: number): Record<string, number> {
    return COMPLETION_TOKENS_MODELS.some((m) => model.startsWith(m))
        ? {}
        : { temperature: value };
}
const COST_PER_1K_TOKENS_USD = 0.00015;
const SCENARIOS_DIR = path.join(process.cwd(), 'tests', 'scenarios');

// ─── Helpers ──────────────────────────────────────────────────────────────────

export async function listScenarios(): Promise<string[]> {
    const entries = await readdir(SCENARIOS_DIR);
    return entries
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''));
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
    // Serialize multi-turn history into a single prompt for the gateway
    const historyText = input.conversationHistory
        .map((m) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content}`)
        .join('\n');
    const fullPrompt = historyText
        ? `${historyText}\nUSER: ${input.agentReply}`
        : `USER: ${input.agentReply}`;

    const { content } = await callLLM(input.model, fullPrompt, {
        systemPrompt: input.systemPrompt,
        maxTokens:    200,
        temperature:  0.9,
    });
    return content.trim() || 'GOAL_ACHIEVED';
}

async function evaluateConversationalGate(input: {
    model: ModelName;
    condition: string;
    transcript: TurnRecord[];
}): Promise<boolean> {
    const transcriptText = input.transcript
        .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
        .join('\n');

    const { content } = await callLLM(input.model, `Given this conversation transcript:\n\n${transcriptText}\n\nDid the following occur? "${input.condition}"\n\nAnswer only: true or false`, {
        systemPrompt: 'You are a conversation evaluator. Answer only with "true" or "false".',
        maxTokens:    10,
        temperature:  0,
    });
    return (content.trim().toLowerCase() ?? 'false') === 'true';
}

function resolveFieldValue(snapshot: Record<string, unknown>, fieldPath: string): unknown {
    const parts = fieldPath.split('.');
    let current: unknown = snapshot;
    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

function evaluateEndStateAssertion(
    assertion: EndStateAssertion,
    snapshot: Record<string, unknown>
): { passed: boolean; actual: unknown } {
    const actual = resolveFieldValue(snapshot, assertion.field);
    if (assertion.operator === 'set') return { passed: actual !== undefined && actual !== null && actual !== '', actual };
    if (assertion.operator === '==') return { passed: actual === assertion.value, actual };
    if (assertion.operator === 'contains') {
        if (Array.isArray(actual)) return { passed: actual.includes(assertion.value), actual };
        if (typeof actual === 'string' && typeof assertion.value === 'string')
            return { passed: actual.toLowerCase().includes(assertion.value.toLowerCase()), actual };
        return { passed: false, actual };
    }
    return { passed: false, actual };
}

// ─── Core Runner ──────────────────────────────────────────────────────────────

export async function runSimulationStreamed(input: {
    scenarioId: string;
    agentModel: string;
    /** Gateway model to use for the simulator persona LLM. Defaults to CLAUDE_4_SONNET. */
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
        turnCount++;

        transcript.push({ turn: turnCount, role: 'user', content: currentUserMessage });
        input.onEvent({ type: 'turn_user', turn: turnCount, content: currentUserMessage });

        const { reply: agentReply, toolCallsLog } = await callChatApi({
            message: currentUserMessage,
            sessionId,
            userId,
            apiUrl: input.apiUrl,
            agentModel: input.agentModel,
        });

        const turnToolCalls: ToolCallEntry[] = toolCallsLog.map((tc) => ({ ...tc, turn: turnCount }));
        allToolCalls.push(...turnToolCalls);

        transcript.push({ turn: turnCount, role: 'agent', content: agentReply });
        input.onEvent({ type: 'turn_agent', turn: turnCount, content: agentReply, tool_calls: turnToolCalls });

        simulatorHistory.push({ role: 'assistant', content: currentUserMessage });
        simulatorHistory.push({ role: 'user', content: agentReply });

        for (const gateResult of gateResults) {
            if (!gateResult.passed && turnCount <= gateResult.required_before_turn) {
                const gatePassed = await evaluateConversationalGate({
                    model: simulatorModel,
                    condition: gateResult.condition,
                    transcript,
                });
                if (gatePassed) {
                    gateResult.passed = true;
                    gateResult.evaluated_at_turn = turnCount;
                    input.onEvent({ type: 'gate_passed', turn: turnCount, condition: gateResult.condition });
                }
            }
        }

        const nextUserMessage = await getSimulatorResponse({
            model: simulatorModel,
            systemPrompt: simulatorSystemPrompt,
            conversationHistory: simulatorHistory,
            agentReply,
        });

        if (nextUserMessage === 'GOAL_ACHIEVED') {
            goalAchieved = true;
            input.onEvent({ type: 'goal_achieved', turn: turnCount });
            break;
        }

        if (!nextUserMessage.trim()) {
            input.onEvent({ type: 'error', message: `Simulator returned an empty response at turn ${turnCount} — aborting run.` });
            break;
        }

        currentUserMessage = nextUserMessage;
    }

    const snapshot = await chatStorageService.getFullSnapshot({
        userId,
        conversationLimit: scenario.max_turns * 2,
    });

    const guestInfoSnapshot: Record<string, unknown> = {
        guestInfo: snapshot.profile && typeof snapshot.profile.guestInfo === 'object'
            ? (snapshot.profile.guestInfo as Record<string, unknown>)
            : {},
    };

    const endStateResults = scenario.assertions.end_state.map((assertion) => {
        const { passed, actual } = evaluateEndStateAssertion(assertion, guestInfoSnapshot);
        return { field: assertion.field, passed, actual };
    });

    for (const gateResult of gateResults) {
        if (!gateResult.passed) {
            input.onEvent({ type: 'gate_failed', condition: gateResult.condition, required_before: gateResult.required_before_turn });
        }
    }

    input.onEvent({ type: 'end_state', results: endStateResults });

    const estimatedCost = ((turnCount * TOKENS_PER_TURN_ESTIMATE) / 1000) * COST_PER_1K_TOKENS_USD;
    const allGatesPassed = gateResults.every((g) => g.passed);
    const allEndStatePassed = endStateResults.every((r) => r.passed);

    const result: SimulationResult = {
        scenario_id: scenario.scenario_id,
        passed: allGatesPassed && allEndStatePassed,
        turns_completed: turnCount,
        transcript,
        gate_results: gateResults,
        end_state_results: endStateResults,
        tool_calls: allToolCalls,
        total_cost_estimate_usd: estimatedCost,
    };

    input.onEvent({ type: 'done', result });
    return result;
}
