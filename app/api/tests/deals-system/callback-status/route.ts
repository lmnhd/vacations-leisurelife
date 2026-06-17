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

import * as fs from "node:fs";

import { NextResponse } from "next/server";

import { DEALS_CACHE_PATHS, emptyCallbackRequestsCache } from "@/lib/cb/deals-system/caches";
import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";
import type {
  AgentCallbackRequestsCache,
  AgentCallbackStatus,
} from "@/lib/cb/deals-system/callback-request-types";

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

function loadCallbackCache(): AgentCallbackRequestsCache {
  const path = DEALS_CACHE_PATHS.callbackRequests;
  if (!fs.existsSync(path)) return emptyCallbackRequestsCache();
  try {
    return JSON.parse(fs.readFileSync(path, "utf8")) as AgentCallbackRequestsCache;
  } catch {
    return emptyCallbackRequestsCache();
  }
}

function saveCallbackCache(cache: AgentCallbackRequestsCache): void {
  fs.writeFileSync(
    DEALS_CACHE_PATHS.callbackRequests,
    `${JSON.stringify(cache, null, 2)}\n`,
    "utf8"
  );
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

  const cache = loadCallbackCache();
  const index = cache.requests.findIndex((req) => req.id === requestId);
  if (index === -1) {
    return NextResponse.json({ ok: false, error: `No callback request found with id "${requestId}".` }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const existing = cache.requests[index];
  const updated = {
    ...existing,
    status: status as AgentCallbackStatus,
    routing: { ...existing.routing, dashboardQueued: false },
    statusHistory: [
      ...existing.statusHistory,
      { status: status as AgentCallbackStatus, changedAtIso: nowIso, note },
    ],
  };

  cache.requests[index] = updated;
  cache.generatedAtIso = nowIso;
  saveCallbackCache(cache);

  return NextResponse.json({ ok: true, request: updated });
}
