/**
 * Link Broker local development cache.
 *
 * Reads/writes `.github/data/cb-link-broker-cache.json` (the Phase 1 file).
 * Lookup is keyed by package ID + siid + link class + a traveler-setup hash so
 * the broker can avoid repeating expensive work. Production storage (Dynamo) is
 * a later phase; this keeps the same record shape so the swap is mechanical.
 *
 * Phone numbers are never written here — the parameter summary only records
 * `hasPhone`. Records tied to a specific lead/request belong in the callback
 * cache, not this generic link cache.
 */

import { createHash } from "crypto";
import * as fs from "fs";

import { DEALS_CACHE_PATHS } from "@/lib/cb/deals-system/caches";
import { emptyLinkBrokerCache } from "@/lib/cb/deals-system/caches";
import { validateLinkBrokerCache } from "@/lib/cb/deals-system/validate";
import type {
  LinkBrokerCache,
  LinkBrokerLinkClass,
  LinkBrokerRecord,
} from "@/lib/cb/deals-system/link-broker-types";

const CACHE_PATH = DEALS_CACHE_PATHS.linkBroker;

export interface BrokerCacheKey {
  packageId: string;
  siid: string;
  linkClass: LinkBrokerLinkClass;
  travelerSetupHash?: string;
}

/** Stable hash of the traveler-setup inputs that change a prepared link. */
export function travelerSetupHash(input: {
  passengerCount?: number;
  ages?: number[];
  state?: string;
  airportCode?: string;
  officeId?: string;
}): string {
  const normalized = JSON.stringify({
    passengerCount: input.passengerCount ?? null,
    ages: input.ages ? [...input.ages].sort((a, b) => a - b) : null,
    state: input.state ?? null,
    airportCode: input.airportCode ?? null,
    officeId: input.officeId ?? null,
  });
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 24);
}

export function loadLinkBrokerCache(): LinkBrokerCache {
  if (!fs.existsSync(CACHE_PATH)) {
    return emptyLinkBrokerCache();
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    const result = validateLinkBrokerCache(raw);
    return result.ok && result.value ? result.value : emptyLinkBrokerCache();
  } catch {
    return emptyLinkBrokerCache();
  }
}

export function saveLinkBrokerCache(cache: LinkBrokerCache): void {
  cache.generatedAtIso = new Date().toISOString();
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

function recordKey(record: LinkBrokerRecord): string {
  const hash = record.id.includes("::") ? record.id.split("::").pop() : "";
  return `${record.packageId}|${record.siid}|${record.linkClass}|${hash ?? ""}`;
}

function lookupKey(key: BrokerCacheKey): string {
  return `${key.packageId}|${key.siid}|${key.linkClass}|${key.travelerSetupHash ?? ""}`;
}

export function getCachedBrokerLink(
  key: BrokerCacheKey,
  cache: LinkBrokerCache = loadLinkBrokerCache()
): LinkBrokerRecord | undefined {
  const wanted = lookupKey(key);
  return cache.records.find((record) => recordKey(record) === wanted);
}

/**
 * Inserts or replaces a record (matched on package/siid/class/setup-hash).
 * Returns the stored record.
 *
 * Persistence is opt-in via `options.persist` (default true). Pass an explicit
 * in-memory `cache` with `persist: false` to mutate it without writing to disk —
 * used by tests and by callers that batch writes themselves.
 */
export function upsertBrokerLink(
  record: LinkBrokerRecord,
  cache: LinkBrokerCache = loadLinkBrokerCache(),
  options: { persist?: boolean } = {}
): LinkBrokerRecord {
  const persist = options.persist ?? true;
  const wanted = recordKey(record);
  const index = cache.records.findIndex((existing) => recordKey(existing) === wanted);
  if (index >= 0) {
    cache.records[index] = record;
  } else {
    cache.records.push(record);
  }
  if (persist) {
    saveLinkBrokerCache(cache);
  }
  return record;
}

/** Builds a deterministic record ID that encodes the cache key (setup hash last). */
export function buildBrokerRecordId(key: BrokerCacheKey): string {
  return `${key.linkClass}::${key.packageId}::${key.siid}::${key.travelerSetupHash ?? ""}`;
}
