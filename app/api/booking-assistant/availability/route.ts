import { NextRequest, NextResponse } from "next/server";

import {
  getAgentAvailability,
  setAgentAvailability,
  type AgentAvailabilityMode,
} from "@/lib/booking-assistant/agent-availability";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { createOperatorRouteContext } from "@/lib/booking-assistant/operator-route-context";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const hostname = request.headers.get("host") ?? undefined;
    const ctx = await createOperatorRouteContext(hostname);
    const { operatorService } = readBookingAssistantEnvConfig(hostname);
    const result = await getAgentAvailability(ctx.clients.dynamo, operatorService);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Availability lookup failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const hostname = request.headers.get("host") ?? undefined;
    const ctx = await createOperatorRouteContext(hostname);
    const { operatorService } = readBookingAssistantEnvConfig(hostname);
    const body = await request.json().catch(() => ({})) as {
      mode?: AgentAvailabilityMode;
      effectiveUntilIso?: string;
      expectedVersion?: number;
    };
    if (
      (body.mode !== "available" && body.mode !== "no_agents") ||
      typeof body.expectedVersion !== "number"
    ) {
      return NextResponse.json({ success: false, error: "mode and expectedVersion are required" }, { status: 400 });
    }
    const result = await setAgentAvailability(ctx.clients.dynamo, operatorService, {
      mode: body.mode,
      effectiveUntilIso: body.effectiveUntilIso,
      expectedVersion: body.expectedVersion,
      changedByOperatorId: ctx.operatorSessionId,
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Availability update failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}
