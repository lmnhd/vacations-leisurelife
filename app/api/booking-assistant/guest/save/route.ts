import { NextRequest, NextResponse } from "next/server";

import { createGuestRouteContext } from "@/lib/booking-assistant/guest-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { saveDraft, type SaveDraftInput } from "@/lib/booking-assistant/guest-service";

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
    const body = await request.json().catch(() => ({})) as Partial<SaveDraftInput>;

    if (!body.draftId || !body.personId || !body.contact || !body.dealSnapshot) {
      return NextResponse.json(
        { success: false, error: "draftId, personId, contact, and dealSnapshot are required" },
        { status: 400 }
      );
    }

    const result = await saveDraft(ctx.clients, operatorService, {
      draftId: body.draftId,
      personId: body.personId,
      dealSnapshot: body.dealSnapshot,
      contact: body.contact,
      initialStatus: body.initialStatus ?? "collecting",
      flowDefinitionVersion: body.flowDefinitionVersion ?? 1,
      bookingFlowVersion: body.bookingFlowVersion ?? 1,
      completionMode: body.completionMode ?? "call_agent_to_finalize_v1",
      completionModeVersion: body.completionModeVersion ?? 1,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Save draft failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}
