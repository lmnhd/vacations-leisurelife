export type InferredAudienceMarketCode = "UK" | "US" | "CA" | "LATAM";

export interface PromoHandoffPromoRecord {
  id: string;
  title: string;
  vendor: string;
  applicableMarkets: string[];
}

export interface PromoHandoffAssessmentInput {
  cruiseLine?: string;
  departurePort?: string;
  campaignAngle?: string;
  targetAudience?: string;
  targetingKeywords?: string[];
  selectedPromos: PromoHandoffPromoRecord[];
  cruiseLinePromoCount?: number;
}

export interface PromoHandoffAssessment {
  status:
    | "no_promo_selected"
    | "promo_attached"
    | "promo_market_unknown"
    | "promo_market_mismatch";
  inferredAudienceMarket: InferredAudienceMarketCode | null;
  inferredAudienceEvidence: string[];
  selectedPromoIds: string[];
  selectedPromoTitles: string[];
  matchingCruiseLinePromoCount: number;
  warnings: string[];
  blockingIssues: string[];
}

function isAsciiLetterOrDigit(char: string): boolean {
  const code = char.toLowerCase().charCodeAt(0);
  return (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
}

function normalizeLooseText(value: string): string {
  let out = "";
  let lastWasSpace = false;
  for (const rawChar of value.toLowerCase()) {
    if (isAsciiLetterOrDigit(rawChar)) {
      out += rawChar;
      lastWasSpace = false;
      continue;
    }
    if (!lastWasSpace) {
      out += " ";
      lastWasSpace = true;
    }
  }
  return out.trim();
}

function containsAnyPhrase(haystack: string, phrases: string[]): string | null {
  for (const phrase of phrases) {
    if (haystack.includes(phrase)) return phrase;
  }
  return null;
}

function detectMarketFromText(text: string): {
  code: InferredAudienceMarketCode | null;
  evidence: string[];
} {
  const normalized = normalizeLooseText(text);
  const evidence: string[] = [];

  const ukHit = containsAnyPhrase(normalized, [
    " united kingdom ",
    " uk ",
    " england ",
    " britain ",
    " great britain ",
    " southampton ",
    " london ",
    " manchester ",
    " liverpool ",
    " scotland ",
    " wales ",
  ].map((value) => value.trim()));
  if (ukHit) {
    evidence.push(`Matched "${ukHit}" in targeting text.`);
    return { code: "UK", evidence };
  }

  const usHit = containsAnyPhrase(normalized, [
    " united states ",
    " usa ",
    " us ",
    " florida ",
    " texas ",
    " california ",
    " new york ",
    " miami ",
    " fort lauderdale ",
    " new jersey ",
  ].map((value) => value.trim()));
  if (usHit) {
    evidence.push(`Matched "${usHit}" in targeting text.`);
    return { code: "US", evidence };
  }

  const caHit = containsAnyPhrase(normalized, [
    " canada ",
    " toronto ",
    " vancouver ",
    " montreal ",
    " alberta ",
    " ontario ",
  ].map((value) => value.trim()));
  if (caHit) {
    evidence.push(`Matched "${caHit}" in targeting text.`);
    return { code: "CA", evidence };
  }

  const latamHit = containsAnyPhrase(normalized, [
    " latin america ",
    " mexico ",
    " brazil ",
    " argentina ",
    " colombia ",
    " chile ",
    " peru ",
  ].map((value) => value.trim()));
  if (latamHit) {
    evidence.push(`Matched "${latamHit}" in targeting text.`);
    return { code: "LATAM", evidence };
  }

  return { code: null, evidence };
}

function normalizeMarket(value: string): InferredAudienceMarketCode | null {
  const normalized = normalizeLooseText(value);
  if (
    normalized === "uk" ||
    normalized === "united kingdom" ||
    normalized === "great britain" ||
    normalized === "britain" ||
    normalized === "england"
  ) {
    return "UK";
  }
  if (
    normalized === "us" ||
    normalized === "usa" ||
    normalized === "united states" ||
    normalized === "united states of america"
  ) {
    return "US";
  }
  if (normalized === "canada") {
    return "CA";
  }
  if (normalized === "latin america" || normalized === "latam") {
    return "LATAM";
  }
  return null;
}

function formatMarket(code: InferredAudienceMarketCode | null): string {
  if (code === "UK") return "United Kingdom";
  if (code === "US") return "United States";
  if (code === "CA") return "Canada";
  if (code === "LATAM") return "Latin America";
  return "Unknown market";
}

function uniqueValues<T extends string>(values: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function assessPromoHandoff(
  input: PromoHandoffAssessmentInput
): PromoHandoffAssessment {
  const textPool = [
    input.cruiseLine ?? "",
    input.departurePort ?? "",
    input.campaignAngle ?? "",
    input.targetAudience ?? "",
    ...(input.targetingKeywords ?? []),
  ]
    .filter(Boolean)
    .join(" ");
  const detected = detectMarketFromText(textPool);
  const warnings: string[] = [];
  const blockingIssues: string[] = [];
  const selectedPromoTitles = input.selectedPromos.map((promo) => `${promo.vendor}: ${promo.title}`);

  if (input.selectedPromos.length === 0) {
    if ((input.cruiseLinePromoCount ?? 0) > 0) {
      warnings.push(
        "No promo is attached. Continuing will generate a no-promo manifest even though matching cruise-line promos exist in the workbench."
      );
    } else {
      warnings.push("No promo is attached. Continuing will generate a no-promo manifest.");
    }
    return {
      status: "no_promo_selected",
      inferredAudienceMarket: detected.code,
      inferredAudienceEvidence: detected.evidence,
      selectedPromoIds: [],
      selectedPromoTitles: [],
      matchingCruiseLinePromoCount: input.cruiseLinePromoCount ?? 0,
      warnings,
      blockingIssues,
    };
  }

  let foundUnknownMarket = false;
  let foundMismatch = false;
  for (const promo of input.selectedPromos) {
    const normalizedMarkets = uniqueValues(
      promo.applicableMarkets
        .map(normalizeMarket)
        .filter((value): value is InferredAudienceMarketCode => Boolean(value))
    );
    if (normalizedMarkets.length === 0) {
      foundUnknownMarket = true;
      warnings.push(
        `${promo.vendor}: ${promo.title} does not list a normalized applicable market in promo intelligence. Verify eligibility manually before using it in public copy.`
      );
      continue;
    }
    if (detected.code && !normalizedMarkets.includes(detected.code)) {
      foundMismatch = true;
      blockingIssues.push(
        `${promo.vendor}: ${promo.title} lists ${normalizedMarkets.map((code) => formatMarket(code)).join(", ")}, but the current angle reads as ${formatMarket(detected.code)}.`
      );
    }
  }

  if (foundMismatch) {
    return {
      status: "promo_market_mismatch",
      inferredAudienceMarket: detected.code,
      inferredAudienceEvidence: detected.evidence,
      selectedPromoIds: input.selectedPromos.map((promo) => promo.id),
      selectedPromoTitles,
      matchingCruiseLinePromoCount: input.cruiseLinePromoCount ?? 0,
      warnings,
      blockingIssues,
    };
  }

  if (foundUnknownMarket) {
    warnings.push(
      detected.code
        ? `Audience market was inferred as ${formatMarket(detected.code)}. One or more selected promos have unknown market coverage, so eligibility still needs operator review.`
        : "Audience market could not be inferred from the current targeting text. Promo eligibility still needs operator review."
    );
    return {
      status: "promo_market_unknown",
      inferredAudienceMarket: detected.code,
      inferredAudienceEvidence: detected.evidence,
      selectedPromoIds: input.selectedPromos.map((promo) => promo.id),
      selectedPromoTitles,
      matchingCruiseLinePromoCount: input.cruiseLinePromoCount ?? 0,
      warnings,
      blockingIssues,
    };
  }

  return {
    status: "promo_attached",
    inferredAudienceMarket: detected.code,
    inferredAudienceEvidence: detected.evidence,
    selectedPromoIds: input.selectedPromos.map((promo) => promo.id),
    selectedPromoTitles,
    matchingCruiseLinePromoCount: input.cruiseLinePromoCount ?? 0,
    warnings,
    blockingIssues,
  };
}
