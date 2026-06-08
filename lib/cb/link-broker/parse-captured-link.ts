/**
 * Captured-link parser and classifier.
 *
 * Classifies any CB/Odysseus URL into one of the four link classes and extracts
 * its parameters. `clonebkg` and `brn` are recognized only as portal-generated
 * markers — they are never produced here, only read from a captured link.
 *
 * Classification order (most specific first):
 *   1. brn present                -> captured_cabin
 *   2. clonebkg present           -> captured_clone
 *   3. details.aspx path          -> prepared_details
 *   4. /swift/cruise/package/ path -> package_entry
 *   (fallback) -> package_entry, with a host warning surfaced by the caller
 *
 * Note: real portal Share links are details.aspx URLs that ALSO carry a
 * `clonebkg` (e.g. `07A__BESTPRICE__07A__`). Those classify as captured_clone
 * because the clonebkg encodes captured deep booking state. Despite the
 * structured look, clonebkg is trusted only as captured — never synthesized.
 *
 * The details path is matched with an optional double slash (`/web//cruises/`),
 * which is the exact shape the Share button emits.
 */

import {
  extractPackageId,
  isOdysseusBookingsUrl,
} from "./normalize";
import type { ParsedBrokerLink } from "./types";

function parseAges(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const ages = raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((n) => Number.isFinite(n));
  return ages.length > 0 ? ages : undefined;
}

function parseResidency(
  raw: string | null
): { state?: string; airportCode?: string } {
  if (!raw) return {};
  // `US,FL,DAB` (commas already decoded by URLSearchParams)
  const parts = raw.split(",").map((p) => p.trim());
  return { state: parts[1] || undefined, airportCode: parts[2] || undefined };
}

export function parseCapturedOdysseusLink(url: string): ParsedBrokerLink {
  const isOdysseusHost = isOdysseusBookingsUrl(url);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      linkClass: "package_entry",
      hasPhone: false,
      rawParams: {},
      isOdysseusHost: false,
    };
  }

  const params = parsed.searchParams;
  const cloneBookingToken = params.get("clonebkg") || undefined;
  const bookingReference = params.get("brn") || undefined;
  const isDetailsPath = /\/cruises\/details\.aspx$/i.test(parsed.pathname);

  let linkClass: ParsedBrokerLink["linkClass"];
  if (bookingReference) {
    linkClass = "captured_cabin";
  } else if (cloneBookingToken) {
    linkClass = "captured_clone";
  } else if (isDetailsPath) {
    linkClass = "prepared_details";
  } else {
    linkClass = "package_entry";
  }

  const ages = parseAges(params.get("p2"));
  const residency = parseResidency(params.get("res"));
  const passengerCountRaw = params.get("p1");
  const passengerCount = passengerCountRaw
    ? Number.parseInt(passengerCountRaw, 10)
    : undefined;
  const hasPhone = Boolean(params.get("PhoneNum"));

  // Preserve raw params for diagnostics, but never store the phone number.
  const rawParams: Record<string, string> = {};
  params.forEach((value, key) => {
    rawParams[key] = key.toLowerCase() === "phonenum" ? "[redacted]" : value;
  });

  return {
    linkClass,
    packageId: extractPackageId(url),
    siid: params.get("siid") || undefined,
    officeId: params.get("officeId") || undefined,
    currencyId: params.get("CurrId") || undefined,
    passengerCount: Number.isFinite(passengerCount) ? passengerCount : undefined,
    ages,
    state: residency.state,
    airportCode: residency.airportCode,
    hasPhone,
    cloneBookingToken,
    bookingReference,
    rawParams,
    isOdysseusHost,
  };
}
