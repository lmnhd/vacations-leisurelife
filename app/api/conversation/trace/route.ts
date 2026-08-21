/**
 * Sanitized trace projection for the hidden portfolio trace window.
 *
 * Returns only typed, allowlisted trace events. It never exposes prompts,
 * reasoning, transcripts, raw provider payloads, PII, or secrets - the
 * sanitizer in lib/conversation/trace-events.ts drops anything not on the
 * detail allowlist before an event is ever buffered.
 */

import { NextRequest, NextResponse } from "next/server";

import { readTraceEvents } from "@/lib/conversation/trace-events";
import { getConversation } from "@/lib/conversation/conversation-registry";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const conversationId = request.nextUrl.searchParams.get("conversationId");
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId_required" }, { status: 400 });
  }

  // Only conversations this server knows about; unknown ids return an empty
  // stream rather than an error, so the trace window degrades quietly.
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    return NextResponse.json({ events: [], live: false });
  }

  const sinceEventId = request.nextUrl.searchParams.get("sinceEventId") ?? undefined;
  const events = await readTraceEvents(conversationId, sinceEventId);

  return NextResponse.json({ events, live: true });
}
