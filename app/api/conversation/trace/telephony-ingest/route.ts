import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v3";

import { getConversation } from "@/lib/conversation/conversation-registry";
import { ingestTelephonyTraceEvent } from "@/lib/conversation/telephony-trace-ingest";
import { flushTraceEvents } from "@/lib/conversation/trace-events";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  conversationId: z.string().min(8).max(80),
  event: z.string().min(1).max(80),
  detail: z.record(z.unknown()).default({}),
}).strict();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expectedToken = process.env.TELEPHONY_SERVICE_TOKEN ?? "";
  const suppliedToken = request.headers.get("x-telephony-service-token") ?? "";
  if (!expectedToken || !constantTimeEquals(expectedToken, suppliedToken)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw: unknown = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request_body" }, { status: 400 });
  }

  const conversation = await getConversation(parsed.data.conversationId);
  if (!conversation) {
    return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  }

  const accepted = ingestTelephonyTraceEvent({
    conversationId: conversation.conversationId,
    event: parsed.data.event,
    detail: parsed.data.detail,
    skillId: conversation.skillId,
    skillVersion: conversation.skillVersion,
  });
  await flushTraceEvents();
  return NextResponse.json({ accepted });
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}
