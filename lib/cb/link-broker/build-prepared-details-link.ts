/**
 * Class 2 - Prepared Details Link builder.
 *
 * Default internal generation target when traveler setup is sufficient.
 *
 * Canonical shape MATCHES the real portal Share-button output (confirmed against
 * a live captured share link), not the variant in OdysseusEngine.ts. The two
 * differ in ways that matter:
 *
 *   Share link (canonical):   /web//cruises/details.aspx   (double slash)
 *                             CurrId=USD present
 *                             skipdetails=true  (lowercase)
 *                             no packageTourId
 *                             officeId varies per package/vendor (286 observed)
 *
 *   OdysseusEngine (fallback): /web/cruises/details.aspx    (single slash)
 *                              no CurrId
 *                              skipDetails=true (camelCase)
 *                              packageTourId=-1
 *
 * The engine variant still navigates correctly and is kept as a labeled
 * fallback (buildPreparedDetailsLinkEngineVariant) for diagnostics/A-B use.
 *
 * Neither variant synthesizes `clonebkg` or `brn`. Despite looking structured
 * (e.g. `07A__BESTPRICE__07A__`), `clonebkg` is trusted ONLY when copied from the
 * portal Share button — it is never built here.
 */

import {
  DEFAULT_CURRENCY_ID,
  DEFAULT_OCCUPANCY_PAYLOAD,
  ODYSSEUS_BOOKINGS_HOST,
  PREPARED_DETAILS_TT,
  encodeAges,
  encodeResidency,
} from "./normalize";
import type { PreparedDetailsLinkInput } from "./types";

function assertPreparedInputs(input: PreparedDetailsLinkInput): void {
  if (!input.packageId.trim()) {
    throw new Error("buildPreparedDetailsLink: packageId is required");
  }
  if (!input.siid.trim()) {
    throw new Error("buildPreparedDetailsLink: siid is required");
  }
  if (!input.officeId.trim()) {
    throw new Error("buildPreparedDetailsLink: officeId is required");
  }
  if (!Number.isInteger(input.passengerCount) || input.passengerCount < 1) {
    throw new Error("buildPreparedDetailsLink: passengerCount must be a positive integer");
  }
  if (input.ages.length !== input.passengerCount) {
    throw new Error(
      `buildPreparedDetailsLink: ages count (${input.ages.length}) must match passengerCount (${input.passengerCount})`
    );
  }
  if (!input.state.trim() || !input.airportCode.trim()) {
    throw new Error("buildPreparedDetailsLink: state and airportCode are required");
  }
}

/**
 * Canonical prepared-details link, matching the portal Share-button output.
 */
export function buildPreparedDetailsLink(input: PreparedDetailsLinkInput): string {
  assertPreparedInputs(input);

  const packageId = input.packageId.trim();
  const lang = input.lang ?? 1;
  const agesParam = encodeAges(input.ages);
  const resParam = encodeResidency(input.state.trim(), input.airportCode.trim());

  const params = [
    `source=swift`,
    `pid=${packageId}`,
    `siid=${input.siid.trim()}`,
    `lang=${lang}`,
    `CurrId=${DEFAULT_CURRENCY_ID}`,
    `officeId=${input.officeId.trim()}`,
    `skipdetails=true`,
    `op=${DEFAULT_OCCUPANCY_PAYLOAD}`,
    `res=${resParam}`,
    `tt=${PREPARED_DETAILS_TT}`,
    `p1=${input.passengerCount}`,
    `p2=${agesParam}`,
  ];

  // PhoneNum is optional. Only included when a visitor supplied a phone through a
  // separate CTA flow. CB also accepts the link without it.
  if (input.phone && input.phone.trim()) {
    const digits = input.phone.replace(/\D/g, "");
    params.push(`PhoneNum=${digits}`);
  }

  // Note the double slash after /web — this is the real share-link path.
  return `https://${ODYSSEUS_BOOKINGS_HOST}/web//cruises/details.aspx?${params.join("&")}`;
}

/**
 * Fallback variant matching lib/services/odysseus/OdysseusEngine.ts. Kept for
 * diagnostics / A-B comparison; not the default the broker emits.
 */
export function buildPreparedDetailsLinkEngineVariant(
  input: PreparedDetailsLinkInput
): string {
  assertPreparedInputs(input);

  const packageId = input.packageId.trim();
  const lang = input.lang ?? 1;
  const agesParam = encodeAges(input.ages);
  const resParam = encodeResidency(input.state.trim(), input.airportCode.trim());

  const params = [
    `source=swift`,
    `pid=${packageId}`,
    `packageTourId=-1`,
    `lang=${lang}`,
    `p1=${input.passengerCount}`,
    `p2=${agesParam}`,
    `skipDetails=true`,
    `op=${DEFAULT_OCCUPANCY_PAYLOAD}`,
    `res=${resParam}`,
    `tt=${PREPARED_DETAILS_TT}`,
    `Email=`,
    `FName=`,
    `LName=`,
  ];

  if (input.phone && input.phone.trim()) {
    const digits = input.phone.replace(/\D/g, "");
    params.push(`PhoneNum=${digits}`, `PhoneCallingCode=1`, `phoneCountryCode=us`);
  }

  params.push(`officeId=${input.officeId.trim()}`, `siid=${input.siid.trim()}`);

  return `https://${ODYSSEUS_BOOKINGS_HOST}/web/cruises/details.aspx?${params.join("&")}`;
}
