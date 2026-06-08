/**
 * Link Broker internal types.
 *
 * Re-exports the Phase 1 data contracts from lib/cb/deals-system and adds the
 * builder-level helper types used only inside this module.
 */

export * from "@/lib/cb/deals-system/link-broker-types";

import type { LinkBrokerLinkClass } from "@/lib/cb/deals-system/link-broker-types";

/** Inputs the package-entry builder needs. */
export interface PackageEntryLinkInput {
  packageId: string;
  siid: string;
  /** Optional human-readable slug; appended as `{id}--{slug}` when present. */
  slug?: string;
  lang?: number;
}

/** Inputs the prepared-details builder needs. */
export interface PreparedDetailsLinkInput {
  packageId: string;
  siid: string;
  officeId: string;
  passengerCount: number;
  ages: number[];
  state: string;
  airportCode: string;
  /** Optional visitor phone; omitted from the URL when absent. */
  phone?: string;
  lang?: number;
}

/** Result of parsing a captured/portal link. */
export interface ParsedBrokerLink {
  linkClass: LinkBrokerLinkClass;
  packageId?: string;
  siid?: string;
  officeId?: string;
  currencyId?: string;
  passengerCount?: number;
  ages?: number[];
  state?: string;
  airportCode?: string;
  hasPhone: boolean;
  /** Portal-generated; present only on captured_clone links. */
  cloneBookingToken?: string;
  /** Portal-generated; present only on captured_cabin links. */
  bookingReference?: string;
  /** Raw query parameters preserved for diagnostics (phone redacted). */
  rawParams: Record<string, string>;
  isOdysseusHost: boolean;
}

/** Outcome of static validation. */
export interface StaticValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}
