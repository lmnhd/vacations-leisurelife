import { NextRequest, NextResponse } from "next/server";

import { createGuestRouteContext } from "@/lib/booking-assistant/guest-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { markReviewReady } from "@/lib/booking-assistant/guest-service";

export const dynamic = "force-dynamic";

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

    const result = await markReviewReady(ctx.clients, operatorService, {
      draftId: body.draftId,
      expectedVersion: body.expectedVersion,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Review ready failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}
