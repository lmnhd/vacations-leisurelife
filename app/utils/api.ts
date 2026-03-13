import axios from "axios";
import { createHash } from "crypto";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { backOff } from "exponential-backoff";
import { callLLM, modelForTask } from "@/lib/ai/llm-gateway";
import { chatDynamoDocumentClient } from "@/lib/chat/dynamo-client";

const APP_CACHE_TABLE_NAME = process.env.APP_CACHE_TABLE_NAME ?? "lll-app-cache";
const AI_CACHE_PK = "AICACHE";
const AI_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;
const AI_CACHE_TTL_MS = AI_CACHE_TTL_SECONDS * 1000;
const ALLOW_AI_LIVE_WITHOUT_CACHE =
  process.env.ALLOW_AI_LIVE_WITHOUT_CACHE === "true" ||
  process.env.NODE_ENV === "development";

interface AiCacheItem {
  response: string;
}

function hashPrompt(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function buildAiPromptCacheSk(functionId: string, componentId: string, prompt: string): string {
  return `FN#${functionId}#CMP#${componentId}#PROMPT#${hashPrompt(prompt)}`;
}

function buildAiLatestCacheSk(functionId: string, componentId: string): string {
  return `FN#${functionId}#CMP#${componentId}#LATEST`;
}

const inMemoryAiCache = new Map<string, { response: string; expiresAt: number }>();

let aiCacheDbEnabled = true;
let aiCacheDbWarningLogged = false;

function getLocalCacheKey(prompt: string, componentId: string, functionId: string, usePrompt: boolean): string {
  return usePrompt
    ? buildAiPromptCacheSk(functionId, componentId, prompt)
    : buildAiLatestCacheSk(functionId, componentId);
}

function getLocalAiCache(key: string): string | null {
  const cached = inMemoryAiCache.get(key);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    inMemoryAiCache.delete(key);
    return null;
  }

  return cached.response;
}

function setLocalAiCache(key: string, response: string): void {
  inMemoryAiCache.set(key, {
    response,
    expiresAt: Date.now() + AI_CACHE_TTL_MS,
  });
}

function shouldSkipAiCacheDbAccess(): boolean {
  if (!aiCacheDbEnabled) {
    if (!aiCacheDbWarningLogged) {
      console.warn("AI cache backend disabled, skipping DynamoDB reads/writes");
      aiCacheDbWarningLogged = true;
    }
    return true;
  }

  return false;
}

function disableAiCacheDbAccess(error: unknown): void {
  aiCacheDbEnabled = false;
  if (!aiCacheDbWarningLogged) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Disabling AI cache backend after DynamoDB error:", message);
    aiCacheDbWarningLogged = true;
  }
}

async function storeAIResponse(
  prompt: string,
  response: string,
  componentId: string,
  functionId: string
) {
  const promptKey = buildAiPromptCacheSk(functionId, componentId, prompt);
  const latestKey = buildAiLatestCacheSk(functionId, componentId);
  setLocalAiCache(promptKey, response);
  setLocalAiCache(latestKey, response);

  if (shouldSkipAiCacheDbAccess()) {
    return null;
  }

  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ttl = nowSeconds + AI_CACHE_TTL_SECONDS;
    const createdAt = new Date().toISOString();

    const promptItem = {
      PK: AI_CACHE_PK,
      SK: buildAiPromptCacheSk(functionId, componentId, prompt),
      cacheType: "ai_assist",
      functionId,
      componentId,
      prompt,
      response,
      ignore: false,
      ttl,
      createdAt,
      updatedAt: createdAt,
    };

    const latestItem = {
      PK: AI_CACHE_PK,
      SK: buildAiLatestCacheSk(functionId, componentId),
      cacheType: "ai_assist",
      functionId,
      componentId,
      prompt,
      response,
      ignore: false,
      ttl,
      createdAt,
      updatedAt: createdAt,
    };

    await Promise.all([
      chatDynamoDocumentClient.send(
        new PutCommand({
          TableName: APP_CACHE_TABLE_NAME,
          Item: promptItem,
        })
      ),
      chatDynamoDocumentClient.send(
        new PutCommand({
          TableName: APP_CACHE_TABLE_NAME,
          Item: latestItem,
        })
      ),
    ]);

    const storedResponse = { response };
    return storedResponse;
  } catch (error) {
    disableAiCacheDbAccess(error);
    return null;
  }
}
async function checkForStoredAIResponse(
  prompt: string,
  componentId: string,
  functionId: string,
  usePrompt: boolean = true
) {
  console.log(`checking for stored response for functionId = ${functionId} *** componentId = ${componentId}`)
  const localKey = getLocalCacheKey(prompt, componentId, functionId, usePrompt);
  const localResponse = getLocalAiCache(localKey);
  if (localResponse) {
    return [{ response: localResponse }];
  }

  if (shouldSkipAiCacheDbAccess()) {
    return [];
  }

  try {
    const cacheKey = usePrompt
      ? buildAiPromptCacheSk(functionId, componentId, prompt)
      : buildAiLatestCacheSk(functionId, componentId);

    const response = await chatDynamoDocumentClient.send(
      new GetCommand({
        TableName: APP_CACHE_TABLE_NAME,
        Key: {
          PK: AI_CACHE_PK,
          SK: cacheKey,
        },
      })
    );

    const item = response.Item as AiCacheItem | undefined;
    if (!item?.response) {
      return [];
    }

    setLocalAiCache(cacheKey, item.response);

    return [{ response: item.response }];
  } catch (error) {
    disableAiCacheDbAccess(error);
    return [];
  }
}
async function deleteStoredData(tableValueName: string) {
  if (shouldSkipAiCacheDbAccess()) {
    return null;
  }

  try {
    let lastEvaluatedKey: Record<string, unknown> | undefined;
    let deleted = 0;

    do {
      const result = await chatDynamoDocumentClient.send(
        new QueryCommand({
          TableName: APP_CACHE_TABLE_NAME,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
          ExpressionAttributeValues: {
            ":pk": AI_CACHE_PK,
            ":prefix": `FN#${tableValueName}#`,
          },
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );

      const items = result.Items ?? [];
      for (const item of items) {
        const pk = item.PK;
        const sk = item.SK;
        if (typeof pk !== "string" || typeof sk !== "string") {
          continue;
        }

        await chatDynamoDocumentClient.send(
          new DeleteCommand({
            TableName: APP_CACHE_TABLE_NAME,
            Key: {
              PK: pk,
              SK: sk,
            },
          })
        );
        deleted += 1;
      }

      lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastEvaluatedKey);

    const storedResponse = { count: deleted };
    return storedResponse;
  } catch (error) {
    disableAiCacheDbAccess(error);
    return null;
  }
}
export async function getVTGShipData(params: any) {
  console.log(params);

  const response = await axios.post("/api/vtgTrip", {
    data: params,
  });
  // console.log(response.data);
  // return response.data;
}
export async function aiAssistBackOff(
  instructions: string,
  data: string,
  componentId: string,
  functionId: string,
  deleteData: string = "",
  usePrompt: boolean
) {
  try {
    const response: string = await backOff(() =>
      aiAssist(instructions, data, componentId, functionId, deleteData, usePrompt)
    );
    return response;
  } catch (error) {
    console.error(error);
    //return error;
  }
}
async function aiAssist(
  instructions: string,
  data: string,
  componentId: string,
  functionId: string,
  deleteData: string = "",
  usePrompt: boolean
) {
  if (deleteData == "") {
  } else {
    console.log("deleting stored data...", deleteData);
    await deleteStoredData(deleteData);
    //return 'deleted';
  }

  const message = `${instructions} : """${data}"""`;
  //console.log(`message: ${message}`);
  //return
  console.log("checking for stored response...");
  const storedResponse = await checkForStoredAIResponse(
    data,
    componentId,
    functionId,
    usePrompt
  );
  console.log("search for stored response complete... ", storedResponse)
  if (storedResponse.length > 0) {
    console.log("stored response found");
    console.log(storedResponse[0].response)
    return storedResponse[0].response;
  }else{
    console.log("no stored response found");
    //return "no response found";
  }

  const isDev = process.env.NODE_ENV === "development";
  const allowAiInProd = process.env.ALLOW_AI_IN_PRODUCTION === "true";

  if (isDev || allowAiInProd) {
    if (shouldSkipAiCacheDbAccess() && !ALLOW_AI_LIVE_WITHOUT_CACHE) {
      console.warn("Skipping live LLM call because AI cache backend is unavailable. Set ALLOW_AI_LIVE_WITHOUT_CACHE=true to override.");
      return "";
    }

    console.log("no stored response found, querying LLM gateway...");

    if (!process.env.OPENAI_API_KEY) {
      console.warn("OPENAI_API_KEY is missing; skipping LLM request.");
      return "no response found";
    }

    // Route through the gateway legacy extraction profile for low-complexity formatting tasks
    const { content: res } = await callLLM(modelForTask("legacy_extraction"), message, {
      maxTokens: 1000,
    });

    console.log(res);

    if (res && res !== "error") {
      console.log("storing response...");
      await storeAIResponse(data, res, componentId, functionId);
    }
    return res || "error";
  }

  return "";
  //console.log(response.choices[0].message.content)
}
