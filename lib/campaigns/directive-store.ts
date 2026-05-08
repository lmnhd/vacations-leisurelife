import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { chatDynamoDocumentClient } from "@/lib/chat/dynamo-client";
import {
  CampaignDirective,
  CampaignDirectiveSchema,
  DirectiveStatus,
} from "./schema";

const TABLE_NAME = "lll-shadow-campaigns";

function directiveSK(directiveId: string): string {
  return `DIRECTIVE#${directiveId}`;
}

export async function saveDirective(
  directive: CampaignDirective,
): Promise<void> {
  await chatDynamoDocumentClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `CAMPAIGN#${directive.slug}`,
        SK: directiveSK(directive.id),
        directiveJson: JSON.stringify(directive),
        status: directive.status,
        createdAt: directive.createdAt,
      },
    }),
  );
}

export async function getDirective(
  slug: string,
  directiveId: string,
): Promise<CampaignDirective | null> {
  const result = await chatDynamoDocumentClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `CAMPAIGN#${slug}`,
        SK: directiveSK(directiveId),
      },
      ConsistentRead: true,
    }),
  );

  if (!result.Item) return null;
  const parsed = CampaignDirectiveSchema.parse(
    JSON.parse(result.Item.directiveJson as string),
  );
  return {
    ...parsed,
    status:
      (result.Item.status as CampaignDirective["status"]) ?? parsed.status,
    appliedAt:
      typeof result.Item.appliedAt === "string"
        ? result.Item.appliedAt
        : parsed.appliedAt,
    failureReason:
      typeof result.Item.failureReason === "string"
        ? result.Item.failureReason
        : parsed.failureReason,
  };
}

export async function listDirectives(
  slug: string,
): Promise<CampaignDirective[]> {
  const result = await chatDynamoDocumentClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `CAMPAIGN#${slug}`,
        ":prefix": "DIRECTIVE#",
      },
    }),
  );

  return (result.Items ?? [])
    .map((item) => {
      try {
        const parsed = CampaignDirectiveSchema.parse(
          JSON.parse(item.directiveJson as string),
        );
        return {
          ...parsed,
          status: (item.status as CampaignDirective["status"]) ?? parsed.status,
          appliedAt:
            typeof item.appliedAt === "string"
              ? item.appliedAt
              : parsed.appliedAt,
          failureReason:
            typeof item.failureReason === "string"
              ? item.failureReason
              : parsed.failureReason,
        };
      } catch {
        return null;
      }
    })
    .filter((d): d is any => d !== null)
    .sort((a: any, b: any) =>
      a.createdAt.localeCompare(b.createdAt),
    ) as CampaignDirective[];
}

export async function updateDirectiveStatus(
  slug: string,
  directiveId: string,
  status: DirectiveStatus,
  extra: { appliedAt?: string; failureReason?: string } = {},
): Promise<void> {
  const expressionParts: string[] = ["#st = :status"];
  const names: Record<string, string> = { "#st": "status" };
  const values: Record<string, string> = { ":status": status };

  if (extra.appliedAt) {
    expressionParts.push("appliedAt = :appliedAt");
    values[":appliedAt"] = extra.appliedAt;
  }
  if (extra.failureReason) {
    expressionParts.push("failureReason = :failureReason");
    values[":failureReason"] = extra.failureReason;
  }

  await chatDynamoDocumentClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `CAMPAIGN#${slug}`,
        SK: directiveSK(directiveId),
      },
      UpdateExpression: `SET ${expressionParts.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}
