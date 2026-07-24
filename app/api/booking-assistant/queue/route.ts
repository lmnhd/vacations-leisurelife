import { NextRequest, NextResponse } from "next/server";

import { createOperatorRouteContext } from "@/lib/booking-assistant/operator-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { queueCoreLogic } from "./core-logic";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const hostname = request.headers.get("host") ?? undefined;
    const ctx = await createOperatorRouteContext(hostname);
    const { operatorService } = readBookingAssistantEnvConfig(hostname);

    const statusParams = (request.nextUrl.searchParams.get("statuses") ?? "")
      .split(",")
      .filter(Boolean);
    const validStatuses = ["call_signal_pending", "ready_to_call_agent", "review_ready"] as const;
    const statuses = statusParams.length > 0
      ? (statusParams.filter((s) => validStatuses.includes(s as never)) as readonly string[])
      : (validStatuses as readonly string[]);

    const result = await queueCoreLogic({
      clients: ctx.clients,
      config: operatorService,
      statuses: statuses as never,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Queue poll failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}
