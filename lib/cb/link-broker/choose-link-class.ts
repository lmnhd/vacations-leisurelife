/**
 * Link-class chooser.
 *
 * Decides which class the broker should produce from the request inputs and
 * preferences, following the ODYSSEUS_LINK_BROKER_PLAN decision ladder. Pure
 * decision logic — it does not build or validate URLs.
 */

import { DEFAULT_LINK_BROKER_PREFERENCE } from "@/lib/cb/deals-system/link-broker-types";
import type {
  LinkBrokerLinkClass,
  LinkBrokerRequest,
} from "@/lib/cb/deals-system/link-broker-types";

export interface LinkClassChoice {
  /** undefined means the broker cannot construct a link from inputs alone. */
  linkClass?: LinkBrokerLinkClass;
  reason: string;
  alternativesConsidered: string[];
  /** Inputs needed to upgrade to a richer class (e.g. prepared_details). */
  missingForPreparedDetails: string[];
}

function preparedDetailsGaps(request: LinkBrokerRequest): string[] {
  const setup = request.travelerSetup ?? {};
  const missing: string[] = [];
  if (!setup.passengerCount || setup.passengerCount < 1) missing.push("passengerCount");
  if (!setup.ages || setup.ages.length === 0) missing.push("ages");
  if (setup.ages && setup.passengerCount && setup.ages.length !== setup.passengerCount) {
    missing.push("ages-must-match-passengerCount");
  }
  if (!setup.state) missing.push("state");
  if (!setup.airportCode) missing.push("airportCode");
  return missing;
}

export function chooseBrokerLinkClass(request: LinkBrokerRequest): LinkClassChoice {
  const preference = { ...DEFAULT_LINK_BROKER_PREFERENCE, ...request.preference };
  const alternativesConsidered: string[] = [];
  const hasPackageId = Boolean(request.cruise.packageId);

  // 1. Explicit captured clone/cabin: only honored when a portal token is present.
  if (
    preference.allowCabinResume &&
    request.bookingReference &&
    (preference.preferredLinkClass === "auto" ||
      preference.preferredLinkClass === "captured_cabin")
  ) {
    return {
      linkClass: "captured_cabin",
      reason: "portal-generated booking reference (brn) supplied and cabin resume allowed",
      alternativesConsidered,
      missingForPreparedDetails: preparedDetailsGaps(request),
    };
  }
  alternativesConsidered.push("captured_cabin");

  if (
    preference.allowCapturedClone &&
    request.cloneBookingToken &&
    (preference.preferredLinkClass === "auto" ||
      preference.preferredLinkClass === "captured_clone")
  ) {
    return {
      linkClass: "captured_clone",
      reason: "portal-generated clone token supplied and captured clone allowed",
      alternativesConsidered,
      missingForPreparedDetails: preparedDetailsGaps(request),
    };
  }
  alternativesConsidered.push("captured_clone");

  // No package ID -> cannot construct anything; caller must run package lookup.
  if (!hasPackageId) {
    return {
      linkClass: undefined,
      reason: "no package ID; package lookup required before a link can be built",
      alternativesConsidered,
      missingForPreparedDetails: preparedDetailsGaps(request),
    };
  }

  const gaps = preparedDetailsGaps(request);

  // 2. Package ID + sufficient setup -> prepared details (preferred default).
  if (preference.allowPreparedDetails && gaps.length === 0 &&
      (preference.preferredLinkClass === "auto" ||
       preference.preferredLinkClass === "prepared_details")) {
    return {
      linkClass: "prepared_details",
      reason: "package ID known and traveler setup is sufficient for a prepared details link",
      alternativesConsidered: [...alternativesConsidered, "package_entry"],
      missingForPreparedDetails: gaps,
    };
  }
  alternativesConsidered.push("prepared_details");

  // 3. Package ID but incomplete setup (or caller forced package_entry) -> package entry.
  return {
    linkClass: "package_entry",
    reason:
      gaps.length > 0
        ? "package ID known but traveler setup is incomplete; using safe package entry link"
        : "package entry link requested",
    alternativesConsidered,
    missingForPreparedDetails: gaps,
  };
}
