import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { chatDynamoDocumentClient } from "@/lib/chat/dynamo-client";
import { StoredCbDealsPayload } from "@/lib/cb/cb-deal-types";

const APP_CACHE_TABLE_NAME = process.env.APP_CACHE_TABLE_NAME ?? "lll-app-cache";
const CB_DEALS_PK = "CB_DEALS";
const CB_DEALS_SK = "LATEST";
const CB_DEALS_TTL_SECONDS = 60 * 60 * 24 * 30;
const CB_DEALS_TTL_MS = CB_DEALS_TTL_SECONDS * 1000;

let localCbDealsCache: { payload: StoredCbDealsPayload | null; expiresAt: number } = {
  payload: null,
  expiresAt: 0,
};

let cbDealsDbEnabled = true;
let cbDealsWarningLogged = false;

function shouldSkipCbDealsDbAccess(): boolean {
  if (!cbDealsDbEnabled) {
    if (!cbDealsWarningLogged) {
      console.warn("CB deals cache backend disabled, skipping DynamoDB reads/writes");
      cbDealsWarningLogged = true;
    }
    return true;
  }

  return false;
}

function disableCbDealsDbAccess(error: unknown): void {
  cbDealsDbEnabled = false;
  if (!cbDealsWarningLogged) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Disabling CB deals cache backend after DynamoDB error:", message);
    cbDealsWarningLogged = true;
  }
}

function getLocalCbDealsCache(): StoredCbDealsPayload | null {
  if (!localCbDealsCache.payload) {
    return null;
  }

  if (localCbDealsCache.expiresAt <= Date.now()) {
    localCbDealsCache = { payload: null, expiresAt: 0 };
    return null;
  }

  return localCbDealsCache.payload;
}

function setLocalCbDealsCache(payload: StoredCbDealsPayload): void {
  localCbDealsCache = {
    payload,
    expiresAt: Date.now() + CB_DEALS_TTL_MS,
  };
}

function isStoredCbDealsPayload(value: unknown): value is StoredCbDealsPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as StoredCbDealsPayload;
  return (
    typeof candidate.generatedAtIso === "string" &&
    Array.isArray(candidate.picks) &&
    Array.isArray(candidate.homepageDeals)
  );
}

export async function getStoredCbDeals(): Promise<StoredCbDealsPayload | null> {
  const localPayload = getLocalCbDealsCache();
  if (localPayload) {
    return localPayload;
  }

  if (shouldSkipCbDealsDbAccess()) {
    return null;
  }

  try {
    const response = await chatDynamoDocumentClient.send(
      new GetCommand({
        TableName: APP_CACHE_TABLE_NAME,
        Key: {
          PK: CB_DEALS_PK,
          SK: CB_DEALS_SK,
        },
      })
    );

    if (!isStoredCbDealsPayload(response.Item)) {
      return null;
    }

    setLocalCbDealsCache(response.Item);
    return response.Item;
  } catch (error) {
    disableCbDealsDbAccess(error);
    return null;
  }
}

export async function storeCbDeals(payload: StoredCbDealsPayload): Promise<void> {
  setLocalCbDealsCache(payload);

  if (shouldSkipCbDealsDbAccess()) {
    return;
  }

  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ttl = nowSeconds + CB_DEALS_TTL_SECONDS;
    const timestamp = new Date().toISOString();

    await chatDynamoDocumentClient.send(
      new PutCommand({
        TableName: APP_CACHE_TABLE_NAME,
        Item: {
          PK: CB_DEALS_PK,
          SK: CB_DEALS_SK,
          cacheType: "cb_deals_payload",
          version: payload.version,
          generatedAtIso: payload.generatedAtIso,
          source: payload.source,
          picks: payload.picks,
          homepageDeals: payload.homepageDeals,
          updatedAt: timestamp,
          createdAt: timestamp,
          ttl,
        },
      })
    );
  } catch (error) {
    disableCbDealsDbAccess(error);
  }
}