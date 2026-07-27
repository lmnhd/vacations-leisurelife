import { NextRequest, NextResponse } from "next/server";

import { createGuestRouteContext } from "@/lib/booking-assistant/guest-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import {
  BOOKING_GUEST_SESSION_COOKIE,
} from "@/lib/booking-assistant/resume-tokens";
import { resumeDraft } from "@/lib/booking-assistant/guest-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ draftId: string }> }
): Promise<NextResponse> {
  const ctx = await createGuestRouteContext();
  if (!ctx) {
    return NextResponse.json(
      { success: false, error: "Booking Assistant is not enabled" },
      { status: 503 }
    );
  }

  try {
    const { draftId } = await params;
    const { operatorService } = readBookingAssistantEnvConfig(undefined);

    const guestSessionCookie = request.cookies.get(BOOKING_GUEST_SESSION_COOKIE)?.value;
    const result = await resumeDraft(ctx.clients, operatorService, draftId, guestSessionCookie);
    if (!result) {
      return NextResponse.json(
        { success: false, error: "Draft not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, result: { draft: result.draft } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Resume failed";
    const status = detail.includes("Guest session") ? 403 : 500;
    return NextResponse.json({ success: false, error: detail }, { status });
  }
}
