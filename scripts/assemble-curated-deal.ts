/**
 * Operator-run Curated Deal assembly (Phase 9 / 9A proof artifact).
 *
 * Builds a real CuratedOdysseusDeal candidate from package facts and writes it to
 * `.github/data/odysseus-curated-deals-cache.json` as `needs_review`. The Deal is
 * NEVER publishable from this script: only an explicit operator approval (here via
 * `--approve`, after link health is valid) can promote it to `bookable`, and only
 * when every blocking gate passes.
 *
 * No CB/Odysseus login, booking, hold, or guest-info action occurs. Link
 * construction is the deterministic package-entry fallback unless --booking-url is
 * supplied (e.g. a captured Share link).
 *
 * Usage:
 *   # Assemble the recommended first real Deal (RCL Southern Caribbean, pkg 1619969)
 *   npm run assemble-curated-deal -- --first-real
 *
 *   # Assemble from explicit facts
 *   npm run assemble-curated-deal -- --deal-id deal-x --brief-id brief-y \
 *     --package 1619969 --siid 1049337 --line "Royal Caribbean" \
 *     --ship "Liberty of the Seas" --itinerary "6 Night Southern Caribbean" \
 *     --nights 6 --date 2026-11-08 --port "Fort Lauderdale" \
 *     --ports "Perfect Day at CocoCay,Aruba,Curacao"
 *
 *   # Re-run one stage on an existing Deal
 *   npm run assemble-curated-deal -- --deal-id deal-x --stage copy
 *
 *   # Operator approval (only succeeds when all blocking gates pass)
 *   npm run assemble-curated-deal -- --deal-id deal-x --approve --note "Reviewed link + copy"
 *   npm run assemble-curated-deal -- --deal-id deal-x --reject --note "Link stale"
 *
 *   # Mark link health valid after operator browser validation (gate input)
 *   npm run assemble-curated-deal -- --deal-id deal-x --set-link-valid
 */

import {
  approveCuratedDeal,
  assembleCuratedDeal,
  findCuratedDeal,
  isDealHomepageEligible,
  loadCuratedDealsCache,
  rejectCuratedDeal,
  runDealCampaignStage,
  saveCuratedDealsCache,
  upsertCuratedDeal,
  upsertDealBrief,
  type AssembleCuratedDealInput,
  type CuratedDealCruiseFacts,
  type CuratedOdysseusDeal,
  type DealCampaignStage,
} from "../lib/cb/deals-system";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function list(name: string): string[] {
  const value = arg(name);
  return value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

/** The recommended first real Deal: the live Phase 6 RCL Southern Caribbean match. */
function firstRealInput(): AssembleCuratedDealInput {
  const cruiseFacts: CuratedDealCruiseFacts = {
    title: "6 Night Southern Caribbean Cruise",
    cruiseLine: "Royal Caribbean",
    shipName: "Liberty of the Seas",
    itineraryName: "6 Night Southern Caribbean",
    nights: 6,
    sailDateIso: "2026-11-08",
    departurePort: "Fort Lauderdale",
    portsOfCall: ["Perfect Day at CocoCay", "Aruba", "Curacao"],
    cabinPrices: { currencyCode: "USD" },
    promoSignals: ["Caribbean", "warm-weather escape"],
  };
  return {
    dealId: "deal-rcl-southern-caribbean-1619969",
    briefId: "brief-southern-caribbean-warm-escape",
    packageId: "1619969",
    siid: process.env.CB_AGENT_SIID || "1049337",
    cruiseFacts,
  };
}

function describeDeal(deal: CuratedOdysseusDeal): void {
  console.log(`\nDeal ${deal.id}`);
  console.log(`  status:        ${deal.status}`);
  console.log(`  package:       ${deal.packageId} | siid ${deal.siid}`);
  console.log(`  booking url:   ${deal.bookingUrl}`);
  console.log(`  link health:   ${deal.linkHealth.status}`);
  console.log(`  approval:      ${deal.operatorApproval?.status ?? "none"}`);
  console.log(`  score:         ${deal.scoring.score}`);
  console.log(`  pitch brief:   ${deal.pitchBrief ? `yes (${deal.pitchBrief.generator})` : "MISSING — run --stage pitch"}`);
  if (deal.pitchBrief) {
    console.log(`  primary hook:  ${deal.pitchBrief.primaryHook}`);
    console.log(`  trip summary:  ${deal.pitchBrief.tripSummary}`);
  }
  console.log(`  headline:      ${deal.packaging.headline}`);
  console.log(`  copy red flags:${deal.copyPackage ? ` ${deal.copyPackage.publicCopyRedFlags.length}` : " n/a"}`);
  console.log(`  homepage ok:   ${isDealHomepageEligible(deal)}`);
  if (deal.operatorApproval) {
    console.log("  gates:");
    for (const gate of deal.operatorApproval.gates) {
      console.log(`    [${gate.passed ? "PASS" : "FAIL"}] ${gate.label} — ${gate.detail}`);
    }
  }
}

function explicitInput(): AssembleCuratedDealInput {
  const dealId = arg("deal-id");
  const briefId = arg("brief-id");
  const packageId = arg("package");
  if (!dealId || !briefId || !packageId) {
    throw new Error("Provide --deal-id, --brief-id, and --package (or use --first-real).");
  }
  const cruiseFacts: CuratedDealCruiseFacts = {
    title: arg("title") ?? arg("itinerary") ?? "Curated cruise deal",
    cruiseLine: arg("line") ?? "",
    shipName: arg("ship") ?? "",
    itineraryName: arg("itinerary") ?? arg("title") ?? "",
    nights: arg("nights") ? Number(arg("nights")) : 0,
    sailDateIso: arg("date") ?? "",
    departurePort: arg("port"),
    portsOfCall: list("ports"),
    cabinPrices: { currencyCode: arg("currency") ?? "USD" },
    promoSignals: list("promo-signals"),
  };
  return {
    dealId,
    briefId,
    packageId,
    siid: arg("siid") ?? process.env.CB_AGENT_SIID ?? "1049337",
    cruiseFacts,
    bookingUrl: arg("booking-url"),
  };
}

async function main(): Promise<void> {
  const cache = loadCuratedDealsCache();

  const dealId = arg("deal-id") ?? (flag("first-real") ? firstRealInput().dealId : undefined);
  const existing = dealId ? findCuratedDeal(cache, dealId) : undefined;

  // Stage re-run on an existing Deal.
  const stageName = arg("stage") as Exclude<DealCampaignStage, "approval"> | undefined;
  if (stageName && existing) {
    console.log(`[assemble] Re-running stage "${stageName}" on ${existing.id}...`);
    const updated = await runDealCampaignStage(existing, stageName);
    saveCuratedDealsCache(upsertCuratedDeal(cache, updated));
    describeDeal(updated);
    return;
  }

  // Operator review actions on an existing Deal.
  if (existing && flag("set-link-valid")) {
    const nowIso = new Date().toISOString();
    existing.linkHealth = {
      status: "valid",
      lastVerifiedAtIso: nowIso,
      capturedAtIso: existing.linkHealth.capturedAtIso ?? nowIso,
    };
    saveCuratedDealsCache(upsertCuratedDeal(cache, existing));
    console.log(`[assemble] Marked link health valid for ${existing.id} (operator-verified).`);
    describeDeal(existing);
    return;
  }

  if (existing && flag("approve")) {
    const result = approveCuratedDeal(existing, {
      decisionNote: arg("note"),
      textOnlyLaunchWaived: flag("text-only"),
    });
    saveCuratedDealsCache(upsertCuratedDeal(cache, result.deal));
    if (result.approved) {
      console.log(`[assemble] APPROVED ${existing.id} -> bookable.`);
    } else {
      console.log(`[assemble] NOT approved. Blocking gates still failing:`);
      for (const gate of result.blockingFailures) {
        console.log(`    [FAIL] ${gate.label} — ${gate.detail}`);
      }
    }
    describeDeal(result.deal);
    return;
  }

  if (existing && flag("reject")) {
    const updated = rejectCuratedDeal(existing, { decisionNote: arg("note") });
    saveCuratedDealsCache(upsertCuratedDeal(cache, updated));
    console.log(`[assemble] Rejected ${existing.id}.`);
    describeDeal(updated);
    return;
  }

  // Fresh assembly.
  const input = flag("first-real") ? firstRealInput() : explicitInput();
  console.log(`[assemble] Assembling Curated Deal ${input.dealId} (needs_review)...`);
  const deal = await assembleCuratedDeal(input);

  let next = upsertCuratedDeal(cache, deal);
  // Register a minimal brief if the referenced brief does not exist yet.
  if (!next.briefs.some((b) => b.id === deal.briefId)) {
    next = upsertDealBrief(next, {
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
  saveCuratedDealsCache(next);
  describeDeal(deal);
  console.log(
    "\n[assemble] Wrote needs_review Deal. It will NOT publish until link health is valid AND an operator approves it."
  );
}

main().catch((err) => {
  console.error("[assemble-curated-deal] Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
