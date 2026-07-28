import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { sendCustomOperatorEmail } from "@/lib/booking-assistant/operator-custom-email";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { createOperatorRouteContext } from "@/lib/booking-assistant/operator-route-context";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  draftId: z.string().min(1).max(200),
  subject: z.string().min(2).max(200),
  body: z.string().min(2).max(8_000),
  source: z.enum(["operator_compose", "copilot_draft", "copilot_polished"]).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const hostname = request.headers.get("host") ?? undefined;
    const context = await createOperatorRouteContext(hostname);
    const { operatorService } = readBookingAssistantEnvConfig(hostname);
    const input = RequestSchema.parse(await request.json());

    const configuredBase =
      process.env.BOOKING_ASSISTANT_PUBLIC_BASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const publicBaseUrl = configuredBase || request.nextUrl.origin;

    const result = await sendCustomOperatorEmail(context.clients, operatorService, {
      draftId: input.draftId,
      operatorSessionId: context.operatorSessionId,
      subject: input.subject,
      body: input.body,
      source: input.source ?? "operator_compose",
      publicBaseUrl,
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Custom email could not be sent.";
    // Expected validation/consent/redaction failures are the guest-fixable 4xx
    // class; only unexpected faults are 500.
    const isClientError =
      error instanceof z.ZodError ||
      /cannot be sent|was not found|no saved email|not consented|must be between|active operator claim/i.test(detail);
    return NextResponse.json({ success: false, error: detail }, { status: isClientError ? 400 : 500 });
  }
}
