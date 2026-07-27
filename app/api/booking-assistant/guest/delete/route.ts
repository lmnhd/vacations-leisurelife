import { NextRequest, NextResponse } from "next/server";

import { requireGuestDraftSession } from "@/lib/booking-assistant/guest-authorization";
import { createGuestRouteContext } from "@/lib/booking-assistant/guest-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { deleteDraftProtectedContent } from "@/lib/booking-assistant/retention";
import { BOOKING_GUEST_SESSION_COOKIE } from "@/lib/booking-assistant/resume-tokens";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const context = await createGuestRouteContext();
  if (!context) return NextResponse.json({ success: false, error: "Booking Assistant is not enabled" }, { status: 503 });
  try {
    const body = await request.json().catch(() => ({})) as { draftId?: string; confirmDelete?: boolean };
    if (!body.draftId || body.confirmDelete !== true) {
      return NextResponse.json({ success: false, error: "draftId and confirmDelete=true are required" }, { status: 400 });
    }
    requireGuestDraftSession(request.cookies.get(BOOKING_GUEST_SESSION_COOKIE)?.value, body.draftId);
    const { operatorService } = readBookingAssistantEnvConfig(undefined);
    const result = await deleteDraftProtectedContent(
      context.clients.dynamo,
      operatorService,
      body.draftId,
      "guest_requested"
    );
    const response = NextResponse.json({ success: true, result });
    response.cookies.set({
      name: BOOKING_GUEST_SESSION_COOKIE,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      expires: new Date(0),
      path: "/",
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unable to delete draft" },
      { status: 403 }
    );
  }
}
