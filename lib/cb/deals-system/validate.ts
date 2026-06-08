/**
 * Lightweight runtime validators for Deals System cache payloads.
 *
 * Dependency-free structural checks (no zod) so they can run in scripts, the
 * Next runtime, and the Phase 1 test alike. Each validator returns the parsed,
 * typed payload or a list of human-readable errors — it does not throw.
 */

import type { CbPromoIntelligenceCache } from "./promo-intelligence-types";
import type { CuratedOdysseusDealsCache, CuratedOdysseusDeal } from "./curated-deal-types";
import type { LinkBrokerCache, LinkBrokerRecord } from "./link-broker-types";
import type { AgentCallbackRequestsCache } from "./callback-request-types";

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function checkBase(
  value: unknown,
  expectedArrayKey: string,
  errors: string[]
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    errors.push("payload is not an object");
    return false;
  }
  if (value.version !== 1) {
    errors.push(`version must be 1, got ${String(value.version)}`);
  }
  if (!isIsoDate(value.generatedAtIso)) {
    errors.push("generatedAtIso must be an ISO date string");
  }
  if (!Array.isArray(value[expectedArrayKey])) {
    errors.push(`${expectedArrayKey} must be an array`);
  }
  return true;
}

export function validatePromoIntelligenceCache(
  value: unknown
): ValidationResult<CbPromoIntelligenceCache> {
  const errors: string[] = [];
  if (!checkBase(value, "records", errors)) {
    return { ok: false, errors };
  }
  const v = value as Record<string, unknown>;
  if (v.sourceUrl !== "https://www.cbagenttools.com/marketing/todaysview/") {
    errors.push("sourceUrl must be the CB Today's View URL");
  }
  if (!isRecord(v.diagnostics)) {
    errors.push("diagnostics must be an object");
  }
  if (Array.isArray(v.records)) {
    v.records.forEach((rec, i) => {
      if (!isRecord(rec)) {
        errors.push(`records[${i}] is not an object`);
        return;
      }
      if (typeof rec.id !== "string" || !rec.id) errors.push(`records[${i}].id missing`);
      if (rec.source !== "cb_agent_tools_todays_view") {
        errors.push(`records[${i}].source must be cb_agent_tools_todays_view`);
      }
      if (typeof rec.title !== "string") errors.push(`records[${i}].title missing`);
      if (!isRecord(rec.extracted)) errors.push(`records[${i}].extracted missing`);
      if (!isRecord(rec.marketingUse)) errors.push(`records[${i}].marketingUse missing`);
    });
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as CbPromoIntelligenceCache, errors }
    : { ok: false, errors };
}

function validateCuratedDeal(deal: unknown, i: number, errors: string[]): void {
  if (!isRecord(deal)) {
    errors.push(`deals[${i}] is not an object`);
    return;
  }
  const d = deal as Partial<CuratedOdysseusDeal>;
  if (typeof d.id !== "string" || !d.id) errors.push(`deals[${i}].id missing`);
  if (!["bookable", "needs_review", "expired"].includes(String(d.status))) {
    errors.push(`deals[${i}].status invalid: ${String(d.status)}`);
  }
  if (d.source !== "odysseus_curated_retail") {
    errors.push(`deals[${i}].source must be odysseus_curated_retail`);
  }
  if (typeof d.packageId !== "string") errors.push(`deals[${i}].packageId missing`);
  if (typeof d.siid !== "string") errors.push(`deals[${i}].siid missing`);
  if (typeof d.bookingUrl !== "string") errors.push(`deals[${i}].bookingUrl missing`);
  if (!isRecord(d.linkHealth)) errors.push(`deals[${i}].linkHealth missing`);

  // Publishing gate (baseline rule 2): a "bookable" deal must carry valid link health.
  if (d.status === "bookable" && isRecord(d.linkHealth) && d.linkHealth.status !== "valid") {
    errors.push(
      `deals[${i}] is "bookable" but linkHealth.status is "${String(
        d.linkHealth.status
      )}" — only valid link health may publish`
    );
  }
}

export function validateCuratedDealsCache(
  value: unknown
): ValidationResult<CuratedOdysseusDealsCache> {
  const errors: string[] = [];
  if (!checkBase(value, "deals", errors)) {
    return { ok: false, errors };
  }
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.briefs)) errors.push("briefs must be an array");
  if (Array.isArray(v.deals)) {
    v.deals.forEach((deal, i) => validateCuratedDeal(deal, i, errors));
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as CuratedOdysseusDealsCache, errors }
    : { ok: false, errors };
}

function validateLinkBrokerRecord(rec: unknown, i: number, errors: string[]): void {
  if (!isRecord(rec)) {
    errors.push(`records[${i}] is not an object`);
    return;
  }
  const r = rec as Partial<LinkBrokerRecord>;
  if (typeof r.id !== "string" || !r.id) errors.push(`records[${i}].id missing`);
  if (typeof r.packageId !== "string") errors.push(`records[${i}].packageId missing`);
  if (typeof r.siid !== "string") errors.push(`records[${i}].siid missing`);
  const classes = ["package_entry", "prepared_details", "captured_clone", "captured_cabin"];
  if (!classes.includes(String(r.linkClass))) {
    errors.push(`records[${i}].linkClass invalid: ${String(r.linkClass)}`);
  }
  if (typeof r.url !== "string") errors.push(`records[${i}].url missing`);
  if (!isRecord(r.health)) errors.push(`records[${i}].health missing`);
  if (!isRecord(r.parameterSummary)) {
    errors.push(`records[${i}].parameterSummary missing`);
  }
  // Portal-generated tokens must never be claimed for a synthesized class.
  const summary = r.parameterSummary;
  if (isRecord(summary)) {
    if (summary.hasCloneBookingToken === true && r.linkClass !== "captured_clone") {
      errors.push(
        `records[${i}] carries a clone booking token but is not captured_clone`
      );
    }
    if (summary.hasBookingReference === true && r.linkClass !== "captured_cabin") {
      errors.push(
        `records[${i}] carries a booking reference but is not captured_cabin`
      );
    }
  }
}

export function validateLinkBrokerCache(
  value: unknown
): ValidationResult<LinkBrokerCache> {
  const errors: string[] = [];
  if (!checkBase(value, "records", errors)) {
    return { ok: false, errors };
  }
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.records)) {
    v.records.forEach((rec, i) => validateLinkBrokerRecord(rec, i, errors));
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as LinkBrokerCache, errors }
    : { ok: false, errors };
}

export function validateCallbackRequestsCache(
  value: unknown
): ValidationResult<AgentCallbackRequestsCache> {
  const errors: string[] = [];
  if (!checkBase(value, "requests", errors)) {
    return { ok: false, errors };
  }
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.requests)) {
    v.requests.forEach((req, i) => {
      if (!isRecord(req)) {
        errors.push(`requests[${i}] is not an object`);
        return;
      }
      if (typeof req.id !== "string" || !req.id) errors.push(`requests[${i}].id missing`);
      if (!["new", "assigned", "contacted", "closed"].includes(String(req.status))) {
        errors.push(`requests[${i}].status invalid: ${String(req.status)}`);
      }
      if (!isRecord(req.visitor)) errors.push(`requests[${i}].visitor missing`);
      if (!isRecord(req.deal)) errors.push(`requests[${i}].deal missing`);
    });
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as AgentCallbackRequestsCache, errors }
    : { ok: false, errors };
}
