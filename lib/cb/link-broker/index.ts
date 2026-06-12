/**
 * Internal Link Broker (Phase 2).
 *
 * Public API per ODYSSEUS_LINK_BROKER_PLAN. Backend-only infrastructure: it
 * produces, parses, and statically validates CB/Odysseus booking links. It never
 * renders UI, sends email, opens URLs, or creates reservations.
 */

export { resolveBestBookingLink, refreshBookingLink } from "./broker";
export type { ResolveOptions, PackageLookupFn } from "./broker";

// Package lookup: pure ranker + operator-run Odysseus adapter.
export {
  rankPackageCandidates,
  extractCabinPricing,
  normalizeDateKey,
  CRUISE_LINE_NAMES,
  SAIL_DATE_TOLERANCE_DAYS,
} from "./package-lookup";
export type {
  RankedPackageCandidate,
  PackageLookupResult,
  PackageCabinPricing,
  PackageItinerary,
  RankOptions,
} from "./package-lookup";
export { lookupOdysseusPackages, resolveVendorId } from "./odysseus-lookup";
export type { OdysseusLookupOptions } from "./odysseus-lookup";
export { parseCapturedOdysseusLink } from "./parse-captured-link";
export { staticValidateLink } from "./validate";
export { chooseBrokerLinkClass } from "./choose-link-class";

// Health rules (pure) and browser-aware validation (operator-run).
export {
  computeHealth,
  staticHealth,
  refreshHealthStaleness,
  isStale,
  addHoursIso,
  DEFAULT_FRESHNESS_HOURS,
} from "./health";
export {
  validateBrokerLink,
  checkCbLink,
  checkCbSwiftLink,
  checkCbFetchLink,
} from "./browser-validate";
export type {
  LinkCheckOutcome,
  ValidateBrokerLinkOptions,
} from "./browser-validate";

// Lower-level builders and cache helpers (internal, but exported for tests and
// advanced callers).
export { buildPackageEntryLink } from "./build-package-link";
export {
  buildPreparedDetailsLink,
  buildPreparedDetailsLinkEngineVariant,
} from "./build-prepared-details-link";
export {
  getCachedBrokerLink,
  upsertBrokerLink,
  loadLinkBrokerCache,
  saveLinkBrokerCache,
  travelerSetupHash,
  buildBrokerRecordId,
} from "./cache";
export {
  redactPhone,
  redactUrlForLog,
  extractPackageId,
  isOdysseusBookingsUrl,
  slugifyItinerary,
  detectOfficeIdMismatch,
  DEFAULT_AGENT_SIID,
  DEFAULT_OFFICE_ID,
  DEFAULT_CURRENCY_ID,
} from "./normalize";

export * from "./types";
