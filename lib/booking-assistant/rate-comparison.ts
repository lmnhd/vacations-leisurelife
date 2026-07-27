import type { RateCandidate } from "./types";

export interface RateComparison {
  candidateId: string;
  candidateTotal: number | null;
  baselineTotal: number | null;
  savings: number | null;
  isCheaper: boolean | null;
  requiresGuestChoice: true;
}

function parseMoney(value: string): number | null {
  let normalized = "";
  let seenDecimal = false;
  for (const character of value.trim()) {
    if (character >= "0" && character <= "9") normalized += character;
    else if (character === "." && !seenDecimal) {
      normalized += character;
      seenDecimal = true;
    }
  }
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function compareRateCandidate(candidate: RateCandidate): RateComparison {
  const candidateTotal = parseMoney(candidate.totalIncludingTaxesFees);
  const baselineTotal = parseMoney(candidate.ordinaryRateBaselineTotal);
  const savings =
    candidateTotal === null || baselineTotal === null
      ? null
      : Math.round((baselineTotal - candidateTotal) * 100) / 100;
  return {
    candidateId: candidate.rateCandidateId,
    candidateTotal,
    baselineTotal,
    savings,
    isCheaper: savings === null ? null : savings > 0,
    requiresGuestChoice: true,
  };
}
