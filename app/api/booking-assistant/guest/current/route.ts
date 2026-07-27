import { NextRequest, NextResponse } from "next/server";

import { loadConfirmedFields } from "@/lib/booking-assistant/field-revisions";
import { createGuestRouteContext } from "@/lib/booking-assistant/guest-route-context";
import { resumeDraft } from "@/lib/booking-assistant/guest-service";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import {
  BOOKING_GUEST_SESSION_COOKIE,
  parseGuestSessionCookieValue,
} from "@/lib/booking-assistant/resume-tokens";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const context = await createGuestRouteContext();
  if (!context) return NextResponse.json({ success: false, error: "Booking Assistant is not enabled" }, { status: 503 });
  try {
    const cookieValue = request.cookies.get(BOOKING_GUEST_SESSION_COOKIE)?.value;
    const session = cookieValue ? parseGuestSessionCookieValue(cookieValue) : null;
    if (!session) {
      return NextResponse.json({ success: false, error: "No active guest draft session" }, { status: 401 });
    }
    const { operatorService } = readBookingAssistantEnvConfig(undefined);
    const resumed = await resumeDraft(context.clients, operatorService, session.draftId, cookieValue);
    if (!resumed) return NextResponse.json({ success: false, error: "Draft not found" }, { status: 404 });
    const fields = await loadConfirmedFields(
      context.clients.dynamo,
      context.clients.encryption,
      operatorService,
      session.draftId
    );
    const fallbackCallKey = resumed.draft.fallbackCallKey?.encryptedRawValue
      ? await context.clients.encryption.decrypt(resumed.draft.fallbackCallKey.encryptedRawValue)
      : null;
    const response = NextResponse.json({
      success: true,
      result: {
        draft: resumed.draft,
        fields,
        fallbackCallKey,
      },
    });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unable to resume draft" },
      { status: 403 }
    );
  }
}
