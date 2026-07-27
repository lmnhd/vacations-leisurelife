import { NextRequest, NextResponse } from "next/server";

import { createGuestRouteContext } from "@/lib/booking-assistant/guest-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { getDraft } from "@/lib/booking-assistant/store";
import {
  consumeResumeToken,
  BOOKING_GUEST_SESSION_COOKIE,
} from "@/lib/booking-assistant/resume-tokens";
import { createGuestSessionForDraft } from "@/lib/booking-assistant/guest-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ctx = await createGuestRouteContext();
  if (!ctx) {
    return NextResponse.json(
      { success: false, error: "Booking Assistant is not enabled" },
      { status: 503 }
    );
  }

  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json(
      { success: false, error: "token is required" },
      { status: 400, headers: { "Referrer-Policy": "no-referrer" } }
    );
  }

  try {
    const { operatorService } = readBookingAssistantEnvConfig(undefined);
    const consumed = await consumeResumeToken(ctx.clients.dynamo, operatorService, token);
    if (!consumed) {
      return NextResponse.json(
        { success: false, error: "Resume token is invalid or expired" },
        { status: 403, headers: { "Referrer-Policy": "no-referrer" } }
      );
    }

    const draft = await getDraft(ctx.clients as never, operatorService, consumed.draftId);
    if (!draft) {
      return NextResponse.json(
        { success: false, error: "Draft not found" },
        { status: 404, headers: { "Referrer-Policy": "no-referrer" } }
      );
    }

    const session = createGuestSessionForDraft(consumed.draftId, consumed.personId);
    const redirectUrl = new URL(`/deals/${encodeURIComponent(draft.metadata.dealId)}/book`, request.url);
    const response = NextResponse.redirect(redirectUrl, {
      headers: { "Referrer-Policy": "no-referrer" },
    });
    response.cookies.set({
      name: BOOKING_GUEST_SESSION_COOKIE,
      value: session.cookieValue,
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      expires: new Date(session.expiresAtIso),
      path: "/",
    });
    return response;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Resume token exchange failed";
    return NextResponse.json(
      { success: false, error: detail },
      { status: 500, headers: { "Referrer-Policy": "no-referrer" } }
    );
  }
}
