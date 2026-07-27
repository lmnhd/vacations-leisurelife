import { NextRequest, NextResponse } from "next/server";

import { loadOperatorDraftDetail } from "@/lib/booking-assistant/operator-detail";
import { createOperatorRouteContext } from "@/lib/booking-assistant/operator-route-context";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const draftId = request.nextUrl.searchParams.get("draftId") ?? "";
    if (!draftId) {
      return NextResponse.json({ success: false, error: "draftId is required" }, { status: 400 });
    }
    const hostname = request.headers.get("host") ?? undefined;
    const context = await createOperatorRouteContext(hostname);
    const { operatorService } = readBookingAssistantEnvConfig(hostname);
    const result = await loadOperatorDraftDetail(context.clients, operatorService, {
      draftId,
      operatorSessionId: context.operatorSessionId,
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Draft detail failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}
