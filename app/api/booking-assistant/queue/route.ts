import { NextRequest, NextResponse } from "next/server";

import { createOperatorRouteContext } from "@/lib/booking-assistant/operator-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { queueCoreLogic } from "./core-logic";

export const dynamic = "force-dynamic";

/**
 * Short read-through cache so overlapping polls — multiple tabs, a refresh
 * during an in-flight request, or a future second operator — collapse onto one
 * set of DynamoDB queries. Kept well under the poll interval so the queue still
 * reflects operator actions promptly.
 *
 * BOOKING_QUEUE_CACHE_TTL_MS overrides the window (default 3s; "0" disables).
 */
const CACHE_TTL_MS = Number(process.env.BOOKING_QUEUE_CACHE_TTL_MS ?? "3000");
let queueCache: { at: number; key: string; payload: unknown } | undefined;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const hostname = request.headers.get("host") ?? undefined;
    const ctx = await createOperatorRouteContext(hostname);
    const { operatorService } = readBookingAssistantEnvConfig(hostname);

    const statusParams = (request.nextUrl.searchParams.get("statuses") ?? "")
      .split(",")
      .filter(Boolean);
    const validStatuses = [
      "call_signal_pending",
      "calling_now",
      "ready_to_call_agent",
      "review_ready",
      "human_requested",
      "agent_claimed",
      "agent_processing",
      "reconciliation_review",
    ] as const;
    const statuses = statusParams.length > 0
      ? (statusParams.filter((s) => validStatuses.includes(s as never)) as readonly string[])
      : (validStatuses as readonly string[]);

    const cacheKey = `${hostname ?? ""}|${statuses.join(",")}`;
    if (
      CACHE_TTL_MS > 0 &&
      queueCache &&
      queueCache.key === cacheKey &&
      Date.now() - queueCache.at <= CACHE_TTL_MS
    ) {
      return NextResponse.json({ success: true, result: queueCache.payload });
    }

    const result = await queueCoreLogic({
      clients: ctx.clients,
      config: operatorService,
      statuses: statuses as never,
    });

    if (CACHE_TTL_MS > 0) {
      queueCache = { at: Date.now(), key: cacheKey, payload: result };
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Queue poll failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}
