import { NextRequest, NextResponse } from "next/server";

import { createGuestRouteContext } from "@/lib/booking-assistant/guest-route-context";
import { ensureGuestDraftIsActive } from "@/lib/booking-assistant/guest-service";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { markReviewReady } from "@/lib/booking-assistant/guest-service";
import { requireGuestDraftSession } from "@/lib/booking-assistant/guest-authorization";
import { createKlaviyoBookingNotificationTransport, assertNotificationHasNoSensitiveSubjectData } from "@/lib/booking-assistant/notifications";
import { buildReminderProgram, serializeReminderProgram } from "@/lib/booking-assistant/reminders";
import { BOOKING_GUEST_SESSION_COOKIE, issueResumeToken } from "@/lib/booking-assistant/resume-tokens";
import { getDraft, updateDraftStatusWithJournal } from "@/lib/booking-assistant/store";

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
      travelers?: unknown[];
      cabin?: unknown;
      decisions?: Record<string, unknown>;
    };

    if (!body.draftId || typeof body.expectedVersion !== "number") {
      return NextResponse.json(
        { success: false, error: "draftId and expectedVersion are required" },
        { status: 400 }
      );
    }
    const session = requireGuestDraftSession(
      request.cookies.get(BOOKING_GUEST_SESSION_COOKIE)?.value,
      body.draftId
    );
    const activeDraft = await ensureGuestDraftIsActive(
      ctx.clients,
      operatorService,
      body.draftId,
      session.personId,
      "review_ready"
    );

    // Idempotent re-submit: the guest can reach "Looks right" again by tapping
    // Back into the flow after the packet was already accepted (e.g. a slow
    // network made them think the first tap did nothing). `review_ready` and
    // `ready_to_call_agent` are the two states this endpoint itself produces, so
    // seeing either means the review already succeeded. Re-running the
    // transitions would throw InvalidTransitionError (ready_to_call_agent ->
    // review_ready) and dead-end the guest at "Restart this booking." Instead we
    // return success with the current version so the client advances straight to
    // the call-finalize screen. Nothing is re-written; the packet is untouched.
    if (
      activeDraft.metadata.status === "review_ready" ||
      activeDraft.metadata.status === "ready_to_call_agent"
    ) {
      return NextResponse.json({
        success: true,
        result: {
          newVersion: activeDraft.metadata.version,
          reminderProgramId: null,
          notificationAccepted: false,
          alreadyReviewed: true,
        },
      });
    }

    const reviewed = await markReviewReady(ctx.clients, operatorService, {
      draftId: body.draftId,
      expectedVersion: activeDraft.metadata.version,
      travelers: body.travelers as never,
      cabin: body.cabin as never,
      decisions: body.decisions as never,
    });
    const snapshot = await getDraft(ctx.clients, operatorService, body.draftId);
    if (!snapshot || snapshot.metadata.personId !== session.personId) {
      return NextResponse.json({ success: false, error: "Draft not found" }, { status: 404 });
    }
    const program = buildReminderProgram(body.draftId, "call_to_finalize_v1");
    const ready = await updateDraftStatusWithJournal(ctx.clients, operatorService, {
      draftId: body.draftId,
      expectedVersion: reviewed.newVersion,
      newStatus: "ready_to_call_agent",
      idempotencyKey: `ready-to-call:${body.draftId}:${reviewed.newVersion}`,
      additionalUpdates: {
        readyToCallAtIso: new Date().toISOString(),
      },
      journalEvent: {
        eventType: "ready_to_call_agent",
        actorType: "system",
        occurredAtIso: new Date().toISOString(),
        privacyClass: "operational",
        idempotencyKey: `ready-to-call-event:${body.draftId}:${reviewed.newVersion}`,
        payload: { completionMode: snapshot.metadata.completionMode },
      },
      extraPutItems: [serializeReminderProgram(program)],
    });
    const configuredBase = process.env.BOOKING_ASSISTANT_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const base = configuredBase
      ? configuredBase.endsWith("/") ? configuredBase.slice(0, -1) : configuredBase
      : request.nextUrl.hostname === "localhost" || request.nextUrl.hostname === "127.0.0.1"
        ? request.nextUrl.origin
        : "";
    let notificationAccepted = false;
    if (base) {
      const issued = await issueResumeToken(ctx.clients.dynamo, operatorService, {
        draftId: body.draftId,
        personId: session.personId,
        redirectDealId: snapshot.metadata.dealId,
        ttlSeconds: 30 * 24 * 60 * 60,
      });
      const rawKey = snapshot.fallbackCallKey?.encryptedRawValue
        ? await ctx.clients.encryption.decrypt(snapshot.fallbackCallKey.encryptedRawValue)
        : undefined;
      const notification = {
        kind: "ready_to_call_receipt" as const,
        email: snapshot.contact.email,
        resumeUrl: `${base}/api/booking-assistant/resume?token=${encodeURIComponent(issued.token)}`,
        dealLabel: snapshot.dealSnapshot.dealAngle,
        fallbackCallKey: rawKey,
        agencyPhone: process.env.BOOKING_ASSISTANT_AGENCY_PHONE?.trim(),
        reminderControlsUrl: `${base}/deals/${encodeURIComponent(snapshot.metadata.dealId)}/book`,
        idempotencyKey: `ready-receipt:${body.draftId}:${ready.newVersion}`,
      };
      assertNotificationHasNoSensitiveSubjectData(notification);
      try {
        const sent = await createKlaviyoBookingNotificationTransport().send(notification);
        notificationAccepted = sent.accepted;
      } catch {
        notificationAccepted = false;
      }
    }

    return NextResponse.json({
      success: true,
      result: {
        newVersion: ready.newVersion,
        reminderProgramId: program.programId,
        notificationAccepted,
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Review ready failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}
