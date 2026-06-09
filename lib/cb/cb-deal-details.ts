import { createHash } from "crypto";

import {
  CBPickData,
  StoredCbDealDetail,
  StoredCbDealLinkSource,
  StoredCbDealStatus,
} from "@/lib/cb/cb-deal-types";
import { getStoredCbDeals } from "@/lib/cb/cb-deals-store";

const DEFAULT_AGENT_SIID = "1049337";
const FALLBACK_DEAL_IMAGE =
  "https://images.pexels.com/photos/163236/luxury-yacht-boat-speed-water-163236.jpeg";

function cleanLabel(value: string | undefined, prefix: string): string {
  return String(value ?? "").replace(prefix, "").trim();
}

function splitReadableList(value: string): string[] {
  return value
    .replace(/\s+-\s+/g, ", ")
    .replace(/\s+\|\s+/g, ", ")
    .split(/,|;|\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function sentence(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.endsWith(".") || trimmed.endsWith("!") || trimmed.endsWith("?")
    ? trimmed
    : `${trimmed}.`;
}

function firstPrice(value: string): string | undefined {
  return cleanLabel(value, "Prices:").match(/\$[\d,]+/)?.[0];
}

function inferIncludedPerks(pick: CBPickData): string[] {
  const source = `${pick.other} ${pick.why}`.toLowerCase();
  const perks: string[] = [];

  if (source.includes("onboard credit")) perks.push("Onboard credit");
  if (source.includes("dining")) perks.push("Dining offer");
  if (source.includes("beverage") || source.includes("drink")) perks.push("Beverage offer");
  if (source.includes("wifi") || source.includes("wi-fi")) perks.push("Wi-Fi offer");

  return perks;
}

function sourceHash(pick: CBPickData): string {
  return createHash("sha256").update(JSON.stringify(pick)).digest("hex").slice(0, 16);
}

function extractPackageId(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  const match = url.match(/\/swift\/cruise\/package\/([^/?#]+)/i);
  return match?.[1]?.split("--")[0];
}

function normalizeBooking(url: string | undefined): {
  status: StoredCbDealStatus;
  packageId?: string;
  bookingUrl?: string;
  siid?: string;
  linkSource: StoredCbDealLinkSource;
  matchScore?: number;
  matchedShipName?: string;
  matchedVendor?: string;
  matchedSailDate?: string;
  matchedNights?: string;
  matchedItinerary?: string;
} {
  const packageId = extractPackageId(url);

  if (!packageId) {
    return {
      status: "info_only",
      linkSource: "none",
    };
  }

  const siid =
    process.env.NEXT_PUBLIC_CB_AGENT_SIID ||
    process.env.CB_AGENT_SIID ||
    DEFAULT_AGENT_SIID;

  return {
    status: "bookable",
    packageId,
    siid,
    bookingUrl: `https://bookings.cbagenttools.com/swift/cruise/package/${packageId}?siid=${siid}&lang=1`,
    linkSource: "cb_pick",
  };
}

export function buildStoredCbDealDetail(
  pick: CBPickData,
  options: {
    imageSrc?: string;
    generatedAtIso?: string;
    bookingLinkSource?: StoredCbDealLinkSource;
  } = {}
): StoredCbDealDetail {
  const destination = cleanLabel(pick.destination, "Destination:").split(" - ")[0].trim();
  const shipSummary = cleanLabel(pick.what, "What:");
  const sailLabel = cleanLabel(pick.when, "When:");
  const portsText = cleanLabel(pick.go, "Where you go:");
  const priceLabel = firstPrice(pick.price) ?? (cleanLabel(pick.price, "Prices:") || "See current rates");
  const whyText = cleanLabel(pick.why, "Why this is a deal:");
  const otherText = cleanLabel(pick.other, "Other details:");
  const perks = inferIncludedPerks(pick);
  const booking = normalizeBooking(pick.destination_url);
  if (booking.bookingUrl && options.bookingLinkSource) {
    booking.linkSource = options.bookingLinkSource;
  }
  const generatedAtIso = options.generatedAtIso ?? new Date().toISOString();

  const dealHighlights = [
    whyText,
    otherText,
    perks.length > 0 ? `Includes ${perks.join(", ").toLowerCase()}.` : "",
  ].filter(Boolean).map((item) => sentence(item, ""));

  const itineraryHighlights = splitReadableList(portsText);
  const heroImageSrc = options.imageSrc || pick.img || FALLBACK_DEAL_IMAGE;

  return {
    id: pick.id,
    status: booking.status,
    sourcePick: pick,
    display: {
      title: `${destination} Cruise Special`,
      subtitle: shipSummary || "Cruise Brothers featured sailing",
      heroImageSrc,
      heroImageAlt: `${destination} cruise special`,
      shortSummary: sentence(
        otherText || whyText,
        `A featured ${destination} cruise special with current Cruise Brothers pricing.`
      ),
      longSummary: sentence(
        `${shipSummary || "This sailing"} gives travelers a direct path to ${destination}${
          portsText ? ` with itinerary highlights including ${portsText}` : ""
        }`,
        `This featured sailing is packaged for travelers who want a clear, bookable ${destination} cruise option.`
      ),
      dealHighlights: dealHighlights.length > 0 ? dealHighlights : ["Current Cruise Brothers featured deal."],
      itineraryHighlights,
      destinationHighlights: itineraryHighlights.length > 0 ? itineraryHighlights : [destination],
      bestFor: ["Travelers ready to compare current cruise specials", "Guests who want a direct CB booking path"],
      urgencyCopy: "Cruise pricing and availability can change quickly. Use the booking link to confirm live rates.",
    },
    cruiseFacts: {
      destination,
      shipName: shipSummary,
      nights: sailLabel,
      sailDateLabel: sailLabel,
      priceFromLabel: priceLabel,
      includedPerks: perks,
    },
    booking: {
      packageId: booking.packageId,
      siid: booking.siid,
      bookingUrl: booking.bookingUrl,
      linkSource: booking.linkSource,
      matchScore: booking.matchScore,
      matchedShipName: booking.matchedShipName,
      matchedVendor: booking.matchedVendor,
      matchedSailDate: booking.matchedSailDate,
      matchedNights: booking.matchedNights,
      matchedItinerary: booking.matchedItinerary,
    },
    enrichment: {
      model: "deterministic_v1",
      generatedAtIso,
      sourceInputsHash: sourceHash(pick),
    },
  };
}

export async function getStoredCbDealDetailById(id: string): Promise<StoredCbDealDetail | null> {
  const decodedId = decodeURIComponent(id);
  const storedDeals = await getStoredCbDeals();

  if (!storedDeals) {
    return null;
  }

  const detail = storedDeals.dealDetails?.find((deal) => deal.id === decodedId);
  if (detail?.booking.bookingUrl && detail.status === "bookable") {
    return detail;
  }

  return null;
}
