import { NextRequest, NextResponse } from "next/server";

import { createGuestRouteContext } from "@/lib/booking-assistant/guest-route-context";
import { createKlaviyoBookingNotificationTransport } from "@/lib/booking-assistant/notifications";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { processDueBookingReminders } from "@/lib/booking-assistant/reminder-worker";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const context = await createGuestRouteContext();
  if (!context) return NextResponse.json({ success: false, error: "Booking Assistant is not enabled" }, { status: 503 });
  const base = process.env.BOOKING_ASSISTANT_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!base) {
    return NextResponse.json({ success: false, error: "Booking Assistant public base URL is not configured" }, { status: 503 });
  }
  const { operatorService } = readBookingAssistantEnvConfig(undefined);
  const result = await processDueBookingReminders(
    context.clients.dynamo,
    context.clients.encryption,
    operatorService,
    createKlaviyoBookingNotificationTransport(),
    base
  );
  return NextResponse.json({ success: true, result });
}
