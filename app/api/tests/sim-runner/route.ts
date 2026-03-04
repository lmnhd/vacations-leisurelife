import { NextRequest } from 'next/server';
import { runSimulationStreamed, listScenarios } from '@/tests/simulator-core';
import type { SimStreamEvent } from '@/tests/simulator-core';
import { ModelName } from '@/lib/ai/llm-gateway';

export const maxDuration = 300;

export async function GET(): Promise<Response> {
    const scenarios = await listScenarios();
    return Response.json({ scenarios });
}

export async function POST(request: NextRequest): Promise<Response> {
    const body = await request.json() as {
        scenarioId?: string;
        agentModel?: string;
        simulatorModel?: ModelName;
    };

    const scenarioId      = body.scenarioId;
    const agentModel      = body.agentModel ?? 'default';   // resolved by chat pipeline
    const simulatorModel  = body.simulatorModel ?? ModelName.CLAUDE_4_SONNET;

    if (!scenarioId) {
        return Response.json({ error: 'scenarioId is required' }, { status: 400 });
    }

    const apiUrl = `${request.nextUrl.origin}/api/chat`;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            function send(event: SimStreamEvent): void {
                const data = `data: ${JSON.stringify(event)}\n\n`;
                controller.enqueue(encoder.encode(data));
            }

            try {
                await runSimulationStreamed({
                    scenarioId,
                    agentModel,
                    simulatorModel,
                    apiUrl,
                    onEvent: send,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                send({ type: 'error', message });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
