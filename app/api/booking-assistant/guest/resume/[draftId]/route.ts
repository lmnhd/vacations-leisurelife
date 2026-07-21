import { NextRequest, NextResponse } from "next/server";

import { createGuestRouteContext } from "@/lib/booking-assistant/guest-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
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

    const result = await resumeDraft(ctx.clients, operatorService, draftId);
    if (!result) {
      return NextResponse.json(
        { success: false, error: "Draft not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, draft: result.draft });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Resume failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}
