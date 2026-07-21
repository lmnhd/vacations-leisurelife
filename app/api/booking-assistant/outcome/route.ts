import { NextRequest, NextResponse } from "next/server";

import { createOperatorRouteContext } from "@/lib/booking-assistant/operator-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { outcomeCoreLogic } from "./core-logic";

export const dynamic = "force-dynamic";

const VALID_OUTCOMES = [
  "no_call_received",
  "disconnected_call_back",
  "needs_guest_decision",
  "material_change",
  "payment_failed",
  "declined",
  "completed_pending_reconciliation",
  "confirmed",
] as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const hostname = request.headers.get("host") ?? undefined;
    const ctx = await createOperatorRouteContext(hostname);
    const { operatorService } = readBookingAssistantEnvConfig(hostname);

    const body = await request.json().catch(() => ({})) as {
      draftId?: string;
      expectedVersion?: number;
      outcome?: string;
      notes?: string;
    };

    if (!body.draftId || typeof body.expectedVersion !== "number") {
      return NextResponse.json({ success: false, error: "draftId and expectedVersion are required" }, { status: 400 });
    }

    const outcome = VALID_OUTCOMES.find((o) => o === body.outcome);
    if (!outcome) {
      return NextResponse.json({ success: false, error: "Invalid outcome" }, { status: 400 });
    }

    const result = await outcomeCoreLogic({
      clients: ctx.clients,
      config: operatorService,
      draftId: body.draftId,
      expectedVersion: body.expectedVersion,
      operatorSessionId: ctx.operatorSessionId,
      outcome,
      notes: body.notes,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Outcome recording failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}
