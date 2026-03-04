/**
 * Simulator Persona Engine — Orchestrator
 *
 * Runs AI-vs-AI conversation simulations against the live chat pipeline.
 * Reads a scenario JSON, spins up a Simulator LLM playing the user persona,
 * and drives turns through POST /api/chat until max_turns or goal achieved.
 *
 * Usage:
 *   npx ts-node tests/simulator.ts tests/scenarios/first-time-family-booking.json
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { callLLM, ModelName } from '../lib/ai/llm-gateway';
import { chatStorageService } from '../lib/chat/chat-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

type EndStateAssertion = {
    field: string;
    operator: 'set' | '==' | 'contains';
    value?: unknown;
};

type ConversationalGate = {
    must_happen_before_turn: number;
    condition: string;
};

type ScenarioAssertions = {
    end_state: EndStateAssertion[];
    conversational_gates: ConversationalGate[];
};

type TestScenario = {
    scenario_id: string;
    description: string;
    simulator_prompt: string;
    max_turns: number;
    assertions: ScenarioAssertions;
};

type TurnRecord = {
    turn: number;
    role: 'user' | 'agent';
    content: string;
};

type GateResult = {
    condition: string;
    required_before_turn: number;
    passed: boolean;
    evaluated_at_turn: number | null;
};

type SimulationResult = {
    scenario_id: string;
    passed: boolean;
    turns_completed: number;
    transcript: TurnRecord[];
    gate_results: GateResult[];
    end_state_results: Array<{ field: string; passed: boolean; actual: unknown }>;
    total_cost_estimate_usd: number;
};

// ─── Config ───────────────────────────────────────────────────────────────────

const CHAT_API_URL  = process.env.CHAT_API_URL ?? 'http://localhost:3000/api/chat';
/** Simulator persona model — routed through the LLM gateway */
const SIMULATOR_MODEL = ModelName.CLAUDE_4_SONNET;
const TOKENS_PER_TURN_ESTIMATE = 800;
const COST_PER_1K_TOKENS_USD = 0.00015;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadScenario(scenarioFilePath: string): TestScenario {
    const absolutePath = path.resolve(scenarioFilePath);
    const raw = readFileSync(absolutePath, 'utf-8');
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
}): Promise<string> {
    const response = await fetch(CHAT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: input.message,
            sessionId: input.sessionId,
            userId: input.userId,
            channel: 'text',
        }),
    });

    const data = await response.json() as { reply?: string; error?: string };
    if (!response.ok || !data.reply) {
        throw new Error(`Chat API error: ${data.error ?? 'No reply returned'}`);
    }

    return data.reply;
}

async function getSimulatorResponse(input: {
    systemPrompt: string;
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    agentReply: string;
}): Promise<string> {
    // Serialize multi-turn history into a single prompt for the gateway
    const historyText = input.conversationHistory
        .map((m) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content}`)
        .join('\n');
    const prompt = historyText
        ? `${historyText}\nUSER: ${input.agentReply}`
        : `USER: ${input.agentReply}`;

    const { content } = await callLLM(SIMULATOR_MODEL, prompt, {
        systemPrompt: input.systemPrompt,
        maxTokens:    200,
        temperature:  0.9,
    });
    return content.trim() || 'GOAL_ACHIEVED';
}

async function evaluateConversationalGate(input: {
    condition: string;
    transcript: TurnRecord[];
}): Promise<boolean> {
    const transcriptText = input.transcript
        .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
        .join('\n');

    const { content } = await callLLM(SIMULATOR_MODEL, `Given this conversation transcript:\n\n${transcriptText}\n\nDid the following occur? "${input.condition}"\n\nAnswer only: true or false`, {
        systemPrompt: 'You are a conversation evaluator. Answer only with "true" or "false".',
        maxTokens:    10,
        temperature:  0,
    });
    return content.trim().toLowerCase() === 'true';
}

function resolveFieldValue(
    snapshot: Record<string, unknown>,
    fieldPath: string
): unknown {
    const parts = fieldPath.split('.');
    let current: unknown = snapshot;

    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        if (typeof current !== 'object') return undefined;
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

// ─── Main Simulation Loop ─────────────────────────────────────────────────────

async function runSimulation(scenarioFilePath: string): Promise<void> {
    const scenario = loadScenario(scenarioFilePath);

    const sessionId = `sim-${scenario.scenario_id}-${Date.now()}`;
    const userId    = `sim-user-${scenario.scenario_id}`;
    const simulatorSystemPrompt = buildSimulatorSystemPrompt(scenario);

    const transcript: TurnRecord[] = [];
    const simulatorHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    const gateResults: GateResult[] = scenario.assertions.conversational_gates.map((gate) => ({
        condition: gate.condition,
        required_before_turn: gate.must_happen_before_turn,
        passed: false,
        evaluated_at_turn: null,
    }));

    console.log(`\n▶ Scenario: ${scenario.scenario_id}`);
    console.log(`  ${scenario.description}`);
    console.log(`  Max turns: ${scenario.max_turns}`);
    console.log(`  API: ${CHAT_API_URL}\n`);

    let turnCount = 0;
    let currentUserMessage = 'Hi there!';
    let goalAchieved = false;

    while (turnCount < scenario.max_turns && !goalAchieved) {
        turnCount++;

        transcript.push({ turn: turnCount, role: 'user', content: currentUserMessage });
        process.stdout.write(`  [Turn ${turnCount}] User: ${currentUserMessage.slice(0, 80)}…\n`);

        const agentReply = await callChatApi({
            message: currentUserMessage,
            sessionId,
            userId,
        });

        transcript.push({ turn: turnCount, role: 'agent', content: agentReply });
        process.stdout.write(`  [Turn ${turnCount}] Agent: ${agentReply.slice(0, 80)}…\n\n`);

        simulatorHistory.push({ role: 'assistant', content: currentUserMessage });
        simulatorHistory.push({ role: 'user', content: agentReply });

        for (const gateResult of gateResults) {
            if (!gateResult.passed && turnCount <= gateResult.required_before_turn) {
                const gatePassed = await evaluateConversationalGate({
                    condition: gateResult.condition,
                    transcript,
                });
                if (gatePassed) {
                    gateResult.passed = true;
                    gateResult.evaluated_at_turn = turnCount;
                    console.log(`  ✓ Gate passed at turn ${turnCount}: "${gateResult.condition}"`);
                }
            }
        }

        const nextUserMessage = await getSimulatorResponse({
            systemPrompt: simulatorSystemPrompt,
            conversationHistory: simulatorHistory,
            agentReply,
        });

        if (nextUserMessage === 'GOAL_ACHIEVED') {
            goalAchieved = true;
            console.log(`\n  ✓ Simulator reported goal achieved at turn ${turnCount}`);
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
        activeContextPath: snapshot.sessions[0]
            ? (snapshot.sessions[0] as Record<string, unknown>).activeContextPath
            : undefined,
    };

    const endStateResults = scenario.assertions.end_state.map((assertion) => {
        const { passed, actual } = evaluateEndStateAssertion(assertion, guestInfoSnapshot);
        return { field: assertion.field, passed, actual };
    });

    for (const gateResult of gateResults) {
        if (!gateResult.passed) {
            console.log(`  ✗ Gate FAILED: "${gateResult.condition}" (required before turn ${gateResult.required_before_turn})`);
        }
    }

    console.log('\n── End State Assertions ──────────────────────────────────');
    for (const result of endStateResults) {
        const icon = result.passed ? '✓' : '✗';
        console.log(`  ${icon} ${result.field}: ${JSON.stringify(result.actual)}`);
    }

    const allGatesPassed = gateResults.every((g) => g.passed);
    const allEndStatePassed = endStateResults.every((r) => r.passed);
    const overallPassed = allGatesPassed && allEndStatePassed;

    const estimatedTokens = turnCount * TOKENS_PER_TURN_ESTIMATE;
    const estimatedCost = (estimatedTokens / 1000) * COST_PER_1K_TOKENS_USD;

    const result: SimulationResult = {
        scenario_id: scenario.scenario_id,
        passed: overallPassed,
        turns_completed: turnCount,
        transcript,
        gate_results: gateResults,
        end_state_results: endStateResults,
        total_cost_estimate_usd: estimatedCost,
    };

    console.log('\n══════════════════════════════════════════════════════════');
    console.log(`  Scenario: ${result.scenario_id}`);
    console.log(`  Result:   ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`  Turns:    ${result.turns_completed} / ${scenario.max_turns}`);
    console.log(`  Est. Cost: $${result.total_cost_estimate_usd.toFixed(4)}`);
    console.log('══════════════════════════════════════════════════════════\n');

    process.exitCode = result.passed ? 0 : 1;
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

const scenarioArg = process.argv[2];
if (!scenarioArg) {
    console.error('Usage: npx ts-node tests/simulator.ts <path-to-scenario.json>');
    process.exit(1);
}

runSimulation(scenarioArg).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown simulator error';
    console.error(`[Simulator] Fatal error: ${message}`);
    process.exit(1);
});
