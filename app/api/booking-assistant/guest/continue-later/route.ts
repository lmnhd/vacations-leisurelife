import { NextRequest, NextResponse } from "next/server";

import { buildReminderProgram, serializeReminderProgram } from "@/lib/booking-assistant/reminders";
import { requireGuestDraftSession } from "@/lib/booking-assistant/guest-authorization";
import { createGuestRouteContext } from "@/lib/booking-assistant/guest-route-context";
import { ensureGuestDraftIsActive } from "@/lib/booking-assistant/guest-service";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { createKlaviyoBookingNotificationTransport, assertNotificationHasNoSensitiveSubjectData } from "@/lib/booking-assistant/notifications";
import { BOOKING_GUEST_SESSION_COOKIE, issueResumeToken } from "@/lib/booking-assistant/resume-tokens";
import { updateDraftStatusWithJournal } from "@/lib/booking-assistant/store";

export const dynamic = "force-dynamic";

function publicBaseUrl(request: NextRequest): string {
  const configured = process.env.BOOKING_ASSISTANT_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.endsWith("/") ? configured.slice(0, -1) : configured;
  if (request.nextUrl.hostname === "localhost" || request.nextUrl.hostname === "127.0.0.1") {
    return request.nextUrl.origin;
  }
  throw new Error("BOOKING_ASSISTANT_PUBLIC_BASE_URL is required for resume email");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const context = await createGuestRouteContext();
  if (!context) return NextResponse.json({ success: false, error: "Booking Assistant is not enabled" }, { status: 503 });
  try {
    const body = await request.json().catch(() => ({})) as {
      draftId?: string;
      expectedVersion?: number;
      resumeTaskId?: string;
      nextTaskId?: string;
      idempotencyKey?: string;
    };
    if (!body.draftId || !Number.isInteger(body.expectedVersion) || !body.resumeTaskId || !body.idempotencyKey) {
      return NextResponse.json({ success: false, error: "draftId, expectedVersion, resumeTaskId, and idempotencyKey are required" }, { status: 400 });
    }
    const session = requireGuestDraftSession(
      request.cookies.get(BOOKING_GUEST_SESSION_COOKIE)?.value,
      body.draftId
    );
    const { operatorService } = readBookingAssistantEnvConfig(undefined);
    const snapshot = await ensureGuestDraftIsActive(
      context.clients,
      operatorService,
      body.draftId,
      session.personId,
      "continue_later"
    );
    const issued = await issueResumeToken(context.clients.dynamo, operatorService, {
      draftId: body.draftId,
      personId: session.personId,
      redirectDealId: snapshot.metadata.dealId,
      ttlSeconds: 30 * 24 * 60 * 60,
    });
    const program = buildReminderProgram(body.draftId, "continue_later_v1");
    const transition = await updateDraftStatusWithJournal(context.clients, operatorService, {
      draftId: body.draftId,
      expectedVersion: snapshot.metadata.version,
      newStatus: "paused_by_guest",
      idempotencyKey: body.idempotencyKey,
      additionalUpdates: {
        resumeTaskId: body.resumeTaskId,
        nextTaskId: body.nextTaskId ?? body.resumeTaskId,
      },
      journalEvent: {
        eventType: "continue_later_armed",
        actorType: "guest",
        occurredAtIso: new Date().toISOString(),
        privacyClass: "operational",
        idempotencyKey: body.idempotencyKey,
        payload: {
          taskId: body.resumeTaskId,
          programType: "continue_later_v1",
          scheduledWindow: program.nextSendAtIso,
        },
      },
      extraPutItems: [serializeReminderProgram(program)],
    });
    const base = publicBaseUrl(request);
    const notification = {
      kind: "resume_receipt" as const,
      email: snapshot.contact.email,
      resumeUrl: `${base}/api/booking-assistant/resume?token=${encodeURIComponent(issued.token)}`,
      dealLabel: snapshot.dealSnapshot.dealAngle,
      nextTaskLabel: body.resumeTaskId,
      reminderControlsUrl: `${base}/deals/${encodeURIComponent(snapshot.metadata.dealId)}/book`,
      idempotencyKey: `${body.idempotencyKey}:receipt`,
    };
    assertNotificationHasNoSensitiveSubjectData(notification);
    let notificationAccepted = false;
    try {
      const sent = await createKlaviyoBookingNotificationTransport().send(notification);
      notificationAccepted = sent.accepted;
    } catch {
      notificationAccepted = false;
    }
    return NextResponse.json({
      success: true,
      result: {
        newVersion: transition.newVersion,
        programId: program.programId,
        nextReminderAtIso: program.nextSendAtIso,
        resumeExpiresAtIso: issued.expiresAtIso,
        notificationAccepted,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unable to continue later" },
      { status: 409 }
    );
  }
}
