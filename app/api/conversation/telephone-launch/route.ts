/**
 * Telephone launch - the SIP transport's entry into the same conversation
 * runtime the browser uses.
 *
 * The telephony control service calls this to obtain the server-assembled
 * agent configuration for an inbound call. It never builds its own prompt,
 * tool list, or context: identical skill, snapshot, and tool policy, with
 * only the channel differing.
 *
 * Access is restricted to the telephony service via a shared token. An
 * anonymous inbound call always starts as the public concierge; a private
 * booking draft can only be attached later through an approved call-intent
 * correlation, never from caller ID.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v3";
import { timingSafeEqual } from "node:crypto";

import { validateLaunchEnvelope } from "@/lib/conversation/launch-envelope";
import { selectInitialSkill } from "@/lib/conversation/skill-transition-policy";
import { buildContextSnapshot } from "@/lib/conversation/context-providers";
import { assembleAgentConfiguration } from "@/lib/conversation/agent-config-assembler";
import {
  attachTransportSession,
  createConversation,
  updateConversation,
} from "@/lib/conversation/conversation-registry";
import { emitTraceEvent, flushTraceEvents } from "@/lib/conversation/trace-events";
import {
  REALTIME_VOICE,
  defaultProfileForChannel,
  resolveRealtimeModel,
} from "@/lib/conversation/voice-model-policy";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({ callId: z.string().min(1).max(200) }).strict();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expectedToken = process.env.TELEPHONY_SERVICE_TOKEN ?? "";
  const providedToken = request.headers.get("x-telephony-service-token") ?? "";

  if (!expectedToken || !constantTimeEquals(expectedToken, providedToken)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw: unknown = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request_body" }, { status: 400 });
  }

  const validation = validateLaunchEnvelope({
    channel: "telephone",
    mode: "showcase",
    source: "telephone",
    subjectRefs: {},
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }
  const envelope = validation.envelope;

  const skillSelection = selectInitialSkill({ envelope, authorization: "public" });
  const snapshot = await buildContextSnapshot({ envelope, bookingDraft: null });
  const sessionProfile = defaultProfileForChannel("telephone");

  const conversation = await createConversation({
    envelope,
    authorization: "public",
    skillId: skillSelection.skillId,
    skillVersion: skillSelection.version,
    snapshotId: snapshot.snapshotId,
    snapshotVersion: snapshot.version,
    allowedToolIds: [],
    sessionProfile,
  });

  const config = await assembleAgentConfiguration({
    conversationId: conversation.conversationId,
    channel: "telephone",
    mode: envelope.mode,
    authorization: "public",
    skillId: skillSelection.skillId,
    snapshot,
    sessionProfile,
  });

  await updateConversation(conversation.conversationId, {
    allowedToolIds: config.allowedToolIds,
  });
  await attachTransportSession(conversation.conversationId, parsed.data.callId, "telephone");

  emitTraceEvent(conversation.conversationId, {
    severity: "info",
    category: "transport",
    event: "telephone.call_configured",
    correlationId: conversation.conversationId,
    channel: "telephone",
    skillId: config.skillId,
    skillVersion: config.skillVersion,
    detail: {
      callId: parsed.data.callId,
      sessionProfile,
      allowedCount: config.allowedToolIds.length,
    },
  });

  const model = resolveRealtimeModel(sessionProfile);
  await flushTraceEvents();

  return NextResponse.json({
    conversationId: conversation.conversationId,
    model: model.apiId,
    voice: REALTIME_VOICE,
    instructions: config.instructions,
    tools: config.tools,
    skillId: config.skillId,
    skillVersion: config.skillVersion,
    snapshotVersion: config.snapshotVersion,
  });
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  // Length is not secret here (both are fixed-length configured tokens), and
  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}
