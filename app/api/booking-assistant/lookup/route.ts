import { NextRequest, NextResponse } from "next/server";

import { createOperatorRouteContext } from "@/lib/booking-assistant/operator-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { lookupCoreLogic } from "./core-logic";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const hostname = request.headers.get("host") ?? undefined;
    const ctx = await createOperatorRouteContext(hostname);
    const { operatorService } = readBookingAssistantEnvConfig(hostname);

    const body = await request.json().catch(() => ({})) as { rawKeyInput?: string };
    const rawKeyInput = typeof body.rawKeyInput === "string" ? body.rawKeyInput.trim() : "";
    if (!rawKeyInput) {
      return NextResponse.json({ success: false, error: "rawKeyInput is required" }, { status: 400 });
    }

    const result = await lookupCoreLogic({
      clients: ctx.clients,
      config: operatorService,
      rawKeyInput,
      operatorSessionId: ctx.operatorSessionId,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Lookup failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}
