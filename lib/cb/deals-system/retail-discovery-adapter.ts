import type {
  GroupDiscoveryRetailSource,
  RetailDiscoveryBrief,
} from "./research-types";

export const GROUP_ONLY_TERMS = [
  "group",
  "groups",
  "threshold",
  "waitlist",
  "tour conductor",
  "tc credit",
  "meetup",
  "meetups",
  "hosted",
  "private event",
  "exclusive event",
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function unique(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
}

function stripGroupLanguage(value: string): string {
  let result = value;
  for (const term of GROUP_ONLY_TERMS) {
    const pattern = new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}\\b`, "gi");
    result = result.replace(pattern, "").replace(/\s{2,}/g, " ").trim();
  }
  return result;
}

function inferAudienceLabel(source: GroupDiscoveryRetailSource): string {
  const haystack = `${source.name} ${source.researchRationale ?? ""}`.toLowerCase();
  if (haystack.includes("sketch") || haystack.includes("plein")) {
    return "Plein-air sketchers and landscape-minded creative travelers";
  }
  if (haystack.includes("photo")) {
    return "Photography-minded scenic travelers";
  }
  if (haystack.includes("food") || haystack.includes("wine")) {
    return "Food-and-wine travelers";
  }
  if (haystack.includes("wellness") || haystack.includes("reset")) {
    return "Wellness and reset travelers";
  }
  return stripGroupLanguage(source.name);
}

function inferDestinations(source: GroupDiscoveryRetailSource): string[] {
  const values = [
    source.targetDestination,
    ...source.cruiseNativeMoments,
    source.researchRationale,
  ].filter((value): value is string => Boolean(value));
  const text = values.join(" ").toLowerCase();
  const destinations: string[] = [];
  if (text.includes("alaska") || text.includes("glacier") || text.includes("fjord")) {
    destinations.push("Alaska", "Inside Passage", "glaciers");
  }
  if (text.includes("europe") || text.includes("mediterranean")) destinations.push("Europe");
  if (text.includes("bahamas")) destinations.push("Bahamas");
  if (text.includes("caribbean")) destinations.push("Caribbean");
  return unique(destinations.length > 0 ? destinations : [source.targetDestination ?? "scenic itinerary"]);
}

function inferFeatureKeywords(source: GroupDiscoveryRetailSource): string[] {
  const text = [
    source.researchRationale,
    ...source.audienceSignals,
    ...source.cruiseNativeMoments,
    ...(source.aestheticHooks ?? []),
  ].join(" ").toLowerCase();

  const features: string[] = [];
  if (text.includes("sketch") || text.includes("plein")) {
    features.push("panoramic lounges", "open decks", "scenic viewing", "quiet observation spaces");
  }
  if (text.includes("photo") || text.includes("camera")) {
    features.push("golden-hour viewpoints", "deck rail vistas", "scenic cruising");
  }
  if (text.includes("wellness")) features.push("spa", "quiet adults-focused spaces", "thermal suite");
  if (text.includes("food") || text.includes("wine")) features.push("specialty dining", "culinary programming");
  return unique(features.length > 0 ? features : ["scenic decks", "destination-rich itinerary"]);
}

function inferKeywords(source: GroupDiscoveryRetailSource): string[] {
  const base = [
    source.name,
    ...(source.targetableKeywords ?? []),
    ...(source.aestheticHooks ?? []),
    ...source.audienceSignals,
  ];
  const text = base.join(" ").toLowerCase();
  const keywords: string[] = [];

  if (text.includes("sketch")) keywords.push("urban sketching", "plein air", "travel sketchbook", "watercolor travel");
  if (text.includes("landscape")) keywords.push("landscape drawing", "nature journaling", "scenic travel");
  if (text.includes("alaska")) keywords.push("Alaska landscapes", "glacier sketching", "Inside Passage");
  if (text.includes("photo")) keywords.push("travel photography", "landscape photography");

  return unique([...keywords, ...(source.targetableKeywords ?? [])]).slice(0, 14);
}

export function adaptGroupDiscoveryToRetailBrief(
  source: GroupDiscoveryRetailSource
): RetailDiscoveryBrief {
  const audienceLabel = inferAudienceLabel(source);
  const destinations = inferDestinations(source);
  const shipFeatures = inferFeatureKeywords(source);
  const nicheKeywords = inferKeywords(source);
  const cleanMoments = unique(source.cruiseNativeMoments.map(stripGroupLanguage));
  const visualDirection = unique([
    ...cleanMoments,
    ...(source.aestheticHooks ?? []).map(stripGroupLanguage),
    ...destinations.map((destination) => `${destination} visual texture`),
  ]);
  const id = `retail-${slugify(source.id || source.name)}`;

  return {
    id,
    source: "group_discovery_retail_adapter",
    sourceResearchId: source.id,
    retailAngleTitle: `The perfect cruise for ${audienceLabel.toLowerCase()}`,
    audience: {
      label: audienceLabel,
      communitySignals: unique(source.audienceSignals.map(stripGroupLanguage)),
      emotionalDrivers: unique([
        "a trip that turns the destination into creative material",
        "a vacation that feels personally relevant instead of generic",
        "low-friction access to scenery, light, and place",
      ]),
      spendSignals: unique(
        source.audienceSignals
          .filter((signal) => /gear|course|workshop|supplies|premium|spend|travel/i.test(signal))
          .map(stripGroupLanguage)
      ),
    },
    cruiseFit: {
      idealDestinations: destinations,
      idealShipFeatures: shipFeatures,
      idealTripLength: "7 to 10 nights when scenic pacing matters; shorter if the destination hook is unusually strong",
      idealSeasonality: source.targetDates ?? "seasonal window aligned to scenery, weather, and daylight",
    },
    odysseusSearchHints: {
      destinations,
      dateWindows: source.targetDates ? [source.targetDates] : undefined,
      minNights: 4,
      maxNights: 10,
    },
    retailPositioning: {
      primaryHook: `A cruise selected around ${audienceLabel.toLowerCase()}, not a generic cruise sale.`,
      whyThisIsNotAGroup:
        "This is a retail Deal angle for immediate booking; it borrows niche research but does not require cohort formation, minimum cabins, planned onboard programming, or interest collection.",
      quickSaleCTA: "Get the prepared booking link while this sailing is available.",
      visualDirection,
    },
    targetingSeeds: {
      nicheKeywords,
      trendKeywords: unique([
        "creative travel",
        "experience-first travel",
        "destination immersion",
        ...destinations,
      ]),
      negativeKeywords: ["free cruise", "cruise job", "crew job", "cargo ship"],
      metaInterestSeeds: unique([...nicheKeywords, ...destinations]).slice(0, 16),
      googleSearchThemes: unique(
        nicheKeywords.map((keyword) => `${keyword} travel`).concat(destinations.map((destination) => `${destination} cruise`))
      ).slice(0, 16),
    },
    risks: [
      "Do not imply an organized group, instructor, workshop, or onboard program unless one is separately created.",
      "Keep the pitch quick-sale oriented and grounded in the actual package itinerary.",
      "Validate that the selected sailing's itinerary and season support the creative angle.",
    ],
  };
}
