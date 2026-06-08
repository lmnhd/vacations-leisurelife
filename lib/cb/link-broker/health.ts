/**
 * Link health rules (pure, dependency-free).
 *
 * Determines `valid` / `stale` / `broken` / `unknown` and the verification
 * schedule timestamps. No Playwright/network here — browser-aware checking lives
 * in browser-validate.ts (operator-run). These helpers run anywhere: scripts,
 * the Next runtime, and tests.
 *
 * Health model (per CB_AGENT_TOOLS_PROMO_INTELLIGENCE_PLAN / ODYSSEUS_LINK_BROKER_PLAN):
 *   - unknown : never verified, or verification was inconclusive
 *   - valid   : last verification passed and the link is still fresh
 *   - stale   : last verification passed but is older than the freshness window
 *   - broken  : last verification failed (package not found / malformed)
 */

import { staticValidateLink } from "./validate";
import type {
  LinkBrokerHealth,
  LinkBrokerLinkClass,
} from "./types";

/** Default freshness window: a verified link is "stale" after this many hours. */
export const DEFAULT_FRESHNESS_HOURS = 24;

const MS_PER_HOUR = 60 * 60 * 1000;

export function addHoursIso(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * MS_PER_HOUR).toISOString();
}

/**
 * Returns true when a link verified at `lastVerifiedAtIso` is now older than the
 * freshness window (and therefore stale).
 */
export function isStale(
  lastVerifiedAtIso: string | undefined,
  freshnessHours: number = DEFAULT_FRESHNESS_HOURS,
  nowIso: string = new Date().toISOString()
): boolean {
  if (!lastVerifiedAtIso) return false;
  const dueIso = addHoursIso(lastVerifiedAtIso, freshnessHours);
  return new Date(nowIso).getTime() > new Date(dueIso).getTime();
}

/**
 * Builds a health record from a verification outcome. `passed === undefined`
 * means the check was inconclusive (-> unknown).
 */
export function computeHealth(input: {
  passed?: boolean;
  capturedAtIso?: string;
  verifiedAtIso?: string;
  failureReason?: string;
  freshnessHours?: number;
  nowIso?: string;
}): LinkBrokerHealth {
  const freshnessHours = input.freshnessHours ?? DEFAULT_FRESHNESS_HOURS;
  const nowIso = input.nowIso ?? new Date().toISOString();

  if (input.passed === undefined) {
    return {
      status: "unknown",
      capturedAtIso: input.capturedAtIso,
      lastVerifiedAtIso: input.verifiedAtIso,
      failureReason: input.failureReason,
    };
  }

  if (!input.passed) {
    return {
      status: "broken",
      capturedAtIso: input.capturedAtIso,
      lastVerifiedAtIso: input.verifiedAtIso ?? nowIso,
      failureReason: input.failureReason ?? "Validation failed.",
    };
  }

  const verifiedAtIso = input.verifiedAtIso ?? nowIso;
  const nextVerificationDueIso = addHoursIso(verifiedAtIso, freshnessHours);
  const stale = isStale(verifiedAtIso, freshnessHours, nowIso);

  return {
    status: stale ? "stale" : "valid",
    capturedAtIso: input.capturedAtIso,
    lastVerifiedAtIso: verifiedAtIso,
    nextVerificationDueIso,
    failureReason: stale ? "Past freshness window; re-verification due." : undefined,
  };
}

/**
 * Re-evaluates an existing health record against the clock without re-running a
 * browser check: a `valid` link that has aged out flips to `stale`. Other
 * statuses pass through unchanged.
 */
export function refreshHealthStaleness(
  health: LinkBrokerHealth,
  freshnessHours: number = DEFAULT_FRESHNESS_HOURS,
  nowIso: string = new Date().toISOString()
): LinkBrokerHealth {
  if (health.status !== "valid") return health;
  if (!isStale(health.lastVerifiedAtIso, freshnessHours, nowIso)) return health;
  return {
    ...health,
    status: "stale",
    failureReason: "Past freshness window; re-verification due.",
  };
}

/**
 * Static-only health: labels `broken` when the URL fails static validation,
 * otherwise `unknown` (a clean static check cannot prove the package is live —
 * that needs the browser validator). Useful in the Next runtime where launching
 * a browser is not appropriate.
 */
export function staticHealth(
  url: string,
  expectedClass: LinkBrokerLinkClass,
  options: { constructed?: boolean; capturedAtIso?: string } = {}
): LinkBrokerHealth {
  const result = staticValidateLink(url, expectedClass, {
    constructed: options.constructed,
  });
  if (!result.ok) {
    return {
      status: "broken",
      capturedAtIso: options.capturedAtIso,
      failureReason: result.errors.join("; "),
    };
  }
  return {
    status: "unknown",
    capturedAtIso: options.capturedAtIso,
    failureReason: "Static validation passed; live package state not yet verified.",
  };
}
