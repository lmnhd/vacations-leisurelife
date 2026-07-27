import { NextRequest, NextResponse } from "next/server";

import { performOperatorDraftAction, type OperatorDraftAction } from "@/lib/booking-assistant/operator-actions";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { createOperatorRouteContext } from "@/lib/booking-assistant/operator-route-context";

export const dynamic = "force-dynamic";

const ACTIONS = ["call_guest", "email_guest", "request_field", "correct_field"] as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({})) as {
      draftId?: string;
      action?: string;
      fieldId?: string;
      value?: string;
      expectedVersion?: number;
    };
    const selectedAction = ACTIONS.find((action) => action === body.action);
    if (!body.draftId || !selectedAction) {
      return NextResponse.json({ success: false, error: "draftId and a valid action are required" }, { status: 400 });
    }
    let command: OperatorDraftAction;
    if (selectedAction === "request_field") {
      if (!body.fieldId) {
        return NextResponse.json({ success: false, error: "fieldId is required" }, { status: 400 });
      }
      command = { action: "request_field", fieldId: body.fieldId };
    } else if (selectedAction === "correct_field") {
      if (!body.fieldId || typeof body.value !== "string" || typeof body.expectedVersion !== "number") {
        return NextResponse.json(
          { success: false, error: "fieldId, value, and expectedVersion are required" },
          { status: 400 }
        );
      }
      command = {
        action: "correct_field",
        fieldId: body.fieldId,
        value: body.value,
        expectedVersion: body.expectedVersion,
      };
    } else {
      command = { action: selectedAction };
    }
    const hostname = request.headers.get("host") ?? undefined;
    const context = await createOperatorRouteContext(hostname);
    const { operatorService } = readBookingAssistantEnvConfig(hostname);
    const result = await performOperatorDraftAction(context.clients, operatorService, {
      draftId: body.draftId,
      operatorSessionId: context.operatorSessionId,
      command,
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Operator action failed";
    return NextResponse.json({ success: false, error: detail }, { status: 500 });
  }
}
