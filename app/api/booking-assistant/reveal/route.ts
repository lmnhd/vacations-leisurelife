import { NextRequest, NextResponse } from "next/server";

import { createOperatorRouteContext } from "@/lib/booking-assistant/operator-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { revealCoreLogic } from "./core-logic";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const hostname = request.headers.get("host") ?? undefined;
    const ctx = await createOperatorRouteContext(hostname);
    const { operatorService } = readBookingAssistantEnvConfig(hostname);

    const body = await request.json().catch(() => ({})) as { draftId?: string };
    if (!body.draftId) {
      return NextResponse.json({ success: false, error: "draftId is required" }, { status: 400 });
    }

    const result = await revealCoreLogic({
      clients: ctx.clients,
      config: operatorService,
      draftId: body.draftId,
      operatorSessionId: ctx.operatorSessionId,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Reveal failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}
