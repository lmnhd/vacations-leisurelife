import {
  GetItemCommand,
  TransactWriteItemsCommand,
  type DynamoDBClient,
} from "@aws-sdk/client-dynamodb";

import type { DraftStoreConfig } from "./store";

export type AgentAvailabilityMode = "available" | "no_agents";

export interface AgentAvailability {
  mode: AgentAvailabilityMode;
  effectiveUntilIso?: string;
  changedAtIso: string;
  changedByOperatorId: string;
  version: number;
}

const AVAILABILITY_KEY = {
  PK: { S: "CONFIG#BOOKING_ASSISTANT" },
  SK: { S: "AGENT_AVAILABILITY" },
};

export function effectiveAgentAvailability(
  availability: AgentAvailability,
  now = new Date()
): AgentAvailability {
  if (
    availability.mode === "no_agents" &&
    availability.effectiveUntilIso &&
    Date.parse(availability.effectiveUntilIso) <= now.getTime()
  ) {
    return { ...availability, mode: "available" };
  }
  return availability;
}

export async function getAgentAvailability(
  dynamo: DynamoDBClient,
  config: DraftStoreConfig
): Promise<AgentAvailability> {
  const result = await dynamo.send(new GetItemCommand({
    TableName: config.tableName,
    Key: AVAILABILITY_KEY,
  }));
  if (!result.Item) {
    return {
      mode: "available",
      changedAtIso: new Date(0).toISOString(),
      changedByOperatorId: "migration-default",
      version: 0,
    };
  }
  const item = result.Item;
  return effectiveAgentAvailability({
    mode: item.mode?.S === "no_agents" ? "no_agents" : "available",
    effectiveUntilIso: item.effectiveUntilIso?.S,
    changedAtIso: item.changedAtIso?.S ?? new Date(0).toISOString(),
    changedByOperatorId: item.changedByOperatorId?.S ?? "unknown",
    version: Number(item.version?.N ?? "0"),
  });
}

export async function setAgentAvailability(
  dynamo: DynamoDBClient,
  config: DraftStoreConfig,
  input: {
    mode: AgentAvailabilityMode;
    effectiveUntilIso?: string;
    changedByOperatorId: string;
    expectedVersion: number;
  }
): Promise<AgentAvailability> {
  if (
    input.mode === "no_agents" &&
    input.effectiveUntilIso &&
    Date.parse(input.effectiveUntilIso) <= Date.now()
  ) {
    throw new Error("No Agents mode must end in the future");
  }
  const availability: AgentAvailability = {
    mode: input.mode,
    effectiveUntilIso: input.mode === "no_agents" ? input.effectiveUntilIso : undefined,
    changedAtIso: new Date().toISOString(),
    changedByOperatorId: input.changedByOperatorId,
    version: input.expectedVersion + 1,
  };
  await dynamo.send(new TransactWriteItemsCommand({
    TransactItems: [
      {
        Put: {
          TableName: config.tableName,
          Item: {
            ...AVAILABILITY_KEY,
            mode: { S: availability.mode },
            changedAtIso: { S: availability.changedAtIso },
            changedByOperatorId: { S: availability.changedByOperatorId },
            version: { N: String(availability.version) },
            ...(availability.effectiveUntilIso
              ? { effectiveUntilIso: { S: availability.effectiveUntilIso } }
              : {}),
          },
          ConditionExpression: input.expectedVersion === 0
            ? "attribute_not_exists(PK) OR #version = :expectedVersion"
            : "#version = :expectedVersion",
          ExpressionAttributeNames: { "#version": "version" },
          ExpressionAttributeValues: {
            ":expectedVersion": { N: String(input.expectedVersion) },
          },
        },
      },
      {
        Put: {
          TableName: config.tableName,
          Item: {
            PK: { S: "CONFIG#BOOKING_ASSISTANT" },
            SK: { S: `AVAILABILITY_EVENT#${availability.changedAtIso}#${availability.version}` },
            eventType: { S: "agent_availability_changed" },
            mode: { S: availability.mode },
            changedAtIso: { S: availability.changedAtIso },
            changedByOperatorId: { S: availability.changedByOperatorId },
            ...(availability.effectiveUntilIso
              ? { effectiveUntilIso: { S: availability.effectiveUntilIso } }
              : {}),
          },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      },
    ],
  }));
  return availability;
}

export function availabilityConditionCheck(
  tableName: string,
  nowIso: string
): Record<string, unknown> {
  return {
    ConditionCheck: {
      TableName: tableName,
      Key: AVAILABILITY_KEY,
      ConditionExpression:
        "attribute_not_exists(PK) OR #mode = :available OR effectiveUntilIso <= :now",
      ExpressionAttributeNames: { "#mode": "mode" },
      ExpressionAttributeValues: {
        ":available": { S: "available" },
        ":now": { S: nowIso },
      },
    },
  };
}
