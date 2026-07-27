import assert from "node:assert/strict";

import { GetItemCommand, QueryCommand, TransactWriteItemsCommand } from "@aws-sdk/client-dynamodb";

import {
  consumeResumeToken,
  createGuestSessionCookieValue,
  issueResumeToken,
  parseGuestSessionCookieValue,
} from "../lib/booking-assistant/resume-tokens.ts";

process.env.BOOKING_ASSISTANT_SESSION_HMAC_SECRET ??=
  "booking-assistant-session-test-secret-with-at-least-thirty-two-characters";

type DynamoItem = Record<string, { S?: string; N?: string }>;

class FakeDynamo {
  readonly tokenItems = new Map<string, DynamoItem>();
  readonly draftPointers = new Map<string, DynamoItem>();

  async send(command: unknown): Promise<Record<string, unknown>> {
    if (command instanceof TransactWriteItemsCommand) {
      const input = command.input;
      for (const tx of input.TransactItems ?? []) {
        if (tx.Put) {
          const item = tx.Put.Item as DynamoItem;
          const pk = item.PK?.S ?? "";
          const sk = item.SK?.S ?? "";
          if (pk.startsWith("RESUMETOKEN#")) {
            this.tokenItems.set(pk, item);
          } else if (sk === "RESUME_ACTIVE") {
            this.draftPointers.set(pk, item);
          }
        } else if (tx.Update) {
          const pk = tx.Update.Key?.PK?.S ?? "";
          const existing = this.tokenItems.get(pk);
          assert.ok(existing, `Expected token item for ${pk}`);
          existing.state = { S: "consumed" };
          existing.consumedAtIso = tx.Update.ExpressionAttributeValues?.[":consumedAtIso"] as { S?: string };
          this.tokenItems.set(pk, existing);
        } else if (tx.Delete) {
          const pk = tx.Delete.Key?.PK?.S ?? "";
          this.draftPointers.delete(pk);
        }
      }
      return {};
    }

    if (command instanceof QueryCommand) {
      const pk = (command.input.ExpressionAttributeValues?.[":pk"] as { S?: string } | undefined)?.S ?? "";
      const item = this.tokenItems.get(pk);
      return { Items: item ? [item] : [] };
    }

    if (command instanceof GetItemCommand) {
      const pk = command.input.Key?.PK?.S ?? "";
      return { Item: this.draftPointers.get(pk) };
    }

    throw new Error(`Unhandled command type: ${(command as { constructor?: { name?: string } }).constructor?.name ?? "unknown"}`);
  }
}

async function testGuestSessionCookieRoundTrip(): Promise<void> {
  const raw = createGuestSessionCookieValue({
    draftId: "draft-1",
    personId: "person-1",
    issuedAtIso: "2026-07-26T12:00:00.000Z",
    expiresAtIso: "2026-08-26T12:00:00.000Z",
  });
  const parsed = parseGuestSessionCookieValue(raw);
  assert.ok(parsed);
  assert.equal(parsed?.draftId, "draft-1");
  assert.equal(parsed?.personId, "person-1");
}

async function testResumeTokenIssueAndConsume(): Promise<void> {
  const dynamo = new FakeDynamo();
  const issued = await issueResumeToken(dynamo as never, { tableName: "lll-booking-assistant", kmsKeyArn: "unused" }, {
    draftId: "draft-2",
    personId: "person-2",
    redirectDealId: "deal-2",
    ttlSeconds: 600,
  });

  assert.ok(issued.token.includes("."));
  assert.equal(dynamo.tokenItems.size, 1);
  assert.equal(dynamo.draftPointers.size, 1);

  const consumed = await consumeResumeToken(
    dynamo as never,
    { tableName: "lll-booking-assistant", kmsKeyArn: "unused" },
    issued.token
  );

  assert.ok(consumed);
  assert.equal(consumed?.draftId, "draft-2");
  assert.equal(consumed?.personId, "person-2");
  assert.equal(dynamo.draftPointers.size, 0);

  const secondConsume = await consumeResumeToken(
    dynamo as never,
    { tableName: "lll-booking-assistant", kmsKeyArn: "unused" },
    issued.token
  );
  assert.equal(secondConsume, null);
}

async function run(): Promise<void> {
  await testGuestSessionCookieRoundTrip();
  await testResumeTokenIssueAndConsume();
  console.log("Booking Assistant resume-token tests passed.");
}

void run();
