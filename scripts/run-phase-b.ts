/**
 * Phase B Runner — CB Inventory Confirmation + Retail Link Generation
 *
 * Campaigns now arrive at Phase B already matched (inventory gate runs during discovery).
 * Phase B re-scrapes live CB inventory to confirm the match still holds, then generates
 * the Odysseus retail booking link and writes the final result to DynamoDB.
 *
 * If the live scrape shows the match is gone (inventory sold/expired), the campaign is
 * logged for operator review but left in CB_MATCHED state.
 *
 * Usage:
 *   npx tsx scripts/run-phase-b.ts                           # all CB_MATCHED campaigns
 *   npx tsx scripts/run-phase-b.ts --slug retro-gaming-2026  # single campaign
 *   npx tsx scripts/run-phase-b.ts --slug retro-gaming-2026 --slug houseplant-botanical-caribbean-2026
 */

import { loadEnvConfig } from "@next/env";
import * as fs from "fs";
import * as path from "path";
import {
  scrapeGroupInventory,
  scrapeGroupPersonalLink,
} from "./cb-inventory-scraper";
import {
  rankGroupInventoryCandidates,
  CbInventoryMatch,
} from "../lib/campaigns/cb-inventory-matcher";
import type { CampaignInventoryCandidate } from "../lib/campaigns/types";
import {
  scanMatchedCampaigns,
  getCampaignBlueprint,
  upsertCampaignPricingMatch,
  updateCampaignInventoryMode,
} from "../lib/campaigns/campaign-store";
import { validateBookingLink } from "../lib/campaigns/booking-link-validator";
import { OdysseusEngine } from "../lib/services/odysseus/OdysseusEngine";
import type { CruiseResult } from "../lib/services/odysseus/types";

loadEnvConfig(process.cwd());

// ─── Odysseus retail link generation ─────────────────────────────────────────

function parseSailDateToMmDdYyyy(rawDate: string): string | null {
  const d = new Date(rawDate);
  if (isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function shiftDateByDays(mmDdYyyy: string, days: number): string {
  const [mm, dd, yyyy] = mmDdYyyy.split("/").map(Number);
  const d = new Date(yyyy, mm - 1, dd + days);
  const newMm = String(d.getMonth() + 1).padStart(2, "0");
  const newDd = String(d.getDate()).padStart(2, "0");
  return `${newMm}/${newDd}/${d.getFullYear()}`;
}

function buildOdysseusItinerarySummary(result: CruiseResult): {
  summary: string;
  portsOfCall: string;
} {
  const itinerary = result.itinerary;
  const duration = typeof itinerary?.duration === "number" && itinerary.duration > 0
    ? `${itinerary.duration} nights`
    : "Itinerary duration TBD";
  const departure = itinerary?.departure?.code?.trim() || "";
  const arrival = itinerary?.arrival?.code?.trim() || "";
  const portsOfCall = itinerary?.normalizedPortsOfCall?.trim()
    || itinerary?.portsOfCalls?.trim()
    || "";
  const routeParts = [
    departure ? `Departing ${departure}` : "",
    portsOfCall,
    arrival ? `Arriving ${arrival}` : "",
  ].filter(Boolean);

  return {
    summary: [duration, ...routeParts].filter(Boolean).join(" · "),
    portsOfCall,
  };
}

async function generateOdysseusRetailLink(
  match: CbInventoryMatch,
): Promise<{
  retailLink: string | null;
  itinerarySummary: string | null;
  portsOfCall: string | null;
}> {
  const engine = new OdysseusEngine();
  try {
    await engine.init(true);
    await engine.login();

    const startDate = parseSailDateToMmDdYyyy(match.matchedSailDate);
    const endDate = startDate ? shiftDateByDays(startDate, 30) : undefined;

    const results = await engine.searchCruises({
      passengers: 2,
      guestAges: [35, 35],
      ...(startDate && endDate ? { startDate, endDate } : {}),
    });

    if (results.length === 0) {
      console.log(
        `[run-phase-b] Odysseus returned no results for "${match.matchedShipName}" — skipping retail link.`,
      );
      return { retailLink: null, itinerarySummary: null, portsOfCall: null };
    }

    const itinerarySource = results[0];
    const itinerarySummary = buildOdysseusItinerarySummary(itinerarySource);
    await engine.selectItinerary(0);
    const retailLink = await engine.bypassGuestInfoAndContinue();

    if (!retailLink) {
      console.log(
        `[run-phase-b] Odysseus guest-info bypass failed for "${match.matchedShipName}" — skipping retail link.`,
      );
      return {
        retailLink: null,
        itinerarySummary: itinerarySummary.summary,
        portsOfCall: itinerarySummary.portsOfCall || null,
      };
    }

    console.log(`[run-phase-b] ✅ Odysseus retail link: ${retailLink}`);
    return {
      retailLink,
      itinerarySummary: itinerarySummary.summary,
      portsOfCall: itinerarySummary.portsOfCall || null,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(
      `[run-phase-b] Odysseus retail link generation failed for "${match.matchedShipName}": ${msg}`,
    );
    return { retailLink: null, itinerarySummary: null, portsOfCall: null };
  } finally {
    await engine.close();
  }
}

// ─── CLI argument parsing ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const targetSlugs = args.reduce<string[]>(
  (collected: string[], value: string, index: number) => {
    if (value === "--slug") {
      const slug = args[index + 1];
      if (slug) {
        collected.push(slug);
      }
    }
    return collected;
  },
  [],
);

// ─── Main ────────────────────────────────────────────────────────────────────

async function runPhaseB(): Promise<void> {
  console.log(
    "\n─── Phase B: CB Inventory Confirmation + Retail Link Generation ───\n",
  );

  // 1. Scrape live CB group inventory (opens Playwright → requires saved session)
  console.log(
    "[run-phase-b] Scraping live CB view_groups for match confirmation...",
  );
  const inventory = await scrapeGroupInventory();
  console.log(`[run-phase-b] ${inventory.length} inventory items scraped.\n`);

  if (inventory.length === 0) {
    console.warn(
      "[run-phase-b] No inventory items found. Ensure CB session is valid.",
    );
    return;
  }

  // 2. Get campaigns to process (only CB_MATCHED campaigns — matching was done during discovery)
  let campaigns = await scanMatchedCampaigns();

  if (targetSlugs.length > 0) {
    const requestedCampaigns = await Promise.all(
      targetSlugs.map((slug: string) => getCampaignBlueprint(slug)),
    );
    const missingSlugs = targetSlugs.filter(
      (slug: string, index: number) => !requestedCampaigns[index],
    );

    if (missingSlugs.length > 0) {
      console.error(
        `[run-phase-b] Campaign(s) not found: ${missingSlugs.join(", ")}`,
      );
      process.exitCode = 1;
      return;
    }

    campaigns = requestedCampaigns.filter((campaign: any) => campaign !== null);
  }

  console.log(
    `[run-phase-b] Confirming ${campaigns.length} pre-matched campaign(s)...\n`,
  );

  // 3. Confirm match against live inventory + validate links + write Odysseus retail link
  const results: Array<{
    slug: string;
    status: "CONFIRMED" | "BACKUP_PROMOTED" | "MATCH_EXPIRED" | "INVENTORY_FAILED";
    detail: string;
  }> = [];

  for (const campaign of campaigns) {
    const candidates = rankGroupInventoryCandidates(campaign, inventory, 3);

    if (candidates.length === 0) {
      console.warn(
        `[run-phase-b] ⚠️ Match EXPIRED for "${campaign.id}" — was matched to "${campaign.matchedShipName ?? "unknown"}" but not found in current live inventory.`,
      );
      results.push({
        slug: campaign.id,
        status: "MATCH_EXPIRED",
        detail: `Previously matched to "${campaign.matchedShipName ?? "unknown"}" — no longer in live CB inventory`,
      });
      continue;
    }

    console.log(
      `[run-phase-b] ${candidates.length} candidate(s) ranked for "${campaign.id}"`,
    );

    // 3a. Scrape personal links and validate each candidate in rank order
    let primaryCandidate: CampaignInventoryCandidate | null = null;
    const validatedCandidates: CampaignInventoryCandidate[] = [];

    for (const candidate of candidates) {
      // Only attempt Tier 1 (same ship/date/port) for auto-promotion
      if (candidate.rank > 0 && candidate.promiseDelta !== "NONE" && candidate.promiseDelta !== "PRICE_ONLY") {
        console.log(
          `[run-phase-b] Skipping rank ${candidate.rank} candidate (promiseDelta=${candidate.promiseDelta}) — requires operator review.`,
        );
        validatedCandidates.push({ ...candidate, healthStatus: "UNVERIFIED" });
        continue;
      }

      console.log(
        `[run-phase-b] Fetching Personal Booking Link for group ${candidate.groupId} (rank ${candidate.rank})...`,
      );
      const personalLink = await scrapeGroupPersonalLink(candidate.groupId!);
      if (!personalLink) {
        console.warn(
          `[run-phase-b] ⚠️ No personal link found for group ${candidate.groupId}.`,
        );
        validatedCandidates.push({ ...candidate, healthStatus: "FAILED", failureReason: "Personal link not found on group page" });
        continue;
      }

      console.log(`[run-phase-b] Validating link for group ${candidate.groupId}...`);
      const validation = await validateBookingLink(personalLink);
      const validated: CampaignInventoryCandidate = {
        ...candidate,
        personalLink,
        healthStatus: validation.status,
        lastCheckedAt: validation.checkedAt,
        failureReason: validation.failureReason,
      };
      validatedCandidates.push(validated);

      if (validation.status === "HEALTHY" && primaryCandidate === null) {
        primaryCandidate = validated;
        console.log(
          `[run-phase-b] ✅ Healthy primary: rank ${candidate.rank}, ${candidate.shipName} (score: ${candidate.matchScore})`,
        );
        break;
      }
    }

    if (!primaryCandidate) {
      console.error(
        `[run-phase-b] ❌ No healthy booking link found for "${campaign.id}". Marking INVENTORY_FAILED_PAUSED.`,
      );
      await updateCampaignInventoryMode(campaign.id, "INVENTORY_FAILED_PAUSED", "FAILED");
      results.push({
        slug: campaign.id,
        status: "INVENTORY_FAILED",
        detail: `All ${validatedCandidates.length} candidate(s) failed validation — operator review required`,
      });
      continue;
    }

    // 3b. Build CbInventoryMatch from the healthy primary candidate
    const confirmation: CbInventoryMatch = {
      cbGroupId: primaryCandidate.groupId!,
      cbPersonalLink: primaryCandidate.personalLink!,
      cbPriceAdvantage: 0,
      rawGroupPrice: primaryCandidate.startingPrice
        ? Math.round(primaryCandidate.startingPrice / 1.15)
        : 0,
      computedStartingPrice: primaryCandidate.startingPrice ?? 0,
      priceSource: primaryCandidate.priceSource,
      matchedShipName: primaryCandidate.shipName,
      matchedSailDate: primaryCandidate.sailDate,
      matchedDeparturePort: primaryCandidate.departurePort,
      matchedNights: primaryCandidate.nights,
      matchScore: primaryCandidate.matchScore,
      odysseusRetailBookingLink: null,
    };

    // 3c. Generate + validate Odysseus retail link, add as an ODYSSEUS_RETAIL candidate
    console.log(
      `[run-phase-b] Generating Odysseus retail link for "${campaign.id}"...`,
    );
    const odysseusResult = await generateOdysseusRetailLink(confirmation);
    confirmation.odysseusRetailBookingLink = odysseusResult.retailLink;
    confirmation.odysseusItinerarySummary = odysseusResult.itinerarySummary ?? undefined;
    confirmation.odysseusPortsOfCall = odysseusResult.portsOfCall ?? undefined;

    if (odysseusResult.retailLink) {
      const retailValidation = await validateBookingLink(odysseusResult.retailLink);
      validatedCandidates.push({
        rank: validatedCandidates.length,
        source: "ODYSSEUS_RETAIL",
        retailLink: odysseusResult.retailLink,
        shipName: primaryCandidate.shipName,
        sailDate: primaryCandidate.sailDate,
        departurePort: primaryCandidate.departurePort,
        nights: primaryCandidate.nights,
        odysseusItinerarySummary: odysseusResult.itinerarySummary ?? undefined,
        odysseusPortsOfCall: odysseusResult.portsOfCall ?? undefined,
        startingPrice: primaryCandidate.startingPrice,
        priceSource: "ODYSSEUS_RETAIL",
        matchScore: 0,
        promiseDelta: "NONE",
        healthStatus: retailValidation.status,
        lastCheckedAt: retailValidation.checkedAt,
        failureReason: retailValidation.failureReason,
      });
    }

    const wasBackupPromoted = primaryCandidate.rank > 0;
    await upsertCampaignPricingMatch(campaign.id, confirmation, {
      inventoryCandidates: validatedCandidates,
      activeBookingMode: wasBackupPromoted ? "GROUP_BACKUP_SWITCHED" : "GROUP_BLOCK_ACTIVE",
      inventoryHealth: "HEALTHY",
      inventoryLastCheckedAt: new Date().toISOString(),
    });

    results.push({
      slug: campaign.id,
      status: wasBackupPromoted ? "BACKUP_PROMOTED" : "CONFIRMED",
      detail: `${confirmation.matchedShipName} — $${confirmation.computedStartingPrice}/pp (score: ${confirmation.matchScore}, rank: ${primaryCandidate.rank})${odysseusResult.retailLink ? " + retail link" : ""}`,
    });
  }

  // 4. Summary
  console.log("\n─── Results ───");
  for (const r of results) {
    const icon = r.status === "CONFIRMED" ? "✅" : "⚠️";
    console.log(`${icon} [${r.status}] ${r.slug}: ${r.detail}`);
  }

  const confirmedCount = results.filter((r) => r.status === "CONFIRMED").length;
  const backupCount = results.filter((r) => r.status === "BACKUP_PROMOTED").length;
  const expiredCount = results.filter((r) => r.status === "MATCH_EXPIRED").length;
  const failedCount = results.filter((r) => r.status === "INVENTORY_FAILED").length;
  console.log(
    `\n[run-phase-b] Done. ${confirmedCount} confirmed, ${backupCount} backup-promoted, ${expiredCount} expired, ${failedCount} failed validation.\n`,
  );

  // Write result file for agent consumption (agents cannot poll localhost, but can read this file)
  const resultPayload = {
    completedAt: new Date().toISOString(),
    summary: { confirmedCount, backupCount, expiredCount, failedCount },
    results,
  };
  const outputDir = path.join(process.cwd(), "scripts", "agent", "output");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "phase-b-result.json");
  fs.writeFileSync(outputPath, JSON.stringify(resultPayload, null, 2), "utf-8");
  console.log(`[run-phase-b] Result written to ${outputPath}`);
}

runPhaseB().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[run-phase-b] Fatal error: ${message}`);
  process.exitCode = 1;
});
