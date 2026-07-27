import { NextRequest, NextResponse } from "next/server";

import { createGuestRouteContext } from "@/lib/booking-assistant/guest-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { cancelCallIntent } from "@/lib/booking-assistant/guest-service";
import { requireGuestDraftSession } from "@/lib/booking-assistant/guest-authorization";
import { BOOKING_GUEST_SESSION_COOKIE } from "@/lib/booking-assistant/resume-tokens";

export const dynamic = "force-dynamic";

/**
 * Guest-initiated cancel of a call_signal_pending/calling_now attempt back to
 * ready_to_call_agent — the server counterpart of the flow's "Cancel and go
 * back" button. Without this, the client-side reset alone leaves the server
 * version/status stranded, and the guest's next real signal attempt 500s on
 * a DraftVersionConflictError.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const ctx = await createGuestRouteContext();
  if (!ctx) {
    return NextResponse.json(
      { success: false, error: "Booking Assistant is not enabled" },
      { status: 503 }
    );
  }

  try {
    const { operatorService } = readBookingAssistantEnvConfig(undefined);
    const body = await request.json().catch(() => ({})) as {
      draftId?: string;
      expectedVersion?: number;
    };

    if (!body.draftId || typeof body.expectedVersion !== "number") {
      return NextResponse.json(
        { success: false, error: "draftId and expectedVersion are required" },
        { status: 400 }
      );
    }
    requireGuestDraftSession(
      request.cookies.get(BOOKING_GUEST_SESSION_COOKIE)?.value,
      body.draftId
    );

    const result = await cancelCallIntent(ctx.clients, operatorService, {
      draftId: body.draftId,
      expectedVersion: body.expectedVersion,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Call intent cancel failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}
