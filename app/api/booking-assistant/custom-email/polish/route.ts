import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { polishOperatorEmailDraft } from "@/lib/booking-assistant/operator-email-polish";
import { createOperatorRouteContext } from "@/lib/booking-assistant/operator-route-context";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  draftId: z.string().min(1).max(200),
  subject: z.string().max(200).optional().default(""),
  body: z.string().min(2).max(8_000),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    const hostname = request.headers.get("host") ?? undefined;
    // The rewrite is an operator-only convenience. Build the local context
    // before accepting any draft text, so it remains fail-closed like sending.
    await createOperatorRouteContext(hostname);
    const input = RequestSchema.parse(await request.json());
    const result = await polishOperatorEmailDraft({
      subject: input.subject,
      body: input.body,
    });
    console.info("[Booking Assistant email polish] completed", {
      elapsedMs: Date.now() - startedAt,
      inputBodyLength: input.body.length,
      outputBodyLength: result.body.length,
      model: result.model,
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Email rewrite failed.";
    const timedOut =
      detail.toLowerCase().includes("abort") || detail.toLowerCase().includes("timeout");
    console.error("[Booking Assistant email polish] failed", {
      elapsedMs: Date.now() - startedAt,
      timedOut,
      detail,
    });
    const isClientError =
      error instanceof z.ZodError ||
      detail.includes("cannot be sent") ||
      detail.includes("must be between");
    return NextResponse.json(
      { success: false, error: timedOut ? "The rewrite took too long. Please try again." : detail },
      { status: isClientError ? 400 : timedOut ? 504 : 500 }
    );
  }
}
