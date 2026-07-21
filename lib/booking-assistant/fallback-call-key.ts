/**
 * Cryptographically random three-letter fallback call-key selector.
 *
 * Per plan Section 6A.2:
 * - Draw from a curated, pronounceable, non-offensive safe-word registry
 * - Cryptographically secure randomness
 * - Collision-check against all active keys
 * - HMAC digest for the authenticated operator lookup index
 * - No PII, no sequential IDs, no raw key in logs/analytics/URLs
 */

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import type { EncryptedBlob } from "./encryption";

/** Versioned curated safe-word registry (Section 6A.2). */
export const SAFE_WORD_REGISTRY: readonly string[] = [
  "MAP", "CAT", "DOG", "SUN", "SKY", "SEA", "FOX", "OWL", "BEE", "RAY",
  "OAK", "ICE", "AIR", "ART", "BAR", "BED", "BOW", "BUS", "CAN", "CAP",
  "CUP", "DAY", "EAR", "EGG", "ELF", "EYE", "FAN", "FIG", "FLY", "GEM",
  "HAT", "HEN", "HOP", "INK", "JAR", "JOY", "KEY", "KIT", "LEG", "LOG",
  "MOO", "NET", "NOR", "NUT", "OAR", "PEN", "PIE", "PIN", "PIT", "POD",
  "RAG", "RAM", "RAT", "RED", "RIB", "RIM", "ROD", "ROW", "RUG", "SAD",
  "SAP", "SAT", "SAW", "SET", "SIT", "SIX", "SKI", "SOY", "SPA", "TAP",
  "TAR", "TEN", "TIE", "TIN", "TIP", "TOE", "TON", "TOP", "TOY", "TRY",
  "TUB", "URN", "WAR", "WAX", "WEB", "WIG", "WIT", "WOK", "WOO", "ZIP",
] as const;

export const CALL_KEY_VERSION = 1 as const;

/** HMAC secret for the lookup index. Rotatable via env. */
function getHmacSecret(): string {
  const secret = process.env.BOOKING_ASSISTANT_CALL_KEY_HMAC_SECRET;
  if (!secret) {
    throw new Error(
      "BOOKING_ASSISTANT_CALL_KEY_HMAC_SECRET is not configured"
    );
  }
  return secret;
}

/** Compute a deterministic HMAC digest for a normalized key. */
export function computeCallKeyHmac(normalizedKey: string): string {
  return createHmac("sha256", getHmacSecret())
    .update(normalizedKey.toUpperCase())
    .digest("hex");
}

/** Constant-time exact-match comparison of two hex HMAC digests. */
export function constantTimeHmacMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    const bufA = new Uint8Array(Buffer.from(a, "hex"));
    const bufB = new Uint8Array(Buffer.from(b, "hex"));
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export interface CallKeySelectionResult {
  rawKey: string;
  normalizedKey: string;
  lookupHmac: string;
  keyVersion: number;
}

/**
 * Select a cryptographically random three-letter key from the registry.
 *
 * The caller must collision-check the returned key against all active keys
 * in the table before committing. If a collision is found, call again.
 */
export function selectRandomCallKey(): CallKeySelectionResult {
  const index = randomInt(0, SAFE_WORD_REGISTRY.length);
  const rawKey = SAFE_WORD_REGISTRY[index];
  const normalizedKey = rawKey.toUpperCase();
  return {
    rawKey,
    normalizedKey,
    lookupHmac: computeCallKeyHmac(normalizedKey),
    keyVersion: CALL_KEY_VERSION,
  };
}

/**
 * Normalize a caller-supplied key for lookup: uppercase, trim, validate
 * it's exactly 3 letters from the registry.
 */
export function normalizeCallKeyInput(input: string): string | null {
  const trimmed = input.trim().toUpperCase();
  if (trimmed.length !== 3) return null;
  if (!SAFE_WORD_REGISTRY.includes(trimmed as (typeof SAFE_WORD_REGISTRY)[number])) {
    return null;
  }
  return trimmed;
}

/**
 * Lookup result for the authenticated operator fallback-key search.
 * Never enumerates or reveals whether a similar code exists.
 */
export type CallKeyLookupResult =
  | {
      found: true;
      draftId: string;
      packetVersion: number;
      keyVersion: number;
      issuedAtIso: string;
    }
  | { found: false };

/** No-match result that does not reveal whether any key exists. */
export const CALL_KEY_NO_MATCH: CallKeyLookupResult = { found: false } as const;
