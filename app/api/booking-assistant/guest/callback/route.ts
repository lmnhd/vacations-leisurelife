import { NextRequest, NextResponse } from "next/server";

import { requireGuestDraftSession } from "@/lib/booking-assistant/guest-authorization";
import { createGuestRouteContext } from "@/lib/booking-assistant/guest-route-context";
import { requestBookingCallback } from "@/lib/booking-assistant/no-agents-service";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { BOOKING_GUEST_SESSION_COOKIE } from "@/lib/booking-assistant/resume-tokens";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ctx = await createGuestRouteContext();
  if (!ctx) return NextResponse.json({ success: false, error: "Booking Assistant is not enabled" }, { status: 503 });
  try {
    const { operatorService } = readBookingAssistantEnvConfig(undefined);
    const body = await request.json().catch(() => ({})) as {
      draftId?: string;
      expectedVersion?: number;
      preference?: "as_soon_as_available" | "preferred_window";
      windowStartIso?: string;
      windowEndIso?: string;
      timeZone?: string;
    };
    if (
      !body.draftId ||
      typeof body.expectedVersion !== "number" ||
      (body.preference !== "as_soon_as_available" && body.preference !== "preferred_window") ||
      !body.timeZone
    ) {
      return NextResponse.json({ success: false, error: "Complete callback preference is required" }, { status: 400 });
    }
    requireGuestDraftSession(
      request.cookies.get(BOOKING_GUEST_SESSION_COOKIE)?.value,
      body.draftId
    );
    const configuredBase = process.env.BOOKING_ASSISTANT_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const publicBaseUrl = configuredBase || request.nextUrl.origin;
    const result = await requestBookingCallback(ctx.clients, operatorService, {
      draftId: body.draftId,
      expectedVersion: body.expectedVersion,
      preference: body.preference,
      windowStartIso: body.windowStartIso,
      windowEndIso: body.windowEndIso,
      timeZone: body.timeZone,
      publicBaseUrl,
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Callback request failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}
