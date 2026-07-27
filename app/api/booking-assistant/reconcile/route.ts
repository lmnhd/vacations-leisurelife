import { NextRequest, NextResponse } from "next/server";

import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { createOperatorRouteContext } from "@/lib/booking-assistant/operator-route-context";
import { reconcileBookingReference } from "@/lib/booking-assistant/operator-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({})) as {
      draftId?: string;
      expectedVersion?: number;
      bookingReference?: string;
      evidenceType?: "cbat_trip" | "supplier_confirmation";
    };
    if (
      !body.draftId ||
      typeof body.expectedVersion !== "number" ||
      !body.bookingReference ||
      (body.evidenceType !== "cbat_trip" && body.evidenceType !== "supplier_confirmation")
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "draftId, expectedVersion, bookingReference, and evidenceType are required",
        },
        { status: 400 }
      );
    }
    const hostname = request.headers.get("host") ?? undefined;
    const context = await createOperatorRouteContext(hostname);
    const { operatorService } = readBookingAssistantEnvConfig(hostname);
    const result = await reconcileBookingReference(context.clients, operatorService, {
      draftId: body.draftId,
      expectedVersion: body.expectedVersion,
      bookingReference: body.bookingReference,
      evidenceType: body.evidenceType,
      operatorSessionId: context.operatorSessionId,
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Reconciliation failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}
