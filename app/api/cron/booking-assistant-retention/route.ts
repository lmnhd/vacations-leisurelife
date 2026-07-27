import { NextRequest, NextResponse } from "next/server";

import { createGuestRouteContext } from "@/lib/booking-assistant/guest-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { sweepExpiredBookingDrafts } from "@/lib/booking-assistant/retention-worker";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.BOOKING_ASSISTANT_RETENTION_ENABLED !== "true") {
    return NextResponse.json({ success: false, error: "Booking Assistant retention is not enabled" }, { status: 503 });
  }
  const retentionDays = Number(process.env.BOOKING_ASSISTANT_RETENTION_DAYS);
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    return NextResponse.json({ success: false, error: "BOOKING_ASSISTANT_RETENTION_DAYS is invalid" }, { status: 503 });
  }
  const context = await createGuestRouteContext();
  if (!context) return NextResponse.json({ success: false, error: "Booking Assistant is not enabled" }, { status: 503 });
  const { operatorService } = readBookingAssistantEnvConfig(undefined);
  const result = await sweepExpiredBookingDrafts(
    context.clients.dynamo,
    operatorService,
    retentionDays
  );
  return NextResponse.json({ success: true, result });
}
