/**
 * Phase B Runner — CB Inventory Confirmation + Retail Link Generation
 *
 * Campaigns now arrive at Phase B already matched (inventory gate runs during discovery).
 * Phase B re-scrapes live CB inventory to confirm the match still holds, then generates
 * the Odysseus retail booking link and writes the final result to DynamoDB.
 * When the best CB backup would materially change the promise, Phase B can fall back
 * to retail-only multi-booking instead of forcing a bad CB validation path.
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
import { CbGroupInventoryItem } from "../lib/campaigns/cb-inventory-types";
import {
  rankGroupInventoryCandidates,
  CbInventoryMatch,
} from "../lib/campaigns/cb-inventory-matcher";
import type { Campaign, CampaignInventoryCandidate } from "../lib/campaigns/types";
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

function normalizeDateKey(rawDate?: string | null): string {
  const value = rawDate?.trim();
  if (!value) return "";
  // ISO-format strings like "2027-01-08" or "2027-01-08T00:00:00Z" are parsed as
  // UTC midnight by the V8 runtime. In non-UTC timezones (e.g. America/New_York)
  // that shifts the local date back by one day. Force noon UTC so the calendar
  // date is stable regardless of server timezone.
  const normalized = /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10) + "T12:00:00Z"
    : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "";
  const yyyy = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseNightCount(rawValue?: string | null): number | null {
  if (!rawValue) return null;
  const match = rawValue.match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function getCruiseResultStartDate(result: CruiseResult): string {
  return normalizeDateKey(result.packages?.[0]?.startDateTime);
}

function getCruiseResultNightCount(result: CruiseResult): number | null {
  if (typeof result.itinerary?.duration === "number" && result.itinerary.duration > 0) {
    return result.itinerary.duration;
  }
  const packageDuration = result.packages?.[0]?.cruiseDuration;
  return typeof packageDuration === "number" && packageDuration > 0 ? packageDuration : null;
}

// How many days a retail sailing's start may differ from the CB group's listed
// sail date and still be considered the same voyage. CB House-group dates are
// often approximate (and sometimes off by a day from the retail manifest), so an
// exact-day requirement rejects real matches. ±3 days safely brackets the same
// voyage without colliding with the next week's sailing of the same ship.
const SAIL_DATE_TOLERANCE_DAYS = 3;

function daysBetweenDateKeys(a: string, b: string): number | null {
  // Date keys are YYYY-MM-DD (UTC-stable from normalizeDateKey).
  const da = Date.parse(`${a}T12:00:00Z`);
  const db = Date.parse(`${b}T12:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.round(Math.abs(da - db) / (24 * 60 * 60 * 1000));
}

/**
 * Picks the retail sailing that best corresponds to the CB group block.
 *
 * Uses proximity scoring rather than exact-bullseye matching: CB House-group
 * dates are approximate and often carry no night count, so requiring an exact
 * date AND exact nights rejects sailings that are obviously the same voyage
 * (e.g. a Jan-8 group block vs the Jan-9 retail manifest). We instead pick the
 * closest sailing within a date tolerance, preferring a matching night count
 * when one is known, and only reject when nothing is close enough.
 */
function findMatchingOdysseusResult(
  results: CruiseResult[],
  match: CbInventoryMatch,
): { result: CruiseResult; index: number } | null {
  const expectedDate = normalizeDateKey(match.matchedSailDate);
  const expectedNights = parseNightCount(match.matchedNights);
  if (!expectedDate) return null;

  const scored = results
    .map((result, index) => {
      const resultDate = getCruiseResultStartDate(result);
      const resultNights = getCruiseResultNightCount(result);
      const dayGap = resultDate ? daysBetweenDateKeys(expectedDate, resultDate) : null;
      const nightsKnown = expectedNights !== null && resultNights !== null;
      const nightsMatch = nightsKnown ? expectedNights === resultNights : false;

      // Lower is better. Date proximity dominates; a known-nights mismatch adds a
      // soft penalty so a same-day exact-nights sailing beats a same-day wrong-nights one.
      const datePenalty = dayGap === null ? Number.POSITIVE_INFINITY : dayGap;
      const nightsPenalty = nightsKnown && !nightsMatch ? 0.5 : 0;

      return { result, index, dayGap, nightsMatch, resultDate, resultNights, cost: datePenalty + nightsPenalty };
    })
    .filter((s) => s.dayGap !== null && s.dayGap <= SAIL_DATE_TOLERANCE_DAYS)
    .sort((a, b) => a.cost - b.cost);

  const winner = scored[0];
  if (!winner) return null;

  console.log(
    `[run-phase-b] Retail match: ${match.matchedShipName} expected ${expectedDate}` +
    `${expectedNights !== null ? ` (${expectedNights}n)` : ''} -> ${winner.resultDate}` +
    `${winner.resultNights !== null ? ` (${winner.resultNights}n)` : ''}` +
    ` [${winner.dayGap}d gap${winner.nightsMatch ? ', nights match' : expectedNights !== null ? ', nights differ' : ''}]`,
  );

  return { result: winner.result, index: winner.index };
}

function normalizeComparableText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function campaignBookingLinkMatchesCandidate(
  campaign: Campaign,
  candidate: CampaignInventoryCandidate,
): boolean {
  const storedShipName = normalizeComparableText(campaign.matchedShipName);
  const candidateShipName = normalizeComparableText(candidate.shipName);
  const storedSailDate = normalizeComparableText(campaign.matchedSailDate);
  const candidateSailDate = normalizeComparableText(candidate.sailDate);

  return storedShipName.length > 0 &&
    candidateShipName.length > 0 &&
    storedSailDate.length > 0 &&
    candidateSailDate.length > 0 &&
    storedShipName === candidateShipName &&
    storedSailDate === candidateSailDate;
}

function isCampaignRetired(campaign: Campaign): boolean {
  return !!campaign.discoveryIteration?.retiredAt ||
    campaign.discoveryIteration?.recommendedNextAction === "retire";
}

function buildOdysseusItinerarySummary(result: CruiseResult): {
  summary: string;
  portsOfCall: string;
} {
  const itinerary = result.itinerary;
  const duration = typeof itinerary?.duration === "number" && itinerary.duration > 0
    ? `${itinerary.duration} nights`
    : "Itinerary duration TBD";
  const departureCode = itinerary?.departure?.code?.trim() || "";
  const arrivalCode = itinerary?.arrival?.code?.trim() || "";

  // Prefer normalizedPortsOfCall from the booking engine; fall back to raw codes
  const rawPortsOfCall = itinerary?.normalizedPortsOfCall?.trim()
    || itinerary?.portsOfCalls?.trim()
    || "";

  // Resolve port codes to human-readable names so the stored strings are
  // guest-ready and don't require view-layer decoding.
  const { formatPortsOfCall: fmtPorts, formatDepartureLeg: fmtLeg } =
    require("@/lib/campaigns/landing/port-codes") as typeof import("@/lib/campaigns/landing/port-codes");

  const resolvedPortsOfCall = rawPortsOfCall ? (fmtPorts(rawPortsOfCall) ?? rawPortsOfCall) : "";
  const routeParts = [
    departureCode ? `Departing ${fmtLeg(departureCode)}` : "",
    resolvedPortsOfCall,
    arrivalCode ? `Arriving ${fmtLeg(arrivalCode)}` : "",
  ].filter(Boolean);

  return {
    summary: [duration, ...routeParts].filter(Boolean).join(" · "),
    portsOfCall: resolvedPortsOfCall,
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

    // Center the search window on the actual sail date (±7 days) so the API
    // returns the target sailing; findMatchingOdysseusResult then pins the exact
    // date/nights. (The search now calls the nitroapi directly, so no UI state to
    // reset — but the search is only as good as the date window we hand it.)
    const sailDateMmDdYyyy = parseSailDateToMmDdYyyy(match.matchedSailDate);
    const startDate = sailDateMmDdYyyy ? shiftDateByDays(sailDateMmDdYyyy, -7) : undefined;
    const endDate = sailDateMmDdYyyy ? shiftDateByDays(sailDateMmDdYyyy, 7) : undefined;

    // Royal Caribbean vendor ID = 8. Scope the search by vendor when known so
    // we don't bleed across cruise lines or regions. The vendor string comes from
    // the CB inventory cache (e.g. "Royal Caribbean International" or "Royal Caribbean …").
    const ROYAL_CARIBBEAN_VENDOR_ID = 8;
    const isRcl = /royal caribbean/i.test(match.vendor ?? "");
    console.log(
      '[run-phase-b] Odysseus retail search: vendor="' + (match.vendor ?? "unknown") + '" isRcl=' + isRcl +
      ' sailDate=' + (sailDateMmDdYyyy ?? "none") + ' window=' + (startDate ?? "none") + ' to ' + (endDate ?? "none"),
    );

    const results = await engine.searchCruises({
      passengers: 2,
      guestAges: [35, 35],
      ...(isRcl ? { vendorId: ROYAL_CARIBBEAN_VENDOR_ID } : {}),
      ...(startDate && endDate ? { startDate, endDate } : {}),
    });

    if (results.length === 0) {
      console.log(
        `[run-phase-b] Odysseus returned no results for "${match.matchedShipName}" — skipping retail link.`,
      );
      return { retailLink: null, itinerarySummary: null, portsOfCall: null };
    }

    const selectedItinerary = findMatchingOdysseusResult(results, match);
    if (!selectedItinerary) {
      const resultsSummary = results.map((r, i) => {
        const date = getCruiseResultStartDate(r);
        const nights = getCruiseResultNightCount(r);
        return '  [' + i + '] ' + r.name + ' (' + r.code + ') ' + date + ' ' + (nights ?? '?') + 'n';
      }).join('\n');
      console.warn(
        '[run-phase-b] Odysseus returned ' + results.length + ' result(s) for “' + match.matchedShipName + '”, but none matched' +
        ' date “' + match.matchedSailDate + '” and nights “' + (match.matchedNights ?? 'unknown') + '” - skipping retail link.\n' +
        '  Expected: ' + normalizeDateKey(match.matchedSailDate) + ' | ' + (match.matchedNights ?? '?') + 'n\n' +
        '  Got:\n' + resultsSummary,
      );
      return { retailLink: null, itinerarySummary: null, portsOfCall: null };
    }

    const itinerarySummary = buildOdysseusItinerarySummary(selectedItinerary.result);
    const selected = await engine.selectItineraryByResult(selectedItinerary.result);
    if (!selected) {
      console.warn(
        `[run-phase-b] Could not navigate to the matched package for "${match.matchedShipName}" — skipping retail link.`,
      );
      return {
        retailLink: null,
        itinerarySummary: itinerarySummary.summary,
        portsOfCall: itinerarySummary.portsOfCall || null,
      };
    }
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

const CB_DEALS_CACHE_FILE = path.join(process.cwd(), ".github", "data", "cb-deals-cache.json");

const args = process.argv.slice(2);
const useCache = args.includes("--use-cache");
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

// ─── Cache-based inventory loader ───────────────────────────────────────────

function loadInventoryFromCache(): CbGroupInventoryItem[] {
  if (!fs.existsSync(CB_DEALS_CACHE_FILE)) {
    throw new Error(
      `[run-phase-b] CB deals cache not found at ${CB_DEALS_CACHE_FILE}. Run 'npm run scrape-cb-deals' first.`,
    );
  }

  const raw = fs.readFileSync(CB_DEALS_CACHE_FILE, "utf-8");
  const cache = JSON.parse(raw) as {
    generatedAtIso: string;
    priceAdvantages: Array<{
      groupId: string;
      shipName: string;
      vendor: string;
      itinerary: string;
      departurePort: string;
      nights: string;
      sailDate: string;
      startingPrice: string;
      priceAdvantage: string;
      detailUrl?: string;
      personalLink?: string;
      sourceUrl: string;
    }>;
  };

  const ageHours = Math.round(
    (Date.now() - new Date(cache.generatedAtIso).getTime()) / 3600000,
  );
  console.log(
    `[run-phase-b] Using cached inventory from ${cache.generatedAtIso} (${ageHours}h ago) — ${cache.priceAdvantages.length} items.`,
  );

  const parsePrice = (raw: string): number => {
    const digits = raw.replace(/[^0-9.]/g, "");
    return digits ? parseFloat(digits) : 0;
  };

  return cache.priceAdvantages
    .filter((item) => item.groupId && item.shipName)
    .map((item) => ({
      groupId: item.groupId,
      shipName: item.shipName,
      vendor: item.vendor ?? "",
      itinerary: item.itinerary ?? "",
      departurePort: item.departurePort ?? "",
      nights: item.nights ?? "",
      sailDate: item.sailDate ?? "",
      startingPrice: item.startingPrice ?? "",
      startingPriceNumber: parsePrice(item.startingPrice ?? ""),
      priceAdvantage: item.priceAdvantage ?? "",
      priceAdvantageNumber: parsePrice(item.priceAdvantage ?? ""),
      detailUrl: item.detailUrl,
      personalLink: item.personalLink,
      sourceUrl: item.sourceUrl ?? "",
    }));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function runPhaseB(): Promise<void> {
  console.log(
    "\n─── Phase B: CB Inventory Confirmation + Retail Link Generation ───\n",
  );

  // 1. Load CB group inventory — from cache (fast) or live scrape (fresh)
  let inventory: CbGroupInventoryItem[];
  if (useCache) {
    inventory = loadInventoryFromCache();
  } else {
    console.log(
      "[run-phase-b] Scraping live CB view_groups for match confirmation...",
    );
    inventory = await scrapeGroupInventory();
    console.log(`[run-phase-b] ${inventory.length} inventory items scraped.\n`);
  }

  if (inventory.length === 0) {
    console.warn(
      "[run-phase-b] No inventory items found. Ensure CB session is valid.",
    );
    return;
  }

  // 2. Get campaigns to process (only CB_MATCHED campaigns — matching was done during discovery)
  let campaigns = (await scanMatchedCampaigns()).filter((campaign) => !isCampaignRetired(campaign));

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

    const foundCampaigns = requestedCampaigns.filter((c): c is Campaign => c !== null);
    const retiredCampaigns = foundCampaigns.filter(isCampaignRetired);
    if (retiredCampaigns.length > 0) {
      console.warn(
        `[run-phase-b] Skipping retired campaign(s): ${retiredCampaigns.map((campaign) => campaign.id).join(", ")}`,
      );
    }

    campaigns = foundCampaigns.filter((campaign) => !isCampaignRetired(campaign));
    if (campaigns.length === 0) {
      console.warn("[run-phase-b] No active requested campaigns to confirm.");
      return;
    }
  }

  console.log(
    `[run-phase-b] Confirming ${campaigns.length} pre-matched campaign(s)...\n`,
  );

  // 3. Confirm match against live inventory + validate links + write Odysseus retail link
  const results: Array<{
    slug: string;
    status:
      | "CONFIRMED"
      | "BACKUP_PROMOTED"
      | "RETAIL_MULTI_BOOKING"
      | "MATCH_EXPIRED"
      | "INVENTORY_FAILED";
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

      // When using cache, reuse any previously-scraped personal link for this group.
      // Check two sources in order:
      //   1. inventoryCandidates — set by a prior successful Phase B run
      //   2. campaign-level cbagenttoolsBookingLink — set by upsertCampaignPricingMatch
      let personalLink: string | null = null;
      if (candidate.personalLink) {
        personalLink = candidate.personalLink;
        console.log(
          `[run-phase-b] Reusing inventory-row personal link for group ${candidate.groupId}: ${personalLink}`,
        );
      }
      if (!personalLink && useCache) {
        const storedInCandidate = campaign.inventoryCandidates?.find(
          (c) => c.groupId?.trim() === candidate.groupId?.trim() && c.personalLink,
        );
        if (storedInCandidate?.personalLink) {
          personalLink = storedInCandidate.personalLink;
          console.log(
            `[run-phase-b] Reusing candidate-stored link for group ${candidate.groupId}: ${personalLink}`,
          );
        } else if (
          campaign.cbagenttoolsGroupId?.trim() === candidate.groupId?.trim() &&
          campaign.cbagenttoolsBookingLink
        ) {
          personalLink = campaign.cbagenttoolsBookingLink;
          console.log(
            `[run-phase-b] Reusing campaign-level booking link for group ${candidate.groupId} (cache mode): ${personalLink}`,
          );
        }
      }
      if (!personalLink) {
        console.log(
          `[run-phase-b] Fetching Personal Booking Link for group ${candidate.groupId} (rank ${candidate.rank})...`,
        );
        const scrapeResult = await scrapeGroupPersonalLink(candidate.groupId!);
        if (scrapeResult.isHouseGroup) {
          // House groups have no personal link — CB owns the inventory block.
          // Skip remaining candidates and go straight to Odysseus retail fallback.
          console.warn(
            `[run-phase-b] Group ${candidate.groupId} is a House group. Skipping candidate loop — routing to Odysseus retail path.`,
          );
          validatedCandidates.push({ ...candidate, healthStatus: "FAILED", failureReason: "House group — no personal link available" });
          break;
        }
        personalLink = scrapeResult.link;
      }
      // Fallback: CB's detail group ID can differ from the stored booking package ID.
      if (!personalLink && campaign.cbagenttoolsBookingLink && campaignBookingLinkMatchesCandidate(campaign, candidate)) {
        personalLink = campaign.cbagenttoolsBookingLink;
        console.warn(
          `[run-phase-b] ⚠️ Live scrape failed — using stored campaign booking link for ${candidate.shipName} on ${candidate.sailDate}: ${personalLink}`,
        );
      }
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
      const retailFallbackSource = candidates[0];
      if (retailFallbackSource) {
        console.warn(
          `[run-phase-b] No healthy CB booking link found for "${campaign.id}". Attempting retail fallback from rank ${retailFallbackSource.rank} (${retailFallbackSource.shipName}).`,
        );

        const retailConfirmation: CbInventoryMatch = {
          cbGroupId: retailFallbackSource.groupId!,
          cbPersonalLink: "",
          cbPriceAdvantage: 0,
          rawGroupPrice: retailFallbackSource.startingPrice
            ? Math.round(retailFallbackSource.startingPrice / 1.15)
            : 0,
          computedStartingPrice: retailFallbackSource.startingPrice ?? 0,
          priceSource: "ODYSSEUS_RETAIL",
          matchedShipName: retailFallbackSource.shipName,
          matchedSailDate: retailFallbackSource.sailDate,
          matchedDeparturePort: retailFallbackSource.departurePort,
          matchedNights: retailFallbackSource.nights,
          vendor: retailFallbackSource.vendor || undefined,
          matchScore: retailFallbackSource.matchScore,
          odysseusRetailBookingLink: null,
        };

        const odysseusResult = await generateOdysseusRetailLink(retailConfirmation);
        retailConfirmation.odysseusRetailBookingLink = odysseusResult.retailLink;
        retailConfirmation.odysseusItinerarySummary = odysseusResult.itinerarySummary ?? undefined;
        retailConfirmation.odysseusPortsOfCall = odysseusResult.portsOfCall ?? undefined;
        if (odysseusResult.retailLink) {
          const retailValidation = await validateBookingLink(odysseusResult.retailLink);
          if (retailValidation.status === "HEALTHY") {
            const retailCandidate: CampaignInventoryCandidate = {
              rank: validatedCandidates.length,
              source: "ODYSSEUS_RETAIL",
              retailLink: odysseusResult.retailLink,
              shipName: retailFallbackSource.shipName,
              sailDate: retailFallbackSource.sailDate,
              departurePort: retailFallbackSource.departurePort,
              nights: retailFallbackSource.nights,
              odysseusItinerarySummary: odysseusResult.itinerarySummary ?? undefined,
              odysseusPortsOfCall: odysseusResult.portsOfCall ?? undefined,
              startingPrice: retailFallbackSource.startingPrice,
              priceSource: "ODYSSEUS_RETAIL",
              matchScore: retailFallbackSource.matchScore,
              promiseDelta: retailFallbackSource.promiseDelta,
              healthStatus: retailValidation.status,
              lastCheckedAt: retailValidation.checkedAt,
              failureReason: retailValidation.failureReason,
            };

            validatedCandidates.push(retailCandidate);

            await upsertCampaignPricingMatch(campaign.id, retailConfirmation, {
              inventoryCandidates: validatedCandidates,
              activeBookingMode: "RETAIL_MULTI_BOOKING",
              inventoryHealth: "HEALTHY",
              inventoryLastCheckedAt: new Date().toISOString(),
            });

            results.push({
              slug: campaign.id,
              status: "RETAIL_MULTI_BOOKING",
              detail: `${retailConfirmation.matchedShipName} — retail fallback + retail link`,
            });
            continue;
          }
        }
      }

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
  const retailCount = results.filter((r) => r.status === "RETAIL_MULTI_BOOKING").length;
  const expiredCount = results.filter((r) => r.status === "MATCH_EXPIRED").length;
  const failedCount = results.filter((r) => r.status === "INVENTORY_FAILED").length;
  console.log(
    `\n[run-phase-b] Done. ${confirmedCount} confirmed, ${backupCount} backup-promoted, ${retailCount} retail-fallback, ${expiredCount} expired, ${failedCount} failed validation.\n`,
  );

  // Write result file for agent consumption (agents cannot poll localhost, but can read this file)
  const resultPayload = {
    completedAt: new Date().toISOString(),
    summary: { confirmedCount, backupCount, retailCount, expiredCount, failedCount },
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
