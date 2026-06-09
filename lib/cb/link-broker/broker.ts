/**
 * Link Broker orchestration.
 *
 * `resolveBestBookingLink` is the public contract: cruise facts + traveler setup
 * in, best usable booking link out, without the caller choosing a link class.
 *
 * Phase 2 scope: package ID known -> package entry / prepared details; no package
 * ID -> `needs_package_lookup` (Odysseus lookup lands in Phase 6). Browser-aware
 * health lands in Phase 3; here links carry `unknown`/`needs_validation` health.
 */

import {
  DEFAULT_LINK_BROKER_PREFERENCE,
} from "@/lib/cb/deals-system/link-broker-types";
import type {
  LinkBrokerLinkClass,
  LinkBrokerOutput,
  LinkBrokerRecord,
  LinkBrokerRequest,
} from "@/lib/cb/deals-system/link-broker-types";

import { buildPackageEntryLink } from "./build-package-link";
import { buildPreparedDetailsLink } from "./build-prepared-details-link";
import {
  BrokerCacheKey,
  buildBrokerRecordId,
  getCachedBrokerLink,
  hashUrl,
  travelerSetupHash,
  upsertBrokerLink,
} from "./cache";
import { chooseBrokerLinkClass } from "./choose-link-class";
import {
  DEFAULT_AGENT_SIID,
  DEFAULT_OFFICE_ID,
  detectOfficeIdMismatch,
  slugifyItinerary,
} from "./normalize";
import { staticValidateLink } from "./validate";
import type { PackageLookupResult } from "./package-lookup";

/**
 * Resolves cruise facts into ranked Odysseus package candidates. Injected so the
 * broker stays free of any Playwright/Odysseus import (Next-bundle safe). The
 * operator-run implementation is lookupOdysseusPackages in odysseus-lookup.ts.
 */
export type PackageLookupFn = (
  facts: LinkBrokerRequest["cruise"]
) => Promise<PackageLookupResult>;

export interface ResolveOptions {
  /** When false, the broker does not read/write the local cache (pure construction). */
  useCache?: boolean;
  /** Optional Odysseus package lookup, used when the request has no package ID. */
  packageLookup?: PackageLookupFn;
}

function buildRecord(
  request: LinkBrokerRequest,
  url: string,
  linkClass: LinkBrokerLinkClass,
  setupHash: string
): LinkBrokerRecord {
  const siid = request.agent.siid;
  const packageId = request.cruise.packageId as string;
  const nowIso = new Date().toISOString();
  const setup = request.travelerSetup ?? {};
  const key: BrokerCacheKey = { packageId, siid, linkClass, travelerSetupHash: setupHash };

  return {
    id: buildBrokerRecordId(key),
    packageId,
    siid,
    linkClass,
    url,
    urlHash: hashUrl(url),
    source: "constructed",
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    health: {
      status: "unknown",
      failureReason: "Constructed link not yet browser-validated (Phase 3).",
    },
    cruiseFingerprint: {
      cruiseLine: request.cruise.cruiseLine,
      shipName: request.cruise.shipName,
      itineraryName: request.cruise.itineraryName,
      sailDateIso: request.cruise.sailDate,
      nights: request.cruise.nights,
      departurePort: request.cruise.departurePort,
    },
    parameterSummary: {
      passengerCount: setup.passengerCount,
      ageCount: setup.ages?.length,
      state: setup.state,
      airportCode: setup.airportCode,
      officeId: request.agent.officeId ?? DEFAULT_OFFICE_ID,
      hasPhone: Boolean(setup.phone),
      hasCloneBookingToken: Boolean(request.cloneBookingToken),
      hasBookingReference: Boolean(request.bookingReference),
    },
  };
}

export async function resolveBestBookingLink(
  request: LinkBrokerRequest,
  options: ResolveOptions = {}
): Promise<LinkBrokerOutput> {
  const useCache = options.useCache ?? true;
  const siid = request.agent.siid?.trim() || DEFAULT_AGENT_SIID;
  const normalizedRequest: LinkBrokerRequest = {
    ...request,
    agent: { ...request.agent, siid },
    preference: { ...DEFAULT_LINK_BROKER_PREFERENCE, ...request.preference },
  };

  const warnings: string[] = [];
  let activeRequest = normalizedRequest;
  let choice = chooseBrokerLinkClass(activeRequest);

  // No package ID and no portal token -> Phase 6 lookup. If a lookup is injected,
  // resolve the package now and re-run the choice; otherwise report the gap.
  if (!choice.linkClass) {
    if (options.packageLookup) {
      const lookup = await options.packageLookup(activeRequest.cruise);
      warnings.push(...lookup.diagnostics);

      if (lookup.status === "confident_match" && lookup.selected) {
        activeRequest = {
          ...activeRequest,
          cruise: { ...activeRequest.cruise, packageId: lookup.selected.packageId },
        };
        warnings.push(
          `Resolved package ${lookup.selected.packageId} from "${lookup.selected.cruiseName}" ` +
            `(confidence ${lookup.selected.confidence.toFixed(2)}).`
        );
        choice = chooseBrokerLinkClass(activeRequest);
      } else {
        // No confident package: surface ranked candidates for operator review.
        return {
          status: lookup.status === "ambiguous" ? "needs_operator_capture" : "needs_package_lookup",
          linkClass: "package_entry",
          siid,
          resolvedCruise: {
            cruiseLine: activeRequest.cruise.cruiseLine,
            shipName: activeRequest.cruise.shipName,
            sailDate: activeRequest.cruise.sailDate,
            nights: activeRequest.cruise.nights,
            itineraryName: activeRequest.cruise.itineraryName,
            departurePort: activeRequest.cruise.departurePort,
          },
          missingInputs: ["packageId"],
          warnings: [
            ...warnings,
            ...lookup.candidates
              .slice(0, 5)
              .map(
                (c) =>
                  `candidate pkg ${c.packageId}: ${c.cruiseName} ` +
                  `(${c.sailDateIso}${c.nights ? `, ${c.nights}n` : ""}, conf ${c.confidence.toFixed(2)})`
              ),
          ],
          decision: {
            selectedLinkClass: "none",
            reason:
              lookup.status === "ambiguous"
                ? "multiple plausible packages; operator review required"
                : "no package found for the supplied cruise facts",
            alternativesConsidered: choice.alternativesConsidered,
          },
        };
      }
    } else {
      return {
        status: "needs_package_lookup",
        linkClass: "package_entry",
        siid,
        resolvedCruise: {
          cruiseLine: request.cruise.cruiseLine,
          shipName: request.cruise.shipName,
          sailDate: request.cruise.sailDate,
          nights: request.cruise.nights,
          itineraryName: request.cruise.itineraryName,
          departurePort: request.cruise.departurePort,
        },
        missingInputs: ["packageId"],
        warnings,
        decision: {
          selectedLinkClass: "none",
          reason: choice.reason,
          alternativesConsidered: choice.alternativesConsidered,
        },
      };
    }
  }

  // After an optional lookup, a class is guaranteed (a packageId yields one).
  const selectedClass = choice.linkClass;
  if (!selectedClass) {
    return {
      status: "needs_package_lookup",
      linkClass: "package_entry",
      siid,
      missingInputs: ["packageId"],
      warnings,
      decision: {
        selectedLinkClass: "none",
        reason: choice.reason,
        alternativesConsidered: choice.alternativesConsidered,
      },
    };
  }

  // Captured clone/cabin classes require a portal token + fresh capture. Phase 2
  // does not capture; surface the operator-capture requirement.
  if (selectedClass === "captured_clone" || selectedClass === "captured_cabin") {
    return {
      status: "needs_operator_capture",
      linkClass: selectedClass,
      packageId: activeRequest.cruise.packageId,
      siid,
      missingInputs: [],
      warnings: [
        ...warnings,
        "Captured clone/cabin links require fresh portal capture and validation (Phase 6).",
      ],
      decision: {
        selectedLinkClass: selectedClass,
        reason: choice.reason,
        alternativesConsidered: choice.alternativesConsidered,
      },
    };
  }

  const packageId = activeRequest.cruise.packageId as string;
  const setup = activeRequest.travelerSetup ?? {};
  const officeId = activeRequest.agent.officeId?.trim() || DEFAULT_OFFICE_ID;

  // officeId varies per package/vendor. If the caller supplied one that differs
  // from our default, surface a review note instead of silently trusting it.
  const officeIdWarning = detectOfficeIdMismatch(request.agent.officeId?.trim(), DEFAULT_OFFICE_ID);
  if (officeIdWarning) {
    warnings.push(officeIdWarning);
  }

  const setupHash = travelerSetupHash({
    passengerCount: setup.passengerCount,
    ages: setup.ages,
    state: setup.state,
    airportCode: setup.airportCode,
    officeId,
  });

  // Cache hit short-circuit.
  if (useCache) {
    const cached = getCachedBrokerLink({
      packageId,
      siid,
      linkClass: selectedClass,
      travelerSetupHash: selectedClass === "prepared_details" ? setupHash : "",
    });
    if (cached) {
      return {
        status: cached.health.status === "valid" ? "ready" : "needs_validation",
        linkClass: cached.linkClass,
        url: cached.url,
        packageId: cached.packageId,
        siid: cached.siid,
        missingInputs: [],
        warnings: [...warnings, "Returned from cache."],
        decision: {
          selectedLinkClass: cached.linkClass,
          reason: "cache hit for package/siid/class/setup",
          alternativesConsidered: choice.alternativesConsidered,
        },
        health: cached.health,
      };
    }
  }

  // Build the chosen class.
  let url: string;
  if (selectedClass === "prepared_details") {
    url = buildPreparedDetailsLink({
      packageId,
      siid,
      officeId,
      passengerCount: setup.passengerCount as number,
      ages: setup.ages as number[],
      state: setup.state as string,
      airportCode: setup.airportCode as string,
      phone: setup.phone,
    });
  } else {
    url = buildPackageEntryLink({
      packageId,
      siid,
      slug: slugifyItinerary(activeRequest.cruise.itineraryName),
    });
  }

  // Static validation gate.
  const validation = staticValidateLink(url, selectedClass, { constructed: true });
  warnings.push(...validation.warnings);
  if (!validation.ok) {
    return {
      status: "invalid",
      linkClass: selectedClass,
      url,
      packageId,
      siid,
      missingInputs: choice.missingForPreparedDetails,
      warnings: [...warnings, ...validation.errors],
      decision: {
        selectedLinkClass: selectedClass,
        reason: choice.reason,
        alternativesConsidered: choice.alternativesConsidered,
      },
      health: { status: "broken", failureReason: validation.errors.join("; ") },
    };
  }

  const record = buildRecord(activeRequest, url, selectedClass, setupHash);
  if (useCache) {
    upsertBrokerLink(record);
  }

  // If the caller wanted prepared details but setup was incomplete, we returned
  // a safe package entry link; tell them what to supply to upgrade.
  const downgraded =
    selectedClass === "package_entry" && choice.missingForPreparedDetails.length > 0;

  return {
    status: downgraded ? "found_package_needs_inputs" : "needs_validation",
    linkClass: selectedClass,
    url,
    packageId,
    siid,
    missingInputs: downgraded ? choice.missingForPreparedDetails : [],
    warnings,
    decision: {
      selectedLinkClass: selectedClass,
      reason: choice.reason,
      alternativesConsidered: choice.alternativesConsidered,
    },
    health: record.health,
  };
}

/**
 * Forces a rebuild of a link, ignoring any cache hit. Browser re-validation lands
 * in Phase 3; for now this re-constructs and re-runs static validation.
 */
export async function refreshBookingLink(
  request: LinkBrokerRequest
): Promise<LinkBrokerOutput> {
  return resolveBestBookingLink(
    { ...request, intent: "refresh_existing_link" },
    { useCache: false }
  );
}
