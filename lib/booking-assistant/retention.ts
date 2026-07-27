import {
  BatchWriteItemCommand,
  PutItemCommand,
  QueryCommand,
  type DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { createHash } from "node:crypto";

import type { DraftStoreConfig } from "./store";

export type RetentionDisposition = "retain" | "delete_protected_content";

export function retentionDisposition(
  updatedAtIso: string,
  retentionDays: number,
  now = new Date()
): RetentionDisposition {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error("Retention days must be a positive integer");
  }
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  return Date.parse(updatedAtIso) <= cutoff ? "delete_protected_content" : "retain";
}

export async function deleteDraftProtectedContent(
  dynamo: DynamoDBClient,
  config: DraftStoreConfig,
  draftId: string,
  reason: string
): Promise<{ deletedItems: number; tombstoneId: string }> {
  const pk = `DRAFT#${draftId}`;
  const result = await dynamo.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": { S: pk } },
      ProjectionExpression: "PK, SK",
    })
  );
  const keys = (result.Items ?? []).map((item) => ({
    DeleteRequest: {
      Key: {
        PK: item.PK,
        SK: item.SK,
      },
    },
  }));
  for (let index = 0; index < keys.length; index += 25) {
    await dynamo.send(
      new BatchWriteItemCommand({
        RequestItems: {
          [config.tableName]: keys.slice(index, index + 25) as never,
        },
      })
    );
  }
  const tombstoneId = createHash("sha256").update(draftId).digest("hex");
  await dynamo.send(
    new PutItemCommand({
      TableName: config.tableName,
      Item: {
        PK: { S: `DELETED#${tombstoneId}` },
        SK: { S: "TOMBSTONE" },
        tombstoneId: { S: tombstoneId },
        deletedAtIso: { S: new Date().toISOString() },
        deletedItems: { N: String(keys.length) },
        reason: { S: reason.slice(0, 120) },
      },
    })
  );
  return { deletedItems: keys.length, tombstoneId };
}
