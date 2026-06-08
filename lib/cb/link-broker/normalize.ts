/**
 * Shared normalization helpers for the Link Broker.
 *
 * Keeps URL host detection, phone redaction, package-ID extraction, and
 * occupancy/residency payload encoding in one place so builders, the parser,
 * and validation stay consistent.
 */

export const ODYSSEUS_BOOKINGS_HOST = "bookings.cbagenttools.com";

/**
 * Default office ID. Uncertain by design: real captured share links have shown
 * 286, while OdysseusEngine constructs with 193, and the plan notes 192/193/286.
 * officeId appears to vary per package/vendor, so this is only a fallback — the
 * broker flags a diagnostic warning whenever a captured value differs (see
 * detectOfficeIdMismatch). Override via env.
 */
export const DEFAULT_OFFICE_ID =
  process.env.CB_OFFICE_ID || process.env.NEXT_PUBLIC_CB_OFFICE_ID || "286";

/** Currency parameter present on real captured share links. */
export const DEFAULT_CURRENCY_ID = "USD";

/**
 * Returns a warning string when a captured officeId differs from the default,
 * or undefined when they match / nothing was captured. Lets callers surface a
 * per-vendor review note instead of silently trusting a guessed office.
 */
export function detectOfficeIdMismatch(
  capturedOfficeId: string | undefined,
  defaultOfficeId: string = DEFAULT_OFFICE_ID
): string | undefined {
  if (!capturedOfficeId) return undefined;
  if (capturedOfficeId === defaultOfficeId) return undefined;
  return `Captured officeId ${capturedOfficeId} differs from default ${defaultOfficeId}; confirm the correct office for this vendor/package.`;
}

export const DEFAULT_AGENT_SIID =
  process.env.NEXT_PUBLIC_CB_AGENT_SIID || process.env.CB_AGENT_SIID || "1049337";

/**
 * Occupancy payload used by the prepared-details (`op`) parameter. Matches the
 * working shape in OdysseusEngine: 12 comma-separated slots, URL-encoded commas.
 */
export const DEFAULT_OCCUPANCY_PAYLOAD = "0%2c0%2c0%2c0%2c0%2c0%2c0%2c0%2c%2c%2c0%2c0";

/** Travel-type constant observed on every prepared-details link. */
export const PREPARED_DETAILS_TT = "29";

export function isOdysseusBookingsUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === ODYSSEUS_BOOKINGS_HOST;
  } catch {
    return false;
  }
}

/**
 * Extracts the numeric package ID from a Swift package path or a `pid` query
 * param. Returns undefined when no package ID is present.
 */
export function extractPackageId(url: string): string | undefined {
  try {
    const parsed = new URL(url);

    const pid = parsed.searchParams.get("pid");
    if (pid) {
      return pid.split("--")[0];
    }

    const match = parsed.pathname.match(/\/swift\/cruise\/package\/([^/?#]+)/i);
    return match?.[1]?.split("--")[0];
  } catch {
    return undefined;
  }
}

/** Encodes a list of ages as `35%2c35`. */
export function encodeAges(ages: number[]): string {
  return ages.join("%2c");
}

/** Encodes the residency triple `US,{STATE},{AIRPORT}` with URL-encoded commas. */
export function encodeResidency(
  state: string,
  airportCode: string,
  countryCode = "US"
): string {
  return `${countryCode}%2c${state}%2c${airportCode}`;
}

/**
 * Redacts a phone number for logs/diagnostics, keeping only the last two digits.
 * `5615551234` -> `********34`. Empty/falsy input returns an empty string.
 */
export function redactPhone(phone: string | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 2) return "*".repeat(digits.length);
  return `${"*".repeat(digits.length - 2)}${digits.slice(-2)}`;
}

/**
 * Redacts a full URL for logging: strips `PhoneNum` to a redacted form so phone
 * numbers never appear in plaintext diagnostics.
 */
export function redactUrlForLog(url: string): string {
  return url.replace(/(PhoneNum=)[^&]*/gi, (_m, prefix) => `${prefix}[redacted]`);
}

/** Slugifies an itinerary name into the `--{slug}` suffix CB uses on package links. */
export function slugifyItinerary(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || undefined;
}
