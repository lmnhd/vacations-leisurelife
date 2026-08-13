/**
 * Conversation launch - the only route that creates a browser voice session.
 *
 * The request body is a ConversationLaunchEnvelope and nothing else. All
 * prompt, skill, tool, and context resolution happens server-side. The
 * authorization level is derived from the guest session cookie, never from
 * the request body.
 */

import { NextRequest, NextResponse } from "next/server";

import { launchVoiceConversation } from "@/lib/conversation/session-launcher";
import { BOOKING_GUEST_SESSION_COOKIE } from "@/lib/booking-assistant/resume-tokens";
import { requireGuestDraftSession } from "@/lib/booking-assistant/guest-authorization";
import type { ToolAuthorizationLevel } from "@/lib/conversation/tool-policy";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw: unknown = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "invalid_request_body" }, { status: 400 });
  }

  const body = raw as Record<string, unknown>;
  const subjectRefs =
    body["subjectRefs"] && typeof body["subjectRefs"] === "object"
      ? (body["subjectRefs"] as Record<string, unknown>)
      : {};
  const requestedDraftId =
    typeof subjectRefs["bookingDraftId"] === "string"
      ? (subjectRefs["bookingDraftId"] as string)
      : undefined;

  // Authorization comes from the signed guest session cookie for exactly the
  // draft being referenced. A client cannot claim authorization in the body.
  let authorization: ToolAuthorizationLevel = "public";
  let bookingDraftId: string | undefined;
  let personId: string | undefined;

  if (requestedDraftId) {
    const cookieValue = request.cookies.get(BOOKING_GUEST_SESSION_COOKIE)?.value;
    try {
      const session = requireGuestDraftSession(cookieValue, requestedDraftId);
      authorization = "authorized_guest";
      bookingDraftId = session.draftId;
      personId = session.personId;
    } catch {
      return NextResponse.json(
        { error: "guest_session_not_authorized_for_draft" },
        { status: 403 }
      );
    }
  }

  const result = await launchVoiceConversation({
    raw: body,
    authorization,
    bookingDraftId,
    personId,
  });

  return NextResponse.json(result.body, { status: result.status });
}
