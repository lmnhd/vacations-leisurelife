import { NextResponse } from "next/server";

import { getAgentAvailability } from "@/lib/booking-assistant/agent-availability";
import { createGuestRouteContext } from "@/lib/booking-assistant/guest-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const ctx = await createGuestRouteContext();
  if (!ctx) {
    return NextResponse.json({ success: false, error: "Booking Assistant is not enabled" }, { status: 503 });
  }
  try {
    const { operatorService } = readBookingAssistantEnvConfig(undefined);
    const availability = await getAgentAvailability(ctx.clients.dynamo, operatorService);
    return NextResponse.json({
      success: true,
      result: {
        mode: availability.mode,
        effectiveUntilIso: availability.effectiveUntilIso,
        version: availability.version,
      },
    });
  } catch {
    return NextResponse.json({
      success: true,
      result: { mode: "no_agents", version: -1 },
    });
  }
}
