/**
 * Guarded tool dispatch for an active conversation.
 *
 * The browser may name a tool and pass arguments, but the conversation's
 * server-persisted allowlist decides whether it runs, and each tool validates
 * its own payload. There is no path from here to an arbitrary endpoint name.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v3";

import { executeConversationTool } from "@/lib/conversation/tool-execution";
import { flushTraceEvents } from "@/lib/conversation/trace-events";

export const dynamic = "force-dynamic";

const RequestSchema = z
  .object({
    conversationId: z.string().min(8).max(80),
    toolId: z.string().min(1).max(80),
    toolCallId: z.string().min(1).max(200).optional(),
    payload: z.record(z.unknown()).default({}),
  })
  .strict();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw: unknown = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request_body" }, { status: 400 });
  }

  const result = await executeConversationTool({
    conversationId: parsed.data.conversationId,
    toolId: parsed.data.toolId,
    toolCallId: parsed.data.toolCallId,
    payload: parsed.data.payload,
  });
  await flushTraceEvents();

  return NextResponse.json({ data: result.data, ui: result.ui }, { status: result.status });
}
