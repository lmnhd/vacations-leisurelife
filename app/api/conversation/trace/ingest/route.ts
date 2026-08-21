/**
 * Client trace ingest endpoint.
 *
 * The browser batches the conversation moments only it can see - turn taking,
 * transcript completion, barge-in, mic permission, reconnects, and the model
 * requesting a tool - and posts them here.
 *
 * This endpoint is deliberately narrow: the event name must exist in a
 * server-side vocabulary, details are clamped to short scalars, and everything
 * still passes the shared trace sanitizer. A client cannot invent an event
 * name, choose a severity, or write content into the trace.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v3";

import { getConversation } from "@/lib/conversation/conversation-registry";
import { ingestClientTraceEvents } from "@/lib/conversation/client-trace-ingest";
import { flushTraceEvents } from "@/lib/conversation/trace-events";

export const dynamic = "force-dynamic";

const RequestSchema = z
  .object({
    conversationId: z.string().min(8).max(80),
    events: z
      .array(
        z
          .object({
            event: z.string().min(1).max(60),
            detail: z.record(z.unknown()).optional(),
          })
          .strict()
      )
      .max(50),
  })
  .strict();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw: unknown = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request_body" }, { status: 400 });
  }

  const conversation = await getConversation(parsed.data.conversationId);
  if (!conversation) {
    // Unknown or expired conversation: accept quietly so a late batch from a
    // closed session never surfaces an error to the guest.
    return NextResponse.json({ accepted: 0, rejected: 0 });
  }

  const result = ingestClientTraceEvents(
    conversation.conversationId,
    conversation.envelope.channel,
    parsed.data.events,
    { skillId: conversation.skillId, skillVersion: conversation.skillVersion }
  );
  await flushTraceEvents();

  return NextResponse.json(result);
}
