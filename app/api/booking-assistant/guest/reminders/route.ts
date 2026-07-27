import { NextRequest, NextResponse } from "next/server";

import { requireGuestDraftSession } from "@/lib/booking-assistant/guest-authorization";
import { createGuestRouteContext } from "@/lib/booking-assistant/guest-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { getReminderProgram, stopReminderProgram } from "@/lib/booking-assistant/reminders";
import { BOOKING_GUEST_SESSION_COOKIE } from "@/lib/booking-assistant/resume-tokens";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const context = await createGuestRouteContext();
  if (!context) return NextResponse.json({ success: false, error: "Booking Assistant is not enabled" }, { status: 503 });
  try {
    const body = await request.json().catch(() => ({})) as { draftId?: string; action?: "stop" | "status" };
    if (!body.draftId || !body.action) {
      return NextResponse.json({ success: false, error: "draftId and action are required" }, { status: 400 });
    }
    requireGuestDraftSession(request.cookies.get(BOOKING_GUEST_SESSION_COOKIE)?.value, body.draftId);
    const { operatorService } = readBookingAssistantEnvConfig(undefined);
    if (body.action === "stop") {
      await stopReminderProgram(context.clients.dynamo, operatorService, body.draftId, "guest_opt_out");
    }
    const program = await getReminderProgram(context.clients.dynamo, operatorService, body.draftId);
    return NextResponse.json({ success: true, result: { program } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unable to update reminders" },
      { status: 403 }
    );
  }
}
