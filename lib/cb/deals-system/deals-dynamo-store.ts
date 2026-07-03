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
import type { DealFunnelSynthesis } from "./deal-page-design-types";
import type { DealMetaAdSynthesis } from "./deal-meta-ad-synthesis-types";
import type { CbPromoIntelligenceRecord } from "./promo-intelligence-types";

const TABLE_NAME = process.env.DEALS_SYSTEM_TABLE_NAME ?? "lll-deals-system";
const SK = "METADATA";

function isMissingTableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error.name === "ResourceNotFoundException") ||
      error.message.includes("Requested resource not found"))
  );
}

async function getItem<T>(pk: string): Promise<T | null> {
  try {
    const response = await chatDynamoDocumentClient.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { PK: pk, SK } })
    );
    if (!response.Item) return null;
    const { PK, SK: _sk, ...data } = response.Item;
    void PK;
    void _sk;
    return data as T;
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
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
  } catch (error) {
    console.error(`[deals-dynamo-store] Failed to delete ${pk}:`, error);
    throw error;
  }
}

/** Paginated scan for every item whose PK starts with `prefix` and SK === METADATA. */
async function scanByPrefix<T>(prefix: string): Promise<T[]> {
  try {
    const items: T[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    do {
      const response = await chatDynamoDocumentClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: "begins_with(PK, :pfx) AND SK = :sk",
          ExpressionAttributeValues: { ":pfx": prefix, ":sk": SK },
          ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
        })
      );

      for (const item of response.Items ?? []) {
        const { PK, SK: _sk, ...data } = item as Record<string, unknown>;
        void PK;
        void _sk;
        items.push(data as T);
      }
      lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastEvaluatedKey);

    return items;
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
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

// ── Deal Trip Manifests ──────────────────────────────────────────────────────

export async function getDealTripManifest(id: string): Promise<DealTripManifest | null> {
  return getItem<DealTripManifest>(`MANIFEST#${id}`);
}

export async function listDealTripManifests(): Promise<DealTripManifest[]> {
  return scanByPrefix<DealTripManifest>("MANIFEST#");
}

export async function upsertDealTripManifestRecord(manifest: DealTripManifest): Promise<void> {
  return putItem(`MANIFEST#${manifest.id}`, manifest);
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
