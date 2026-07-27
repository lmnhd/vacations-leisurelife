import {
  GetItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
} from "@aws-sdk/client-dynamodb";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  parseResumeTokenItem,
  serializeDraftResumePointerItem,
  serializeResumeTokenItem,
} from "./store";
import type { DraftStoreConfig } from "./store";
import type { DraftResumePointerItem, ResumeTokenItem } from "./types";

export const BOOKING_GUEST_SESSION_COOKIE = "lll_booking_guest_session";

const SESSION_PREFIX = "bas1";
const RESUME_TOKEN_PREFIX = "bat1";

export interface GuestSessionCookiePayload {
  draftId: string;
  personId: string;
  issuedAtIso: string;
  expiresAtIso: string;
}

export interface IssuedResumeToken {
  token: string;
  expiresAtIso: string;
}

export interface ConsumedResumeToken {
  draftId: string;
  personId: string;
  redirectDealId: string;
  expiresAtIso: string;
}

function getSessionSecret(): string {
  const secret =
    process.env.BOOKING_ASSISTANT_SESSION_HMAC_SECRET ??
    process.env.BOOKING_ASSISTANT_CALL_KEY_HMAC_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "BOOKING_ASSISTANT_SESSION_HMAC_SECRET is not configured with at least 32 characters"
    );
  }
  return secret;
}

function signParts(prefix: string, payload: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(`${prefix}.${payload}`)
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(new Uint8Array(leftBuffer), new Uint8Array(rightBuffer));
}

function splitSignedValue(value: string): { prefix: string; payload: string; signature: string } | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [prefix, payload, signature] = parts;
  if (!prefix || !payload || !signature) return null;
  return { prefix, payload, signature };
}

function encodeSignedValue(prefix: string, payload: object): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signParts(prefix, body);
  return `${prefix}.${body}.${signature}`;
}

function decodeSignedValue<T>(value: string, expectedPrefix: string): T | null {
  const parts = splitSignedValue(value);
  if (!parts || parts.prefix !== expectedPrefix) return null;
  const expectedSignature = signParts(parts.prefix, parts.payload);
  if (!safeEqual(parts.signature, expectedSignature)) return null;
  try {
    return JSON.parse(Buffer.from(parts.payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function resumeTokenPk(tokenHash: string): string {
  return `RESUMETOKEN#${tokenHash}`;
}

function draftResumePointerPk(draftId: string): string {
  return `DRAFT#${draftId}`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function ttlEpochSecondsFromIso(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

export function createGuestSessionCookieValue(payload: GuestSessionCookiePayload): string {
  return encodeSignedValue(SESSION_PREFIX, payload);
}

export function parseGuestSessionCookieValue(rawValue: string): GuestSessionCookiePayload | null {
  const payload = decodeSignedValue<GuestSessionCookiePayload>(rawValue, SESSION_PREFIX);
  if (!payload) return null;
  if (Date.parse(payload.expiresAtIso) <= Date.now()) return null;
  return payload;
}

export async function issueResumeToken(
  dynamo: DynamoDBClient,
  config: DraftStoreConfig,
  input: {
    draftId: string;
    personId: string;
    redirectDealId: string;
    ttlSeconds: number;
  }
): Promise<IssuedResumeToken> {
  const issuedAtIso = new Date().toISOString();
  const expiresAtIso = new Date(Date.now() + input.ttlSeconds * 1000).toISOString();
  const entropy = randomBytes(24).toString("base64url");
  const token = encodeSignedValue(RESUME_TOKEN_PREFIX, {
    entropy,
    issuedAtIso,
    expiresAtIso,
  });
  const tokenHash = hashToken(token);
  const ttlEpochSeconds = ttlEpochSecondsFromIso(expiresAtIso);

  const tokenItem: ResumeTokenItem = {
    pk: resumeTokenPk(tokenHash),
    sk: "TOKEN",
    draftId: input.draftId,
    personId: input.personId,
    redirectDealId: input.redirectDealId,
    tokenHash,
    state: "active",
    issuedAtIso,
    expiresAtIso,
    ttlEpochSeconds,
  };

  const pointerItem: DraftResumePointerItem = {
    pk: draftResumePointerPk(input.draftId),
    sk: "RESUME_ACTIVE",
    tokenHash,
    expiresAtIso,
    updatedAtIso: issuedAtIso,
    ttlEpochSeconds,
  };

  await dynamo.send(
    new TransactWriteItemsCommand({
      TransactItems: [
        {
          Put: {
            TableName: config.tableName,
            Item: serializeResumeTokenItem(tokenItem) as never,
            ConditionExpression: "attribute_not_exists(PK)",
          },
        },
        {
          Put: {
            TableName: config.tableName,
            Item: serializeDraftResumePointerItem(pointerItem) as never,
          },
        },
      ],
    })
  );

  return { token, expiresAtIso };
}

export async function consumeResumeToken(
  dynamo: DynamoDBClient,
  config: DraftStoreConfig,
  rawToken: string
): Promise<ConsumedResumeToken | null> {
  const decoded = decodeSignedValue<{ entropy: string; issuedAtIso: string; expiresAtIso: string }>(
    rawToken,
    RESUME_TOKEN_PREFIX
  );
  if (!decoded) return null;
  if (Date.parse(decoded.expiresAtIso) <= Date.now()) return null;

  const tokenHash = hashToken(rawToken);
  const lookup = await dynamo.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: {
        ":pk": { S: resumeTokenPk(tokenHash) },
      },
      Limit: 1,
    })
  );

  if (!lookup.Items || lookup.Items.length === 0) return null;
  const tokenItem = parseResumeTokenItem(lookup.Items[0] as Record<string, unknown>);
  if (tokenItem.state !== "active" || tokenItem.expiresAtIso !== decoded.expiresAtIso) {
    return null;
  }
  if (Date.parse(tokenItem.expiresAtIso) <= Date.now()) return null;

  const pointer = await dynamo.send(
    new GetItemCommand({
      TableName: config.tableName,
      Key: {
        PK: { S: draftResumePointerPk(tokenItem.draftId) },
        SK: { S: "RESUME_ACTIVE" },
      },
    })
  );

  const activeTokenHash = (pointer.Item?.tokenHash as { S?: string })?.S ?? "";
  if (!activeTokenHash || activeTokenHash !== tokenHash) return null;

  const consumedAtIso = new Date().toISOString();
  await dynamo.send(
    new TransactWriteItemsCommand({
      TransactItems: [
        {
          Update: {
            TableName: config.tableName,
            Key: {
              PK: { S: resumeTokenPk(tokenHash) },
              SK: { S: "TOKEN" },
            },
            UpdateExpression: "SET #state = :consumed, consumedAtIso = :consumedAtIso",
            ConditionExpression: "#state = :active",
            ExpressionAttributeNames: {
              "#state": "state",
            },
            ExpressionAttributeValues: {
              ":active": { S: "active" },
              ":consumed": { S: "consumed" },
              ":consumedAtIso": { S: consumedAtIso },
            },
          },
        },
        {
          Delete: {
            TableName: config.tableName,
            Key: {
              PK: { S: draftResumePointerPk(tokenItem.draftId) },
              SK: { S: "RESUME_ACTIVE" },
            },
            ConditionExpression: "tokenHash = :tokenHash",
            ExpressionAttributeValues: {
              ":tokenHash": { S: tokenHash },
            },
          },
        },
      ],
    })
  );

  return {
    draftId: tokenItem.draftId,
    personId: tokenItem.personId,
    redirectDealId: tokenItem.redirectDealId,
    expiresAtIso: tokenItem.expiresAtIso,
  };
}
