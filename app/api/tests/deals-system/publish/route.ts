/**
 * Deal Publish route (Deal Workflow Step 4 — Publish).
 *
 * POST { action: "publish", manifestId, adCopyId }
 *   → loads the resolved manifest + its ad copy
 *   → assembles a CuratedOdysseusDeal via assembleCuratedDealFromManifest
 *   → saves to the curated deals cache
 *   → returns the assembled deal + approval gates
 *
 * POST { action: "approve", dealId, textOnlyLaunchWaived?, decisionNote? }
 *   → loads the deal from curated cache
 *   → runs approveCuratedDeal
 *   → saves + returns approved deal
 *
 * POST { action: "set_link_valid", dealId }
 *   → marks the deal's link health as valid (operator browser verified)
 *
 * POST { action: "set_expiration", dealId, expiresOnIso }
 *   → sets or clears the deal's public visibility cutoff (expiresOnIso: "" clears it)
 *
 * Safety: never books/holds. Approval only succeeds when all blocking gates pass.
 */

import { NextResponse } from "next/server";

import {
  approveCuratedDeal,
  assembleCuratedDealFromManifest,
  evaluateApprovalGates,
  getCuratedDeal,
  getDealMetaAdSynthesis,
  listDealFunnelSyntheses,
  listDealTripManifests,
  loadDealAdCopyCache,
  upsertCuratedDealRecord,
} from "@/lib/cb/deals-system";
import type { CuratedOdysseusDeal } from "@/lib/cb/deals-system";
import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  action?: unknown;
  manifestId?: unknown;
  adCopyId?: unknown;
  dealId?: unknown;
  textOnlyLaunchWaived?: unknown;
  decisionNote?: unknown;
  expiresOnIso?: unknown;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function ok(deal: CuratedOdysseusDeal, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, deal, ...extra });
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * After mutating a deal's gate-relevant state (link health, expiration), re-derive
 * the approval gates so the operator-facing gate list, the persisted
 * `operatorApproval.gates`, and the deal's own fields all agree. This is NOT an
 * approval decision, so status/decision metadata is preserved — only the gate
 * snapshot is refreshed.
 */
function withRefreshedGates(deal: CuratedOdysseusDeal): CuratedOdysseusDeal {
  const gates = evaluateApprovalGates(deal, {
    textOnlyLaunchWaived: deal.operatorApproval?.textOnlyLaunchWaived,
  });
  return {
    ...deal,
    operatorApproval: {
      dealId: deal.id,
      status: deal.operatorApproval?.status ?? "needs_review",
      updatedAtIso: deal.operatorApproval?.updatedAtIso ?? new Date().toISOString(),
      decidedBy: deal.operatorApproval?.decidedBy ?? "system",
      decisionNote: deal.operatorApproval?.decisionNote,
      textOnlyLaunchWaived: deal.operatorApproval?.textOnlyLaunchWaived ?? false,
      gates,
    },
  };
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

  if (action === "publish" || action === "preview_handoff") {
    const manifestId = str(body.manifestId);
    const adCopyId = str(body.adCopyId);
    if (!manifestId) return bad("manifestId is required.");
    if (!adCopyId) return bad("adCopyId is required.");

    const manifests = await listDealTripManifests();
    const manifest = manifests.find((m) => m.id === manifestId);
    if (!manifest) return bad(`No manifest found with id "${manifestId}".`, 404);

    if (!manifest.resolvedPackage) {
      return bad(
        `Manifest "${manifestId}" has no resolvedPackage. Resolve it in Step 2 · Trip Manifestation first.`,
        409
      );
    }

    const adCopyCache = loadDealAdCopyCache();
    const adCopy = adCopyCache.adCopies.find((a) => a.id === adCopyId);
    if (!adCopy) return bad(`No ad copy found with id "${adCopyId}".`, 404);

    const unifiedManifestId = `unified-${manifest.id}`;
    if (adCopy.sourceUnifiedManifestId !== unifiedManifestId) {
      return bad(
        `Ad copy ${adCopyId} was built for manifest ${adCopy.sourceUnifiedManifestId}, not ${unifiedManifestId}.`,
        409
      );
    }

    try {
      const dealId = manifest.resolvedPackage.packageId;
      const matchingFunnels = (await listDealFunnelSyntheses()).filter(
        (synthesis) =>
          synthesis.dealId === dealId && synthesis.sourceAdCopyId === adCopy.id
      );
      if (matchingFunnels.length !== 1) {
        return bad(
          matchingFunnels.length === 0
            ? `No exact funnel is attached to ad copy ${adCopy.id}. Finish the funnel before handoff.`
            : `Found ${matchingFunnels.length} funnels attached to ad copy ${adCopy.id}. Resolve the duplicate before handoff.`,
          409
        );
      }

      const funnelSynthesis = matchingFunnels[0];
      const metaAdSynthesis = await getDealMetaAdSynthesis(funnelSynthesis.id);
      if (!metaAdSynthesis) {
        return bad(
          `No Meta synthesis is attached to funnel ${funnelSynthesis.id}. Finish Step 9 before handoff.`,
          409
        );
      }
      const existingDeal = await getCuratedDeal(dealId);
      const deal = assembleCuratedDealFromManifest({
        manifest,
        adCopy,
        existingDeal: existingDeal ?? undefined,
        funnelSynthesis,
        metaAdSynthesis,
      });
      const selectedVariantIndex = adCopy.selectedVariantIndex ?? 0;
      const handoff = {
        saved: action === "publish",
        selectedVariantIndex,
        selectedVariantLabel:
          adCopy.variants[selectedVariantIndex]?.variantLabel ?? adCopy.variants[0]?.variantLabel,
        sourceAdCopyId: adCopy.id,
        sourceFunnelSynthesisId: funnelSynthesis.id,
        sourceMetaAdSynthesisId: metaAdSynthesis.id,
        preservedValidLink: existingDeal?.linkHealth.status === "valid",
        preservedOperatorVisibility: Boolean(existingDeal?.operatorVisibility),
      };
      if (action === "publish") await upsertCuratedDealRecord(deal);
      return ok(deal, { gates: deal.operatorApproval?.gates ?? [], handoff });
    } catch (error) {
      return bad(error instanceof Error ? error.message : String(error), 500);
    }
  }

  if (action === "approve" || action === "set_link_valid" || action === "set_expiration") {
    const dealId = str(body.dealId);
    if (!dealId) return bad("dealId is required.");

    const existing = await getCuratedDeal(dealId);
    if (!existing) return bad(`No Deal found with id "${dealId}".`, 404);

    if (action === "set_link_valid") {
      const nowIso = new Date().toISOString();
      const updated = withRefreshedGates({
        ...existing,
        linkHealth: {
          status: "valid",
          lastVerifiedAtIso: nowIso,
          capturedAtIso: existing.linkHealth.capturedAtIso ?? nowIso,
        },
      });
      await upsertCuratedDealRecord(updated);
      return ok(updated, { gates: updated.operatorApproval?.gates ?? [] });
    }

    if (action === "set_expiration") {
      const raw = body.expiresOnIso;
      const expiresOnIso = typeof raw === "string" ? raw.trim() : "";

      if (expiresOnIso && Number.isNaN(new Date(expiresOnIso).getTime())) {
        return bad(`"${expiresOnIso}" is not a valid date. Use YYYY-MM-DD or a full ISO timestamp.`);
      }

      const mutated: CuratedOdysseusDeal = { ...existing };
      if (expiresOnIso) {
        mutated.expiresOnIso = expiresOnIso;
      } else {
        delete mutated.expiresOnIso;
      }
      const updated = withRefreshedGates(mutated);
      await upsertCuratedDealRecord(updated);
      return ok(updated, { gates: updated.operatorApproval?.gates ?? [] });
    }

    // action === "approve"
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

  return bad(`Unsupported action: ${action}`);
}
