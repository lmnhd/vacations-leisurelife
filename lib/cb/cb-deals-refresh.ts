import pexelmachine from "@/app/utils/CommonObjects/pexelmachine";
import { aiAssistBackOff } from "@/app/utils/api";
import {
  CBPickData,
  StoredCbDealsPayload,
  StoredCbHomepageDeal,
} from "@/lib/cb/cb-deal-types";

const HOMEPAGE_COMPONENT_ID = "cbDestinationPicksTiles";

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
  const seenDestinations = new Set<string>();
  const result: CBPickData[] = [];

  for (const pick of picks) {
    const destinationKey = cleanLabel(pick.destination, "Destination:")
      .split(" - ")[0]
      .trim();

    if (seenDestinations.has(destinationKey)) {
      continue;
    }

    seenDestinations.add(destinationKey);
    result.push(pick);
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
        detailsLink: `/destinationdeal/${pick.id}`,
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

export async function buildStoredCbDealsPayload(
  picks: CBPickData[]
): Promise<StoredCbDealsPayload> {
  const homepageDeals = await buildHomepageDealsFromPicks(picks);

  return {
    version: 1,
    generatedAtIso: new Date().toISOString(),
    source: "cruisebrothers_live_refresh",
    picks,
    homepageDeals,
  };
}