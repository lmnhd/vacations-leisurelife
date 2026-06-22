/**
 * POST /api/tests/deals-system/callback-status (Phase 13)
 *
 * Operator-only route used by the workbench to move an AgentCallbackRequest
 * through its status lifecycle (new -> assigned -> contacted -> closed) and
 * to record an operator note. Appends to `statusHistory` and updates
 * `routing.dashboardQueued` to false once a request has been acted on.
 *
 * Input:  { requestId: string, status: AgentCallbackStatus, note?: string }
 * Output: { ok: true, request: AgentCallbackRequest } | { ok: false, error: string }
 */

import { NextResponse } from "next/server";

import { updateCallbackRequestStatus } from "@/lib/cb/deals-system/callback-request-store";
import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";
import type { AgentCallbackStatus } from "@/lib/cb/deals-system/callback-request-types";
import { appendDealEvent } from "@/lib/cb/deals-system/deal-events-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  requestId?: unknown;
  status?: unknown;
  note?: unknown;
}

const VALID_STATUSES: AgentCallbackStatus[] = ["new", "assigned", "contacted", "closed"];

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export async function POST(request: Request) {
  const blocked = blockInProduction();
  if (blocked) return blocked;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const requestId = str(body.requestId);
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "requestId is required." }, { status: 400 });
  }

  const status = str(body.status);
  if (!status || !VALID_STATUSES.includes(status as AgentCallbackStatus)) {
    return NextResponse.json(
      { ok: false, error: `status must be one of ${VALID_STATUSES.join(", ")}.` },
      { status: 400 }
    );
  }

  const note = str(body.note);

  const updated = await updateCallbackRequestStatus({
    requestId,
    status: status as AgentCallbackStatus,
    note,
  });
  if (!updated) {
    return NextResponse.json({ ok: false, error: `No callback request found with id "${requestId}".` }, { status: 404 });
  }

  // Mirror operator status changes onto the deal's activity timeline.
  if (status === "contacted" || status === "closed") {
    await appendDealEvent({
      dealId: updated.deal.dealId,
      eventType: status === "contacted" ? "callback_contacted" : "callback_closed",
      attribution: {},
      email: updated.visitor.email,
      metadata: { requestId },
    });
  }

  return NextResponse.json({ ok: true, request: updated });
}
