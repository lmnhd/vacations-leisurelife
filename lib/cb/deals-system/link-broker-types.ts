/**
 * Link Broker data contracts.
 *
 * The Link Broker is internal backend infrastructure (see
 * PHASE_0_BASELINE_GUARDRAILS.md). It turns cruise facts + traveler setup into
 * the best CB/Odysseus booking link, validated and cached. It never renders UI,
 * sends email, or creates reservations.
 *
 * Mirrors ODYSSEUS_LINK_BROKER_PLAN.md. Implementation lands in Phase 2+; these
 * are the Phase 1 schemas the caches and later code fill.
 */

export type LinkBrokerLinkClass =
  | "package_entry"
  | "prepared_details"
  | "captured_clone"
  | "captured_cabin";

export type LinkBrokerIntent =
  | "find_best_link"
  | "build_from_package_id"
  | "refresh_existing_link"
  | "capture_deep_link";

export type LinkBrokerStatus =
  | "ready"
  | "found_package_needs_inputs"
  | "needs_package_lookup"
  | "needs_validation"
  | "invalid"
  | "needs_operator_capture";

export type LinkHealthStatus = "valid" | "stale" | "broken" | "unknown";

export interface LinkBrokerCruiseFacts {
  packageId?: string;
  packageUrl?: string;
  cruiseLine?: string;
  shipName?: string;
  sailDate?: string;
  nights?: number;
  itineraryName?: string;
  destination?: string;
  departurePort?: string;
  arrivalPort?: string;
  cabinCategoryPreference?: string;
}

export interface LinkBrokerAgent {
  siid: string;
  officeId?: string;
}

export interface LinkBrokerTravelerSetup {
  passengerCount?: number;
  ages?: number[];
  countryCode?: "US" | string;
  state?: string;
  airportCode?: string;
  /** Never stored casually; redacted in logs. */
  phone?: string;
}

export interface LinkBrokerPreference {
  preferredLinkClass?: "auto" | LinkBrokerLinkClass;
  allowPreparedDetails?: boolean;
  allowCapturedClone?: boolean;
  allowCabinResume?: boolean;
  requireFreshValidation?: boolean;
}

export interface LinkBrokerRequest {
  requestId?: string;
  intent: LinkBrokerIntent;
  cruise: LinkBrokerCruiseFacts;
  agent: LinkBrokerAgent;
  travelerSetup?: LinkBrokerTravelerSetup;
  currencyId?: "USD" | string;
  preference?: LinkBrokerPreference;
  existingLink?: string;
  /** Portal-generated only; never synthesized. */
  cloneBookingToken?: string;
  /** Portal-generated only; never synthesized. */
  bookingReference?: string;
}

export const DEFAULT_LINK_BROKER_PREFERENCE: Required<
  Pick<
    LinkBrokerPreference,
    | "preferredLinkClass"
    | "allowPreparedDetails"
    | "allowCapturedClone"
    | "allowCabinResume"
    | "requireFreshValidation"
  >
> = {
  preferredLinkClass: "auto",
  allowPreparedDetails: true,
  allowCapturedClone: false,
  allowCabinResume: false,
  requireFreshValidation: true,
};

export interface LinkBrokerHealth {
  status: LinkHealthStatus;
  capturedAtIso?: string;
  lastVerifiedAtIso?: string;
  nextVerificationDueIso?: string;
  failureReason?: string;
}

export interface LinkBrokerDecision {
  selectedLinkClass: string;
  reason: string;
  alternativesConsidered: string[];
}

export interface LinkBrokerResolvedCruise {
  cruiseLine?: string;
  shipName?: string;
  sailDate?: string;
  nights?: number;
  itineraryName?: string;
  departurePort?: string;
}

export interface LinkBrokerOutput {
  status: LinkBrokerStatus;
  linkClass: LinkBrokerLinkClass;
  url?: string;
  packageId?: string;
  siid: string;
  resolvedCruise?: LinkBrokerResolvedCruise;
  missingInputs: string[];
  warnings: string[];
  decision: LinkBrokerDecision;
  health?: LinkBrokerHealth;
}

export type LinkBrokerRecordSource =
  | "constructed"
  | "captured_share_button"
  | "operator_override";

export interface LinkBrokerCruiseFingerprint {
  cruiseLine?: string;
  shipName?: string;
  itineraryName?: string;
  sailDateIso?: string;
  nights?: number;
  departurePort?: string;
}

export interface LinkBrokerParameterSummary {
  passengerCount?: number;
  ageCount?: number;
  state?: string;
  airportCode?: string;
  officeId?: string;
  hasPhone: boolean;
  hasCloneBookingToken: boolean;
  hasBookingReference: boolean;
}

export interface LinkBrokerRecord {
  id: string;
  packageId: string;
  siid: string;
  linkClass: LinkBrokerLinkClass;
  url: string;
  urlHash: string;
  source: LinkBrokerRecordSource;
  createdAtIso: string;
  updatedAtIso: string;
  health: LinkBrokerHealth;
  cruiseFingerprint?: LinkBrokerCruiseFingerprint;
  parameterSummary: LinkBrokerParameterSummary;
}

export interface LinkBrokerCache {
  version: 1;
  generatedAtIso: string;
  records: LinkBrokerRecord[];
}
