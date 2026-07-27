import {
  ScanCommand,
  type DynamoDBClient,
} from "@aws-sdk/client-dynamodb";

import {
  deleteDraftProtectedContent,
  retentionDisposition,
} from "./retention";
import type { DraftStoreConfig } from "./store";

export interface RetentionSweepResult {
  inspected: number;
  deletedDrafts: number;
  deletedItems: number;
}

export async function sweepExpiredBookingDrafts(
  dynamo: DynamoDBClient,
  config: DraftStoreConfig,
  retentionDays: number,
  limit = 25
): Promise<RetentionSweepResult> {
  const result = await dynamo.send(
    new ScanCommand({
      TableName: config.tableName,
      FilterExpression: "SK = :meta",
      ExpressionAttributeValues: { ":meta": { S: "META" } },
      ProjectionExpression: "PK, updatedAtIso",
      Limit: Math.min(Math.max(limit, 1), 100),
    })
  );
  const summary: RetentionSweepResult = { inspected: 0, deletedDrafts: 0, deletedItems: 0 };
  for (const item of result.Items ?? []) {
    summary.inspected += 1;
    const pk = (item.PK as { S?: string })?.S ?? "";
    const updatedAtIso = (item.updatedAtIso as { S?: string })?.S ?? "";
    if (!pk.startsWith("DRAFT#") || !updatedAtIso) continue;
    if (retentionDisposition(updatedAtIso, retentionDays) !== "delete_protected_content") continue;
    const deleted = await deleteDraftProtectedContent(
      dynamo,
      config,
      pk.slice("DRAFT#".length),
      "retention_expired"
    );
    summary.deletedDrafts += 1;
    summary.deletedItems += deleted.deletedItems;
  }
  return summary;
}
