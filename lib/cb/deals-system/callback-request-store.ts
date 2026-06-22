/**
 * DynamoDB-backed store for Agent Callback Requests.
 *
 * Replaces the previous local-JSON cache (`deal-callback-requests-cache.json`),
 * which could not work on serverless (no durable per-request FS writes) and
 * could not aggregate. Callbacks now live in the shared `lll-deals-system`
 * table under a dedicated partition so the operator dashboard reads real,
 * cross-instance history:
 *
 *   PK = CALLBACK#REQUESTS
 *   SK = CALLBACK#${createdAtIso}#${id}
 *
 * A single-partition design keeps the operator "list all callbacks" query a
 * cheap Query; volume here is low (human callback requests), so a hot partition
 * is not a concern.
 */

import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

import { chatDynamoDocumentClient } from "@/lib/chat/dynamo-client";

import type {
  AgentCallbackRequest,
  AgentCallbackStatus,
} from "./callback-request-types";

const TABLE_NAME = process.env.DEALS_SYSTEM_TABLE_NAME ?? "lll-deals-system";
const CALLBACK_PK = "CALLBACK#REQUESTS";

function skFor(request: Pick<AgentCallbackRequest, "id" | "createdAtIso">): string {
  return `CALLBACK#${request.createdAtIso}#${request.id}`;
}

function isMissingTableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "ResourceNotFoundException" ||
      error.message.includes("Requested resource not found"))
  );
}

/** Persist a new callback request. */
export async function appendCallbackRequest(request: AgentCallbackRequest): Promise<void> {
  await chatDynamoDocumentClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: CALLBACK_PK, SK: skFor(request), ...request },
    })
  );
}

/** List all callback requests, newest-first (operator dashboard order). */
export async function listAllCallbackRequests(): Promise<AgentCallbackRequest[]> {
  try {
    const response = await chatDynamoDocumentClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: { ":pk": CALLBACK_PK, ":prefix": "CALLBACK#" },
        ScanIndexForward: false,
      })
    );
    const items = (response.Items ?? []) as Array<AgentCallbackRequest & { PK?: string; SK?: string }>;
    return items.map(({ PK, SK, ...request }) => {
      void PK;
      void SK;
      return request;
    });
  } catch (error) {
    if (isMissingTableError(error)) return [];
    console.error("[callback-request-store] Failed to list callbacks:", error);
    return [];
  }
}

async function getRawCallbackById(
  requestId: string
): Promise<{ item: AgentCallbackRequest; sk: string } | null> {
  // The SK embeds createdAtIso, which the caller doesn't have — but volume is
  // low, so a single Query + in-memory find is cheap and avoids a GSI.
  const all = await listAllCallbackRequests();
  const match = all.find((req) => req.id === requestId);
  if (!match) return null;
  return { item: match, sk: skFor(match) };
}

/**
 * Move a callback request through its status lifecycle and append to its
 * statusHistory. Returns the updated record, or null if not found.
 */
export async function updateCallbackRequestStatus(input: {
  requestId: string;
  status: AgentCallbackStatus;
  note?: string;
}): Promise<AgentCallbackRequest | null> {
  const found = await getRawCallbackById(input.requestId);
  if (!found) return null;

  const nowIso = new Date().toISOString();
  const updated: AgentCallbackRequest = {
    ...found.item,
    status: input.status,
    routing: { ...found.item.routing, dashboardQueued: false },
    statusHistory: [
      ...found.item.statusHistory,
      { status: input.status, changedAtIso: nowIso, note: input.note },
    ],
  };

  await chatDynamoDocumentClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: CALLBACK_PK, SK: found.sk, ...updated },
    })
  );

  return updated;
}

/** Fetch one callback request by id (operator detail view). */
export async function getCallbackRequestById(requestId: string): Promise<AgentCallbackRequest | null> {
  const found = await getRawCallbackById(requestId);
  return found?.item ?? null;
}
