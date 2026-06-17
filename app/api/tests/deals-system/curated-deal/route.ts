/**
 * Deals Campaign Workbench staged-action route (Phase 9A).
 *
 * Operates directly on the curated deals cache via the deals-system library so
 * the operator can run each stage independently from `/tests/deals-system`:
 *
 *   action "assemble"        -> build a needs_review Deal from cruise facts
 *   action "stage"           -> regenerate one stage (research/targeting/copy/ad/media)
 *   action "set_link_valid"  -> record operator-verified link health
 *   action "approve"         -> promote to bookable IF all blocking gates pass
 *   action "reject"          -> return to needs_review and record the note
 *   action "pin"             -> sort the Deal first on the homepage (Phase 14)
 *   action "unpin"           -> clear the pin
 *   action "hide"            -> hide an otherwise-eligible Deal from the homepage
 *   action "unhide"          -> clear the hide flag
 *   action "refresh_link"    -> mark link health stale, pending operator re-verification
 *   action "request_capture" -> flag the Deal for an operator CBAT/Odysseus capture
 *
 * Safety: this never books, holds, or submits guest info. It never publishes a
 * Deal on its own — the assemble/stage actions always leave the Deal
 * needs_review, and approve only succeeds when every blocking gate passes.
 * refresh_link and request_capture only flag work for the operator; CBAT/Odysseus
 * browser operations remain operator-controlled.
 */

import { NextResponse } from "next/server";

import {
  approveCuratedDeal,
  assembleCuratedDeal,
  getCuratedDeal,
  getDealBrief,
  getPromoRecordsByIds,
  rejectCuratedDeal,
  runDealCampaignStage,
  upsertCuratedDealRecord,
  upsertDealBriefRecord,
  type AssembleCuratedDealInput,
  type CuratedDealCruiseFacts,
  type CuratedOdysseusDeal,
  type DealCampaignStage,
} from "@/lib/cb/deals-system";
import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  action?: unknown;
  dealId?: unknown;
  briefId?: unknown;
  packageId?: unknown;
  siid?: unknown;
  cruiseFacts?: unknown;
  bookingUrl?: unknown;
  stage?: unknown;
  promoRecordIds?: unknown;
  decisionNote?: unknown;
  textOnlyLaunchWaived?: unknown;
}

const STAGE_NAMES: DealCampaignStage[] = [
  "research",
  "targeting",
  "pitch",
  "copy",
  "ad_structure",
  "media",
  "approval",
];

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseCruiseFacts(value: unknown): CuratedDealCruiseFacts | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const facts: CuratedDealCruiseFacts = {
    title: str(v.title) ?? str(v.itineraryName) ?? "Curated cruise deal",
    cruiseLine: str(v.cruiseLine) ?? "",
    shipName: str(v.shipName) ?? "",
    itineraryName: str(v.itineraryName) ?? str(v.title) ?? "",
    nights: Number(v.nights) || 0,
    sailDateIso: str(v.sailDateIso) ?? "",
    departurePort: str(v.departurePort),
    portsOfCall: Array.isArray(v.portsOfCall)
      ? v.portsOfCall.map((p) => String(p)).filter(Boolean)
      : [],
    cabinPrices: { currencyCode: str(v.currencyCode) ?? "USD" },
    promoSignals: Array.isArray(v.promoSignals)
      ? v.promoSignals.map((p) => String(p)).filter(Boolean)
      : [],
  };
  return facts;
}

function ok(deal: CuratedOdysseusDeal, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, deal, ...extra });
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const blocked = blockInProduction();
  if (blocked) return blocked;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return bad("Invalid JSON body.");
  }

  const action = str(body.action);
  if (!action) return bad("action is required.");

  const promoRecordIds = Array.isArray(body.promoRecordIds)
    ? body.promoRecordIds.map((id) => String(id))
    : [];

  try {
    if (action === "assemble") {
      const dealId = str(body.dealId);
      const briefId = str(body.briefId);
      const packageId = str(body.packageId);
      const cruiseFacts = parseCruiseFacts(body.cruiseFacts);
      if (!dealId || !briefId || !packageId || !cruiseFacts) {
        return bad("assemble requires dealId, briefId, packageId, and cruiseFacts.");
      }
      const input: AssembleCuratedDealInput = {
        dealId,
        briefId,
        packageId,
        siid: str(body.siid) ?? process.env.CB_AGENT_SIID ?? "1049337",
        cruiseFacts,
        bookingUrl: str(body.bookingUrl),
        promoRecords: promoRecordIds.length > 0 ? await getPromoRecordsByIds(promoRecordIds) : [],
      };
      const deal = await assembleCuratedDeal(input);
      await upsertCuratedDealRecord(deal);
      const existingBrief = await getDealBrief(deal.briefId);
      if (!existingBrief) {
        await upsertDealBriefRecord({
          id: deal.briefId,
          title: deal.cruiseFacts.title,
          destinationKeywords: deal.cruiseFacts.portsOfCall,
          cruiseLine: deal.cruiseFacts.cruiseLine,
          shipName: deal.cruiseFacts.shipName,
          departurePort: deal.cruiseFacts.departurePort,
          minNights: deal.cruiseFacts.nights,
          maxNights: deal.cruiseFacts.nights,
          marketingAngle: deal.packaging.headline,
          audienceFit: deal.packaging.bestFor,
        });
      }
      return ok(deal);
    }

    const dealId = str(body.dealId);
    if (!dealId) return bad("dealId is required for this action.");
    const existing = await getCuratedDeal(dealId);
    if (!existing) return bad(`No Deal found with id "${dealId}".`, 404);

    if (action === "stage") {
      const stage = str(body.stage);
      if (!stage || !STAGE_NAMES.includes(stage as DealCampaignStage) || stage === "approval") {
        return bad("stage must be one of research, targeting, copy, ad_structure, media.");
      }
      const updated = await runDealCampaignStage(
        existing,
        stage as Exclude<DealCampaignStage, "approval">,
        { promoRecords: promoRecordIds.length > 0 ? await getPromoRecordsByIds(promoRecordIds) : [] }
      );
      await upsertCuratedDealRecord(updated);
      return ok(updated);
    }

    if (action === "set_link_valid") {
      const nowIso = new Date().toISOString();
      const updated: CuratedOdysseusDeal = {
        ...existing,
        linkHealth: {
          status: "valid",
          lastVerifiedAtIso: nowIso,
          capturedAtIso: existing.linkHealth.capturedAtIso ?? nowIso,
        },
      };
      await upsertCuratedDealRecord(updated);
      return ok(updated);
    }

    if (action === "approve") {
      const result = approveCuratedDeal(existing, {
        decisionNote: str(body.decisionNote),
        textOnlyLaunchWaived: body.textOnlyLaunchWaived === true,
      });
      await upsertCuratedDealRecord(result.deal);
      return ok(result.deal, {
        approved: result.approved,
        blockingFailures: result.blockingFailures,
      });
    }

    if (action === "reject") {
      const updated = rejectCuratedDeal(existing, { decisionNote: str(body.decisionNote) });
      await upsertCuratedDealRecord(updated);
      return ok(updated);
    }

    if (action === "pin" || action === "unpin") {
      const updated: CuratedOdysseusDeal = {
        ...existing,
        operatorVisibility: {
          ...existing.operatorVisibility,
          pinned: action === "pin",
        },
      };
      await upsertCuratedDealRecord(updated);
      return ok(updated);
    }

    if (action === "hide" || action === "unhide") {
      const updated: CuratedOdysseusDeal = {
        ...existing,
        operatorVisibility: {
          ...existing.operatorVisibility,
          hidden: action === "hide",
        },
      };
      await upsertCuratedDealRecord(updated);
      return ok(updated);
    }

    if (action === "refresh_link") {
      const updated: CuratedOdysseusDeal = {
        ...existing,
        linkHealth: {
          ...existing.linkHealth,
          status: "stale",
          failureReason: str(body.decisionNote) ?? "Operator requested link re-verification.",
        },
      };
      await upsertCuratedDealRecord(updated);
      return ok(updated);
    }

    if (action === "request_capture") {
      const note =
        str(body.decisionNote) ?? "Operator capture requested via production dashboard.";
      const updated: CuratedOdysseusDeal = {
        ...existing,
        agentOnlyNotes: [...(existing.agentOnlyNotes ?? []), `[capture requested] ${note}`],
      };
      await upsertCuratedDealRecord(updated);
      return ok(updated);
    }

    return bad(`Unsupported action: ${action}`);
  } catch (error) {
    return bad(error instanceof Error ? error.message : String(error), 500);
  }
}
