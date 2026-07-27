/**
 * DynamoDB-backed store for the 4 deals-system caches that sit on the PUBLIC
 * read path (curated deals + briefs, trip manifests, funnel syntheses, promo
 * intelligence records). Per-entity keys in a dedicated table, mirroring
 * lib/campaigns/campaign-store.ts, so an operator publish/approve action is
 * visible on /deals/[id] and the homepage immediately — no redeploy.
 *
 * The other 5 deals-system caches (discovery ideas, unified manifests, ad
 * copy, link broker, callback requests) are operator-only build tooling and
 * remain local JSON; they are not part of this store.
 */

import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

import { chatDynamoDocumentClient } from "@/lib/chat/dynamo-client";

import type { CuratedOdysseusDeal, OdysseusDealBrief } from "./curated-deal-types";
import type { DealTripManifest } from "./deal-trip-manifest-types";
import { manifestsBelongToSameDealCampaign } from "./deal-trip-manifest-identity";
import type { DealFunnelSynthesis } from "./deal-page-design-types";
import type { DealMetaAdSynthesis } from "./deal-meta-ad-synthesis-types";
import type { CbPromoIntelligenceRecord } from "./promo-intelligence-types";

const TABLE_NAME = process.env.DEALS_SYSTEM_TABLE_NAME ?? "lll-deals-system";
const SK = "METADATA";

// ── Read-through cache ────────────────────────────────────────────────────────
// scanByPrefix is a full-table Scan: DynamoDB bills for EVERY item in the
// table on every call, and the public /deals pages (force-dynamic, fed by paid
// ad traffic) issue several per page view. Measured 2026-07-04: ~28M consumed
// RCUs in 14 days on lll-deals-system — ~99% redundant re-reads of a 3.7MB
// dataset that changes a few times a day. This short-TTL in-process cache
// collapses that to at most one scan per entity type per TTL window per warm
// server instance. Any write through this module clears the cache, so
// operator flows read their own writes immediately; cross-instance staleness
// is bounded by the TTL.
//   DEALS_STORE_CACHE_TTL_MS: override the window (default 60s; "0" disables).
const CACHE_TTL_MS = Number(process.env.DEALS_STORE_CACHE_TTL_MS ?? "60000");
const readCache = new Map<string, { at: number; value: unknown }>();

function cacheGet<T>(key: string): T | undefined {
  if (CACHE_TTL_MS <= 0) return undefined;
  const hit = readCache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    // Keep the entry so it can serve as a stale fallback if a refresh throttles;
    // it's only overwritten by a successful read or dropped by an explicit clear.
    return undefined;
  }
  return hit.value as T;
}

/** Last cached value regardless of age — the stale fallback when a live read fails. */
function cacheGetStale<T>(key: string): T | undefined {
  const hit = readCache.get(key);
  return hit ? (hit.value as T) : undefined;
}

function cacheSet(key: string, value: unknown): void {
  if (CACHE_TTL_MS <= 0) return;
  readCache.set(key, { at: Date.now(), value });
}

/** Drop every cached read. Called on any write through this module; exported
 * for scripts/tests that mutate the table out-of-band. */
export function clearDealsStoreReadCache(): void {
  readCache.clear();
}

function isMissingTableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error.name === "ResourceNotFoundException") ||
      error.message.includes("Requested resource not found"))
  );
}

function isThrottlingError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "ThrottlingException" ||
    error.name === "ProvisionedThroughputExceededException" ||
    error.name === "RequestLimitExceeded" ||
    /throughput exceeds|throttl/i.test(error.message)
  );
}

const SCAN_MAX_ATTEMPTS = 5;

/**
 * Send a DynamoDB command, retrying on throttling with exponential backoff +
 * jitter. On-demand tables auto-scale but reject bursts while they ramp; a full
 * table Scan is the heaviest single call we make, so it's the most likely to be
 * throttled. Retrying here (rather than letting the error propagate) keeps the
 * public deal pages and the operator dashboard rendering through a transient
 * capacity dip instead of erroring out.
 */
async function sendWithThrottleRetry<T>(send: () => Promise<T>, label: string): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await send();
    } catch (error) {
      attempt += 1;
      if (!isThrottlingError(error) || attempt >= SCAN_MAX_ATTEMPTS) throw error;
      // 200ms, 400ms, 800ms, 1600ms … plus up to 100ms jitter.
      const backoff = 200 * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);
      console.warn(
        `[deals-dynamo-store] ${label} throttled (attempt ${attempt}/${SCAN_MAX_ATTEMPTS}); retrying in ${backoff}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}

async function getItem<T>(pk: string): Promise<T | null> {
  const cached = cacheGet<T | null>(`get:${pk}`);
  if (cached !== undefined) return cached;
  try {
    const response = await sendWithThrottleRetry(
      () => chatDynamoDocumentClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: pk, SK } })),
      `get ${pk}`
    );
    if (!response.Item) {
      cacheSet(`get:${pk}`, null);
      return null;
    }
    const { PK, SK: _sk, ...data } = response.Item;
    void PK;
    void _sk;
    cacheSet(`get:${pk}`, data);
    return data as T;
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    // Throttled past retries: serve the last good read (even if expired) so a
    // capacity dip doesn't 404 a real deal on a paid-traffic landing page.
    if (isThrottlingError(error)) {
      const stale = cacheGetStale<T | null>(`get:${pk}`);
      if (stale !== undefined) {
        console.warn(`[deals-dynamo-store] get ${pk} throttled after retries; serving stale cache`);
        return stale;
      }
    }
    console.error(`[deals-dynamo-store] Failed to get ${pk}:`, error);
    throw error;
  }
}

async function putItem<T extends object>(pk: string, entity: T): Promise<void> {
  try {
    await chatDynamoDocumentClient.send(
      new PutCommand({ TableName: TABLE_NAME, Item: { PK: pk, SK, ...(entity as Record<string, unknown>) } })
    );
    clearDealsStoreReadCache();
  } catch (error) {
    console.error(`[deals-dynamo-store] Failed to put ${pk}:`, error);
    throw error;
  }
}

async function deleteItem(pk: string): Promise<void> {
  try {
    await chatDynamoDocumentClient.send(
      new DeleteCommand({ TableName: TABLE_NAME, Key: { PK: pk, SK } })
    );
    clearDealsStoreReadCache();
  } catch (error) {
    console.error(`[deals-dynamo-store] Failed to delete ${pk}:`, error);
    throw error;
  }
}

/** Paginated scan for every item whose PK starts with `prefix` and SK === METADATA. */
async function scanByPrefix<T>(prefix: string): Promise<T[]> {
  const cached = cacheGet<T[]>(`scan:${prefix}`);
  if (cached !== undefined) return cached;
  try {
    const items: T[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    do {
      const response = await sendWithThrottleRetry(
        () =>
          chatDynamoDocumentClient.send(
            new ScanCommand({
              TableName: TABLE_NAME,
              FilterExpression: "begins_with(PK, :pfx) AND SK = :sk",
              ExpressionAttributeValues: { ":pfx": prefix, ":sk": SK },
              ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
            })
          ),
        `scan ${prefix}`
      );

      for (const item of response.Items ?? []) {
        const { PK, SK: _sk, ...data } = item as Record<string, unknown>;
        void PK;
        void _sk;
        items.push(data as T);
      }
      lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastEvaluatedKey);

    cacheSet(`scan:${prefix}`, items);
    return items;
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    // Throttled past our retries: serve the last good scan (even if expired)
    // rather than throwing and breaking the page. Better a few-minutes-stale
    // deal list than a 500 on the homepage or a dead operator dashboard.
    if (isThrottlingError(error)) {
      const stale = cacheGetStale<T[]>(`scan:${prefix}`);
      if (stale !== undefined) {
        console.warn(
          `[deals-dynamo-store] scan ${prefix} throttled after retries; serving stale cache (${stale.length} items)`
        );
        return stale;
      }
    }
    console.error(`[deals-dynamo-store] Failed to scan prefix ${prefix}:`, error);
    throw error;
  }
}

// ── Curated Deals ────────────────────────────────────────────────────────────

export async function getCuratedDeal(id: string): Promise<CuratedOdysseusDeal | null> {
  return getItem<CuratedOdysseusDeal>(`DEAL#${id}`);
}

export async function listCuratedDeals(): Promise<CuratedOdysseusDeal[]> {
  return scanByPrefix<CuratedOdysseusDeal>("DEAL#");
}

export async function upsertCuratedDealRecord(deal: CuratedOdysseusDeal): Promise<void> {
  return putItem(`DEAL#${deal.id}`, deal);
}

export async function deleteCuratedDealRecord(id: string): Promise<void> {
  return deleteItem(`DEAL#${id}`);
}

// ── Odysseus Deal Briefs ─────────────────────────────────────────────────────

export async function getDealBrief(id: string): Promise<OdysseusDealBrief | null> {
  return getItem<OdysseusDealBrief>(`BRIEF#${id}`);
}

export async function listDealBriefs(): Promise<OdysseusDealBrief[]> {
  return scanByPrefix<OdysseusDealBrief>("BRIEF#");
}

export async function upsertDealBriefRecord(brief: OdysseusDealBrief): Promise<void> {
  return putItem(`BRIEF#${brief.id}`, brief);
}

/** Delete a deal brief by id (expired-deal cleanup). */
export async function deleteDealBriefRecord(id: string): Promise<void> {
  return deleteItem(`BRIEF#${id}`);
}

// ── Deal Trip Manifests ──────────────────────────────────────────────────────

export async function getDealTripManifest(id: string): Promise<DealTripManifest | null> {
  return getItem<DealTripManifest>(`MANIFEST#${id}`);
}

export async function listDealTripManifests(): Promise<DealTripManifest[]> {
  return scanByPrefix<DealTripManifest>("MANIFEST#");
}

export async function upsertDealTripManifestRecord(manifest: DealTripManifest): Promise<void> {
  const existingManifests = await listDealTripManifests();
  const supersededIds = existingManifests
    .filter(
      (existing) =>
        existing.id !== manifest.id &&
        manifestsBelongToSameDealCampaign(existing, manifest)
    )
    .map((existing) => existing.id);

  // Write the replacement first so a failed write never removes the currently
  // active campaign. Cleanup happens only after the new manifest is durable.
  await putItem(`MANIFEST#${manifest.id}`, manifest);
  for (const supersededId of supersededIds) {
    await deleteItem(`MANIFEST#${supersededId}`);
  }
}

export async function deleteDealTripManifestRecord(id: string): Promise<void> {
  return deleteItem(`MANIFEST#${id}`);
}

// ── Deal Funnel Syntheses ────────────────────────────────────────────────────

export async function getDealFunnelSynthesis(id: string): Promise<DealFunnelSynthesis | null> {
  return getItem<DealFunnelSynthesis>(`SYNTHESIS#${id}`);
}

export async function listDealFunnelSyntheses(): Promise<DealFunnelSynthesis[]> {
  return scanByPrefix<DealFunnelSynthesis>("SYNTHESIS#");
}

export async function upsertDealFunnelSynthesisRecord(
  synthesis: DealFunnelSynthesis
): Promise<void> {
  return putItem(`SYNTHESIS#${synthesis.id}`, synthesis);
}

/** Delete a funnel synthesis by id. Used by the id-format migration to remove
 * an old-id record after it has been re-written under its new id. */
export async function deleteDealFunnelSynthesisRecord(id: string): Promise<void> {
  return deleteItem(`SYNTHESIS#${id}`);
}

// ── Deal Meta Ad Syntheses (Step 8 — Meta carousel card images) ─────────────

export async function getDealMetaAdSynthesis(id: string): Promise<DealMetaAdSynthesis | null> {
  return getItem<DealMetaAdSynthesis>(`METAADSYNTH#${id}`);
}

export async function listDealMetaAdSyntheses(): Promise<DealMetaAdSynthesis[]> {
  return scanByPrefix<DealMetaAdSynthesis>("METAADSYNTH#");
}

export async function upsertDealMetaAdSynthesisRecord(
  synthesis: DealMetaAdSynthesis
): Promise<void> {
  return putItem(`METAADSYNTH#${synthesis.id}`, synthesis);
}

/** Delete a meta ad synthesis by id. Used by the id-format migration to remove
 * an old-id record after it has been re-written under its new id. */
export async function deleteDealMetaAdSynthesisRecord(id: string): Promise<void> {
  return deleteItem(`METAADSYNTH#${id}`);
}

// ── Promo Intelligence Records ───────────────────────────────────────────────

export async function getPromoRecord(id: string): Promise<CbPromoIntelligenceRecord | null> {
  return getItem<CbPromoIntelligenceRecord>(`PROMO#${id}`);
}

export async function listPromoRecords(): Promise<CbPromoIntelligenceRecord[]> {
  return scanByPrefix<CbPromoIntelligenceRecord>("PROMO#");
}

/** Fetch a small set of promo records by id (Promise.all; no BatchGetItem needed at this scale). */
export async function getPromoRecordsByIds(ids: string[]): Promise<CbPromoIntelligenceRecord[]> {
  const records = await Promise.all(ids.map((id) => getPromoRecord(id)));
  return records.filter((r): r is CbPromoIntelligenceRecord => r !== null);
}

export async function upsertPromoRecordEntry(record: CbPromoIntelligenceRecord): Promise<void> {
  return putItem(`PROMO#${record.id}`, record);
}
