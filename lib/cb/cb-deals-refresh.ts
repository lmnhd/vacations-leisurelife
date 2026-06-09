import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import path from "path";

import pexelmachine from "@/app/utils/CommonObjects/pexelmachine";
import { aiAssistBackOff } from "@/app/utils/api";
import {
  CBPickData,
  CbDealsRefreshDiagnostics,
  StoredCbDealsPayload,
  StoredCbDealDetail,
  StoredCbHomepageDeal,
} from "@/lib/cb/cb-deal-types";
import { buildStoredCbDealDetail } from "@/lib/cb/cb-deal-details";

const HOMEPAGE_COMPONENT_ID = "cbDestinationPicksTiles";
const CB_DEALS_CACHE_FILE = path.join(process.cwd(), ".github", "data", "cb-deals-cache.json");

interface CachedPromoDeal {
  title?: string;
  description?: string;
  validUntil?: string;
  category?: string;
  detailUrl?: string;
  primaryBookingLink?: string;
  bookingLinks?: string[];
  sourceUrl?: string;
}

interface CbDealsCacheFile {
  generatedAtIso?: string;
  promos?: CachedPromoDeal[];
}

function normalizeAiResponse(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return fallback;
  }

  const lowered = trimmed.toLowerCase();
  if (
    lowered === "no response found" ||
    lowered === "error" ||
    lowered === "null" ||
    lowered === "undefined"
  ) {
    return fallback;
  }

  return trimmed;
}

function cleanLabel(value: string, prefix: string): string {
  return value.replace(prefix, "").trim();
}

function extractPackageId(url: string | undefined): string | undefined {
  return url?.match(/\/swift\/cruise\/package\/([^/?#]+)/i)?.[1]?.split("--")[0];
}

function hasDynamicBookingLink(url: string | undefined): boolean {
  return Boolean(extractPackageId(url));
}

function normalizeDynamicBookingUrl(url: string): string {
  const packageId = extractPackageId(url);
  if (!packageId) {
    return url;
  }

  const siid =
    process.env.NEXT_PUBLIC_CB_AGENT_SIID ||
    process.env.CB_AGENT_SIID ||
    "1049337";

  return `https://bookings.cbagenttools.com/swift/cruise/package/${packageId}?siid=${siid}&lang=1`;
}

function readCachedPromos(): CachedPromoDeal[] {
  if (!existsSync(CB_DEALS_CACHE_FILE)) {
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(CB_DEALS_CACHE_FILE, "utf8")) as CbDealsCacheFile;
    return Array.isArray(parsed.promos) ? parsed.promos : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[cb-deals-refresh] Failed to read CB deals cache promos: ${message}`);
    return [];
  }
}

function firstNonEmpty(values: Array<string | undefined>, fallback: string): string {
  return values.map((value) => value?.trim()).find(Boolean) ?? fallback;
}

function inferPromoCruiseLine(promo: CachedPromoDeal): string {
  const source = `${promo.title ?? ""} ${promo.description ?? ""}`;
  const knownLines = [
    "Royal Caribbean",
    "Celebrity",
    "Carnival",
    "Norwegian",
    "Princess",
    "Holland America",
    "MSC",
    "Disney",
    "Cunard",
    "Viking",
    "AmaWaterways",
    "Seabourn",
    "Silversea",
    "Oceania",
    "Regent",
    "Windstar",
  ];

  return knownLines.find((line) => new RegExp(line, "i").test(source)) ?? "Cruise Deal";
}

function promoId(promo: CachedPromoDeal, bookingUrl: string): string {
  const source = `${promo.title ?? ""}:${bookingUrl}`;
  return `cbat-promo-${createHash("sha256").update(source).digest("hex").slice(0, 14)}`;
}

function buildBookablePromoPicks(promos: CachedPromoDeal[]): CBPickData[] {
  return promos.flatMap((promo) => {
    const bookingUrl = firstNonEmpty([promo.primaryBookingLink, ...(promo.bookingLinks ?? [])], "");
    if (!hasDynamicBookingLink(bookingUrl)) {
      return [];
    }

    const normalizedBookingUrl = normalizeDynamicBookingUrl(bookingUrl);
    const cruiseLine = inferPromoCruiseLine(promo);
    const title = firstNonEmpty([promo.title], `${cruiseLine} Cruise Special`);
    const description = firstNonEmpty([promo.description], "Cruise Brothers dynamic booking special.");
    const validUntil = firstNonEmpty([promo.validUntil], "Confirm current dates in the CB booking portal");
    const price = description.match(/\$[\d,]+/)?.[0] ?? "See live rates";

    return [{
      id: promoId(promo, normalizedBookingUrl),
      img: "",
      destination: `Destination: ${cruiseLine}`,
      what: `What: ${title}`,
      when: `When: ${validUntil}`,
      price: `Prices: ${price}`,
      elsepay: "",
      go: `Where you go: Confirm itinerary details in the CB booking portal`,
      why: `Why this is a deal: ${title}`,
      other: `Other details: ${description}`,
      destination_url: normalizedBookingUrl,
    }];
  });
}

function getHasOptions(pick: CBPickData): boolean {
  return (
    pick.other.includes("onboard credit") ||
    pick.other.includes("dining") ||
    pick.other.includes("beverage") ||
    pick.other.includes("WIFI")
  );
}

async function formatPorts(ports: string): Promise<string> {
  const response = await aiAssistBackOff(
    "from the following text, which ports are included in this cruise? Make your answer 6 words or less:",
    ports,
    HOMEPAGE_COMPONENT_ID,
    "formatPorts",
    "",
    true
  );

  return normalizeAiResponse(response, "Top cruise ports");
}

async function formatDescription(info: string): Promise<string> {
  const response = await aiAssistBackOff(
    "summarize the following text in 50 characters or less. Do not make reference to the text and exclude phone numbers and call now statements, just summarize trip.",
    info,
    HOMEPAGE_COMPONENT_ID,
    "formatDescription",
    "",
    true
  );

  return normalizeAiResponse(response, "Cruise highlights and benefits");
}

async function formatPrice(info: string): Promise<string> {
  const response = await aiAssistBackOff(
    "tell me the lowest price mentioned in the following text in one word",
    info,
    HOMEPAGE_COMPONENT_ID,
    "formatPrice",
    "",
    true
  );

  return normalizeAiResponse(response, "See rates");
}

function getHomepagePicks(picks: CBPickData[]): CBPickData[] {
  const seenIds = new Set<string>();
  const result: CBPickData[] = [];

  for (const pick of picks) {
    if (seenIds.has(pick.id)) {
      continue;
    }

    seenIds.add(pick.id);
    result.push(pick);

    if (result.length === 6) {
      break;
    }
  }

  return result;
}

export async function buildHomepageDealsFromPicks(
  picks: CBPickData[]
): Promise<StoredCbHomepageDeal[]> {
  const homepagePicks = getHomepagePicks(picks);

  return Promise.all(
    homepagePicks.map(async (pick) => {
      const destination = cleanLabel(pick.destination, "Destination:")
        .split(" - ")[0]
        .trim();
      const hasOptions = getHasOptions(pick);
      const fetchedImages = await pexelmachine(3, `${destination} vacation`);

      const imageSrc = fetchedImages[0]?.srcMedium ?? pick.img;
      const port = await formatPorts(cleanLabel(pick.go, "Where you go:"));
      const description = await formatDescription(cleanLabel(pick.other, "Other details:"));
      const pricePerPerson = await formatPrice(cleanLabel(pick.price, "Prices:"));

      return {
        id: pick.id,
        destination,
        imageSrc,
        alt: pick.destination,
        day: cleanLabel(pick.when, "When:"),
        port,
        header1: destination,
        header2: cleanLabel(pick.what, "What:"),
        description,
        pricePerPerson: `${pricePerPerson}(*starting)`,
        detailsLink: `/deals/${encodeURIComponent(pick.id)}`,
        toolTips: hasOptions
          ? {
              freeDining: pick.other.includes("dining"),
              freeDrinks: pick.other.includes("beverage"),
              freeWifi: pick.other.includes("WIFI"),
              onboardCredits: pick.other.includes("onboard credit"),
            }
          : undefined,
      };
    })
  );
}

export function buildStoredCbDealDetailsFromPicks(
  picks: CBPickData[],
  homepageDeals: StoredCbHomepageDeal[],
  generatedAtIso: string
): StoredCbDealDetail[] {
  return picks.map((pick) => {
    const homepageDeal = homepageDeals.find((deal) => deal.id === pick.id);
    return buildStoredCbDealDetail(pick, {
      imageSrc: homepageDeal?.imageSrc,
      generatedAtIso,
    });
  });
}

function buildRefreshDiagnostics(
  picks: CBPickData[],
  cbAgentToolsPromosFound: number,
  cbAgentToolsBookablePromosFound: number,
  homepageDeals: StoredCbHomepageDeal[],
  allDealDetails: StoredCbDealDetail[],
  generatedAtIso: string
): CbDealsRefreshDiagnostics {
  return {
    picksFound: picks.length,
    cbAgentToolsPromosFound,
    cbAgentToolsBookablePromosFound,
    homepageDealsBuilt: homepageDeals.length,
    detailDealsBuilt: allDealDetails.filter((deal) => deal.status === "bookable").length,
    bookableDeals: allDealDetails.filter((deal) => deal.status === "bookable").length,
    infoOnlyDeals: allDealDetails.filter((deal) => deal.status === "info_only").length,
    needsOperatorReview: allDealDetails.filter((deal) => deal.status === "needs_operator_review").length,
    generatedAtIso,
  };
}

export async function buildStoredCbDealsPayload(
  picks: CBPickData[]
): Promise<StoredCbDealsPayload> {
  const generatedAtIso = new Date().toISOString();
  const cachedPromos = readCachedPromos();
  const promoPicks = buildBookablePromoPicks(cachedPromos);
  const directLinkedPicks = picks.filter((pick) => hasDynamicBookingLink(pick.destination_url));
  const sourceCandidates = [...promoPicks, ...directLinkedPicks];
  const draftHomepageDeals = await buildHomepageDealsFromPicks(sourceCandidates);
  const allDealDetails = sourceCandidates.map((pick) => {
    const homepageDeal = draftHomepageDeals.find((deal) => deal.id === pick.id);
    const isPromoPick = pick.id.startsWith("cbat-promo-");
    return buildStoredCbDealDetail(pick, {
      imageSrc: homepageDeal?.imageSrc,
      generatedAtIso,
      bookingLinkSource: isPromoPick ? "cb_agent_tools_promo" : "cb_pick",
    });
  });
  const publishableDealIds = new Set(
    allDealDetails
      .filter((deal) => deal.status === "bookable" && Boolean(deal.booking.bookingUrl))
      .map((deal) => deal.id)
  );
  const homepageDeals = draftHomepageDeals
    .filter((deal) => publishableDealIds.has(deal.id))
    .map((deal) => {
      const detail = allDealDetails.find((candidate) => candidate.id === deal.id);
      return {
        ...deal,
        status: detail?.status,
        bookingUrl: detail?.booking.bookingUrl,
      };
    });
  const dealDetails = allDealDetails.filter((deal) => publishableDealIds.has(deal.id));

  return {
    version: 2,
    generatedAtIso,
    source: "cruisebrothers_direct_booking_refresh",
    picks: sourceCandidates,
    homepageDeals,
    dealDetails,
    refreshDiagnostics: buildRefreshDiagnostics(
      picks,
      cachedPromos.length,
      promoPicks.length,
      homepageDeals,
      allDealDetails,
      generatedAtIso
    ),
  };
}
