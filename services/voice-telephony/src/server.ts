/**
 * Leisure Life telephony control service.
 *
 * Responsibilities:
 *   - health endpoint for Render;
 *   - signed OpenAI `realtime.call.incoming` webhook with idempotency;
 *   - accept/reject using a server-controlled configuration fetched from the
 *     Next.js app (the SAME agent configuration assembler the browser uses);
 *   - sideband WebSocket for tools, safety, transfer, and hangup;
 *   - graceful shutdown.
 *
 * It carries no audio and stores no call recordings.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import {
  WebhookDeduplicator,
  parseIncomingCall,
  verifyWebhookSignature,
} from "./webhook-verification.js";
import { admitCall, AI_DISCLOSURE_TEXT } from "./call-policy.js";
import { RealtimeSipClient } from "./realtime-sip-client.js";
import { CallSession } from "./call-session.js";

const PORT = Number(process.env.PORT ?? 10000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_WEBHOOK_SECRET = process.env.OPENAI_WEBHOOK_SECRET ?? "";
const APP_URL = process.env.LEISURE_LIFE_APP_URL ?? "";
const TRANSFER_NUMBER = process.env.HUMAN_TRANSFER_NUMBER;
const MAX_CALL_SECONDS = Number(process.env.MAX_CALL_SECONDS ?? 900);
const MAX_CONCURRENT_CALLS = Number(process.env.MAX_CONCURRENT_CALLS ?? 4);

const BUSINESS_HOURS = {
  startHour: Number(process.env.BUSINESS_HOURS_START ?? 9),
  endHour: Number(process.env.BUSINESS_HOURS_END ?? 20),
  timeZone: process.env.BUSINESS_TIMEZONE ?? "America/New_York",
};

const client = new RealtimeSipClient(OPENAI_API_KEY);
const deduplicator = new WebhookDeduplicator();
const activeSessions = new Map<string, CallSession>();

function journal(event: string, detail: Record<string, string | number | boolean>): void {
  // Sanitized structured logging: identifiers and outcomes only, never
  // transcripts, caller numbers, or personal content.
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...detail }));
}

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const url = request.url ?? "/";

  if (request.method === "GET" && (url === "/healthz" || url === "/")) {
    respondJson(response, 200, {
      status: "ok",
      service: "leisure-life-voice-telephony",
      activeCalls: activeSessions.size,
      configured: {
        openaiKey: OPENAI_API_KEY.length > 0,
        webhookSecret: OPENAI_WEBHOOK_SECRET.length > 0,
        appUrl: APP_URL.length > 0,
        transferConfigured: Boolean(TRANSFER_NUMBER),
      },
    });
    return;
  }

  if (request.method === "POST" && url === "/webhooks/openai") {
    await handleWebhook(request, response);
    return;
  }

  respondJson(response, 404, { error: "not_found" });
}

async function handleWebhook(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const rawBody = await readBody(request);

  const verification = verifyWebhookSignature(
    rawBody,
    {
      webhookId: headerValue(request, "webhook-id"),
      webhookTimestamp: headerValue(request, "webhook-timestamp"),
      webhookSignature: headerValue(request, "webhook-signature"),
    },
    OPENAI_WEBHOOK_SECRET
  );

  if (!verification.valid) {
    journal("webhook.rejected", { reason: verification.reason });
    respondJson(response, 401, { error: "invalid_signature" });
    return;
  }

  if (!deduplicator.claim(verification.webhookId)) {
    journal("webhook.duplicate_ignored", { webhookId: verification.webhookId });
    respondJson(response, 200, { status: "duplicate_ignored" });
    return;
  }

  const event = parseIncomingCall(rawBody);
  if (!event) {
    respondJson(response, 200, { status: "ignored_non_call_event" });
    return;
  }

  // Acknowledge fast; call setup continues asynchronously so a slow
  // dependency never causes a webhook retry storm.
  respondJson(response, 200, { status: "accepted_for_processing" });
  void setUpCall(event.callId, event.fromUri);
}

async function setUpCall(callId: string, fromUri: string | null): Promise<void> {
  const admission = admitCall({
    callId,
    fromUri,
    activeCalls: activeSessions.size,
    maxConcurrentCalls: MAX_CONCURRENT_CALLS,
    // Correlation is resolved after the caller presents a code in
    // conversation; caller ID alone never binds a draft.
    correlation: null,
    nowMs: Date.now(),
  });

  if (admission.decision === "reject") {
    journal("call.rejected", { callId, reason: admission.reason });
    await client.rejectCall(callId, admission.statusCode);
    return;
  }

  journal("call.admitted", { callId, mode: admission.mode, reason: admission.reason });

  const configuration = await fetchAgentConfiguration(callId);
  if (!configuration) {
    journal("call.configuration_unavailable", { callId });
    // Without a server-resolved configuration there is no safe agent to run.
    await client.rejectCall(callId, 503);
    return;
  }

  const accepted = await client.acceptCall(callId, {
    model: configuration.model,
    instructions: `${configuration.instructions}\n\n# Call opening\nOpen the call by saying: ${AI_DISCLOSURE_TEXT}`,
    voice: configuration.voice,
    tools: configuration.tools,
  });

  if (!accepted.ok) {
    journal("call.accept_failed", { callId, reason: accepted.reason });
    return;
  }

  journal("call.accepted", { callId, conversationId: configuration.conversationId });

  const session = new CallSession({
    callId,
    conversationId: configuration.conversationId,
    client,
    appUrl: APP_URL,
    transferNumber: TRANSFER_NUMBER,
    businessHours: BUSINESS_HOURS,
    maxCallSeconds: MAX_CALL_SECONDS,
    onJournal: journal,
    onClosed: (endedCallId) => {
      activeSessions.delete(endedCallId);
    },
  });

  activeSessions.set(callId, session);
  session.start();
}

interface TelephonyAgentConfiguration {
  conversationId: string;
  model: string;
  voice: string;
  instructions: string;
  tools: unknown[];
}

/**
 * Fetches the SAME server-built agent configuration the browser path uses.
 * This service never assembles its own prompt or tool list.
 */
async function fetchAgentConfiguration(
  callId: string
): Promise<TelephonyAgentConfiguration | null> {
  if (!APP_URL) return null;
  try {
    const response = await fetch(`${APP_URL}/api/conversation/telephone-launch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telephony-service-token": process.env.TELEPHONY_SERVICE_TOKEN ?? "",
      },
      body: JSON.stringify({ callId }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<TelephonyAgentConfiguration>;
    if (!body.conversationId || !body.model || !body.instructions) return null;
    return {
      conversationId: body.conversationId,
      model: body.model,
      voice: body.voice ?? "marin",
      instructions: body.instructions,
      tools: body.tools ?? [],
    };
  } catch {
    return null;
  }
}

function headerValue(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function respondJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

// ── Graceful shutdown: Render recycles instances on deploy ──────────────────

async function shutdown(signal: string): Promise<void> {
  journal("service.shutdown_started", { reason: signal, activeCalls: activeSessions.size });
  server.close();
  await Promise.all([...activeSessions.values()].map((session) => session.shutdown()));
  journal("service.shutdown_complete", { reason: signal });
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

server.listen(PORT, () => {
  journal("service.started", { port: PORT });
});

export { server };
