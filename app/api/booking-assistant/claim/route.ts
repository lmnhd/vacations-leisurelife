import { NextRequest, NextResponse } from "next/server";

import { createOperatorRouteContext } from "@/lib/booking-assistant/operator-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { claimCoreLogic } from "./core-logic";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const hostname = request.headers.get("host") ?? undefined;
    const ctx = await createOperatorRouteContext(hostname);
    const { operatorService } = readBookingAssistantEnvConfig(hostname);

    const body = await request.json().catch(() => ({})) as {
      draftId?: string;
      expectedVersion?: number;
    };

    if (!body.draftId || typeof body.expectedVersion !== "number") {
      return NextResponse.json({ success: false, error: "draftId and expectedVersion are required" }, { status: 400 });
    }

    const result = await claimCoreLogic({
      clients: ctx.clients,
      config: operatorService,
      draftId: body.draftId,
      expectedVersion: body.expectedVersion,
      operatorSessionId: ctx.operatorSessionId,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Claim failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}
