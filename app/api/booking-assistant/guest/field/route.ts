import { NextRequest, NextResponse } from "next/server";

import { confirmDraftField, loadConfirmedFields } from "@/lib/booking-assistant/field-revisions";
import { requireGuestDraftSession } from "@/lib/booking-assistant/guest-authorization";
import { createGuestRouteContext } from "@/lib/booking-assistant/guest-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { BOOKING_GUEST_SESSION_COOKIE } from "@/lib/booking-assistant/resume-tokens";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const context = await createGuestRouteContext();
  if (!context) return NextResponse.json({ success: false, error: "Booking Assistant is not enabled" }, { status: 503 });
  try {
    const draftId = request.nextUrl.searchParams.get("draftId") ?? "";
    requireGuestDraftSession(request.cookies.get(BOOKING_GUEST_SESSION_COOKIE)?.value, draftId);
    const { operatorService } = readBookingAssistantEnvConfig(undefined);
    const fields = await loadConfirmedFields(
      context.clients.dynamo,
      context.clients.encryption,
      operatorService,
      draftId
    );
    return NextResponse.json({ success: true, result: { fields } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unable to load fields" },
      { status: 403 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const context = await createGuestRouteContext();
  if (!context) return NextResponse.json({ success: false, error: "Booking Assistant is not enabled" }, { status: 503 });
  try {
    const body = await request.json().catch(() => ({})) as {
      draftId?: string;
      fieldId?: string;
      value?: unknown;
      expectedVersion?: number;
      idempotencyKey?: string;
      nextTaskId?: string;
      completionPct?: number;
    };
    if (!body.draftId || !body.fieldId || !Number.isInteger(body.expectedVersion) || !body.idempotencyKey) {
      return NextResponse.json({ success: false, error: "draftId, fieldId, expectedVersion, and idempotencyKey are required" }, { status: 400 });
    }
    const session = requireGuestDraftSession(
      request.cookies.get(BOOKING_GUEST_SESSION_COOKIE)?.value,
      body.draftId
    );
    const { operatorService } = readBookingAssistantEnvConfig(undefined);
    const result = await confirmDraftField(
      context.clients.dynamo,
      context.clients.encryption,
      operatorService,
      {
        draftId: body.draftId,
        personId: session.personId,
        fieldId: body.fieldId,
        value: body.value,
        expectedVersion: body.expectedVersion as number,
        idempotencyKey: body.idempotencyKey,
        nextTaskId: body.nextTaskId,
        completionPct: body.completionPct,
      }
    );
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unable to confirm field" },
      { status: 409 }
    );
  }
}
