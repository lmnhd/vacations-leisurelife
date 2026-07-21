import { NextRequest, NextResponse } from "next/server";

import { createOperatorRouteContext } from "@/lib/booking-assistant/operator-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { verifyCoreLogic } from "./core-logic";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const hostname = request.headers.get("host") ?? undefined;
    const ctx = await createOperatorRouteContext(hostname);
    const { operatorService } = readBookingAssistantEnvConfig(hostname);

    const body = await request.json().catch(() => ({})) as {
      draftId?: string;
      expectedVersion?: number;
      callerIdState?: string;
      verificationNotes?: string;
    };

    if (!body.draftId || typeof body.expectedVersion !== "number") {
      return NextResponse.json({ success: false, error: "draftId and expectedVersion are required" }, { status: 400 });
    }

    const validCallerIdStates = ["matched", "different", "blocked", "unavailable"] as const;
    const callerIdState = validCallerIdStates.find((s) => s === body.callerIdState);
    if (!callerIdState) {
      return NextResponse.json({ success: false, error: "Invalid callerIdState" }, { status: 400 });
    }

    const result = await verifyCoreLogic({
      clients: ctx.clients,
      config: operatorService,
      draftId: body.draftId,
      expectedVersion: body.expectedVersion,
      callerIdState,
      operatorSessionId: ctx.operatorSessionId,
      verificationNotes: body.verificationNotes,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Verification failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}
