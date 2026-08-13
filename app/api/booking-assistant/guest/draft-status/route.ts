import { NextRequest, NextResponse } from "next/server";

import { createGuestRouteContext } from "@/lib/booking-assistant/guest-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import {
  BOOKING_GUEST_SESSION_COOKIE,
  parseGuestSessionCookieValue,
} from "@/lib/booking-assistant/resume-tokens";
import { getDraftStatusSummary } from "@/lib/booking-assistant/store";

export const dynamic = "force-dynamic";

/**
 * Minimal "has my draft changed yet?" probe for guest-side polling.
 *
 * The booking flow polls while waiting for an operator to acknowledge a call
 * signal. It previously called the full resume endpoint every 2s, which ran a
 * whole-partition read plus two KMS decrypts to surface one status string —
 * cost that scaled with guest traffic. This returns only status and version,
 * from a single projected point read on META.
 *
 * Authorization matches the resume path: a valid guest session cookie bound to
 * this draft, and a personId that matches the draft owner. No PII is returned.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const ctx = await createGuestRouteContext();
  if (!ctx) {
    return NextResponse.json(
      { success: false, error: "Booking Assistant is not enabled" },
      { status: 503 }
    );
  }

  const draftId = request.nextUrl.searchParams.get("draftId");
  if (!draftId) {
    return NextResponse.json(
      { success: false, error: "draftId is required" },
      { status: 400 }
    );
  }

  const cookieValue = request.cookies.get(BOOKING_GUEST_SESSION_COOKIE)?.value;
  const session = cookieValue ? parseGuestSessionCookieValue(cookieValue) : null;
  if (!session || session.draftId !== draftId) {
    return NextResponse.json(
      { success: false, error: "Guest session is not authorized for this draft" },
      { status: 403 }
    );
  }

  try {
    const { operatorService } = readBookingAssistantEnvConfig(undefined);
    const summary = await getDraftStatusSummary(
      ctx.clients as never,
      operatorService,
      draftId
    );
    if (!summary) {
      return NextResponse.json(
        { success: false, error: "Draft not found" },
        { status: 404 }
      );
    }
    if (summary.personId !== session.personId) {
      return NextResponse.json(
        { success: false, error: "Guest session does not match the draft owner" },
        { status: 403 }
      );
    }
    return NextResponse.json({
      success: true,
      result: { status: summary.status, version: summary.version },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Status probe failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}
