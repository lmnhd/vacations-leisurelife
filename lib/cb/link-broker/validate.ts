/**
 * Static validation for Link Broker links.
 *
 * Static-only (no browser): confirms required params exist, siid is present,
 * package ID is parseable, age count matches passenger count, and no
 * portal-generated field was guessed. Browser-aware health validation arrives in
 * Phase 3; here we only label what we can prove from the URL string.
 */

import { extractPackageId, isOdysseusBookingsUrl } from "./normalize";
import { parseCapturedOdysseusLink } from "./parse-captured-link";
import type { LinkBrokerLinkClass } from "./types";
import type { StaticValidationResult } from "./types";

/**
 * Validates a constructed/captured link string against its declared class.
 *
 * @param url The link to validate.
 * @param expectedClass The class the caller believes this link is.
 * @param options.constructed True when the broker built this link (so a
 *   clone/cabin token would mean we wrongly synthesized a portal field).
 */
export function staticValidateLink(
  url: string,
  expectedClass: LinkBrokerLinkClass,
  options: { constructed?: boolean } = {}
): StaticValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isOdysseusBookingsUrl(url)) {
    errors.push("URL host is not bookings.cbagenttools.com");
  }

  const parsed = parseCapturedOdysseusLink(url);

  if (!parsed.siid) {
    errors.push("siid is missing");
  }

  const packageId = extractPackageId(url);
  if (!packageId) {
    errors.push("package ID could not be parsed");
  }

  if (parsed.linkClass !== expectedClass) {
    errors.push(
      `link classifies as "${parsed.linkClass}" but expected "${expectedClass}"`
    );
  }

  if (expectedClass === "prepared_details") {
    if (parsed.passengerCount === undefined) {
      errors.push("prepared details link is missing p1 (passenger count)");
    }
    if (!parsed.ages || parsed.ages.length === 0) {
      errors.push("prepared details link is missing p2 (ages)");
    }
    if (
      parsed.passengerCount !== undefined &&
      parsed.ages &&
      parsed.ages.length !== parsed.passengerCount
    ) {
      errors.push(
        `age count (${parsed.ages.length}) does not match passenger count (${parsed.passengerCount})`
      );
    }
    if (!parsed.officeId) {
      warnings.push("prepared details link has no officeId");
    }
    if (!parsed.state || !parsed.airportCode) {
      warnings.push("prepared details link has an incomplete residency (res) triple");
    }
  }

  // A constructed link must never carry a portal-generated token: those can only
  // come from a freshly captured portal link, never be guessed.
  if (options.constructed) {
    if (parsed.cloneBookingToken) {
      errors.push("constructed link unexpectedly contains a clonebkg token");
    }
    if (parsed.bookingReference) {
      errors.push("constructed link unexpectedly contains a brn reference");
    }
  }

  if (
    (expectedClass === "captured_clone" && !parsed.cloneBookingToken) ||
    (expectedClass === "captured_cabin" && !parsed.bookingReference)
  ) {
    errors.push(
      `${expectedClass} link is missing its portal-generated token; it must be captured, not constructed`
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}
