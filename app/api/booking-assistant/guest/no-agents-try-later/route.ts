import { NextRequest, NextResponse } from "next/server";

import { requireGuestDraftSession } from "@/lib/booking-assistant/guest-authorization";
import { createGuestRouteContext } from "@/lib/booking-assistant/guest-route-context";
import { chooseNoAgentsTryLater } from "@/lib/booking-assistant/no-agents-service";
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
    };
    if (!body.draftId || typeof body.expectedVersion !== "number") {
      return NextResponse.json({ success: false, error: "draftId and expectedVersion are required" }, { status: 400 });
    }
    requireGuestDraftSession(
      request.cookies.get(BOOKING_GUEST_SESSION_COOKIE)?.value,
      body.draftId
    );
    const configuredBase = process.env.BOOKING_ASSISTANT_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const result = await chooseNoAgentsTryLater(ctx.clients, operatorService, {
      draftId: body.draftId,
      expectedVersion: body.expectedVersion,
      publicBaseUrl: configuredBase || request.nextUrl.origin,
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Try later request failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}
