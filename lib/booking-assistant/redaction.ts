export type RedactionDisposition = "accepted" | "redacted" | "quarantined" | "discarded";

export interface RedactionResult {
  disposition: RedactionDisposition;
  sanitizedText?: string;
  reasons: string[];
  classifierVersion: "booking-redaction-v1";
}

const TIER_D_KEYWORDS = [
  "cvv",
  "cvc",
  "card number",
  "credit card",
  "debit card",
  "expiration date",
  "expiry date",
];

const TIER_C_KEYWORDS = [
  "military id",
  "service number",
  "dd214",
  "discharge document",
  "disability percentage",
  "passport number",
  "redress number",
  "known traveler number",
];

function paymentNumberCandidate(value: string): boolean {
  let digits = "";
  for (const character of value) {
    if (character >= "0" && character <= "9") {
      digits += character;
    } else if (character !== " " && character !== "-") {
      if (digits.length >= 13 && digits.length <= 19 && passesLuhn(digits)) return true;
      digits = "";
    }
  }
  return digits.length >= 13 && digits.length <= 19 && passesLuhn(digits);
}

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum > 0 && sum % 10 === 0;
}

function includesKeyword(value: string, keywords: readonly string[]): string | null {
  const normalized = value.toLowerCase();
  return keywords.find((keyword) => normalized.includes(keyword)) ?? null;
}

export function redactConversationText(value: string): RedactionResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { disposition: "accepted", sanitizedText: "", reasons: [], classifierVersion: "booking-redaction-v1" };
  }
  const tierD = includesKeyword(trimmed, TIER_D_KEYWORDS);
  if (tierD || paymentNumberCandidate(trimmed)) {
    return {
      disposition: "discarded",
      reasons: [tierD ? "payment_keyword" : "payment_number_pattern"],
      classifierVersion: "booking-redaction-v1",
    };
  }
  const tierC = includesKeyword(trimmed, TIER_C_KEYWORDS);
  if (tierC) {
    return {
      disposition: "quarantined",
      reasons: ["restricted_identity_or_proof_content"],
      classifierVersion: "booking-redaction-v1",
    };
  }
  return {
    disposition: "accepted",
    sanitizedText: trimmed.slice(0, 4000),
    reasons: [],
    classifierVersion: "booking-redaction-v1",
  };
}

export function assertAllowedStructuredKeys(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }
    for (const [key, child] of Object.entries(current)) {
      const normalized = key.toLowerCase().split("_").join(" ");
      if (includesKeyword(normalized, TIER_D_KEYWORDS) || includesKeyword(normalized, TIER_C_KEYWORDS)) {
        throw new Error(`Restricted field is not accepted: ${key}`);
      }
      stack.push(child);
    }
  }
}

export function assertNoRestrictedStructuredContent(value: unknown): void {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (typeof current === "string") {
      const result = redactConversationText(current);
      if (result.disposition === "discarded" || result.disposition === "quarantined") {
        throw new Error("Restricted payment, identity, or proof content is not accepted");
      }
      continue;
    }
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
    } else {
      for (const child of Object.values(current)) stack.push(child);
    }
  }
}
