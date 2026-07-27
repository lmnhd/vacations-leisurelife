import assert from "node:assert/strict";

import { GetItemCommand, TransactWriteItemsCommand } from "@aws-sdk/client-dynamodb";

import { updateDraftStatusWithJournal } from "../lib/booking-assistant/store.ts";

class FakeDynamo {
  public transactInput: TransactWriteItemsCommand["input"] | null = null;

  async send(command: unknown): Promise<Record<string, unknown>> {
    if (command instanceof GetItemCommand) {
      return {
        Item: {
          status: { S: "review_ready" },
          version: { N: "4" },
          journalSequence: { N: "7" },
        },
      };
    }

    if (command instanceof TransactWriteItemsCommand) {
      this.transactInput = command.input;
      return {};
    }

    throw new Error(`Unhandled command type: ${(command as { constructor?: { name?: string } }).constructor?.name ?? "unknown"}`);
  }
}

async function run(): Promise<void> {
  const dynamo = new FakeDynamo();
  const result = await updateDraftStatusWithJournal(
    {
      dynamo: dynamo as never,
      encryption: {} as never,
    },
    {
      tableName: "lll-booking-assistant",
      kmsKeyArn: "unused",
    },
    {
      draftId: "draft-3",
      expectedVersion: 4,
      newStatus: "ready_to_call_agent",
      idempotencyKey: "status-change-1",
      journalEvent: {
        eventType: "booking_packet_reviewed",
        actorType: "guest",
        occurredAtIso: "2026-07-26T13:00:00.000Z",
        privacyClass: "operational",
        idempotencyKey: "journal-1",
        payload: { stage: "review" },
      },
    }
  );

  assert.equal(result.newVersion, 5);
  assert.ok(dynamo.transactInput);
  assert.equal(dynamo.transactInput?.TransactItems?.length, 2);

  const update = dynamo.transactInput?.TransactItems?.[0]?.Update;
  const put = dynamo.transactInput?.TransactItems?.[1]?.Put;
  assert.ok(update);
  assert.ok(put);
  assert.equal((update?.ExpressionAttributeValues?.[":journalSequence"] as { N?: string } | undefined)?.N, "8");
  assert.equal((put?.Item?.eventType as { S?: string } | undefined)?.S, "booking_packet_reviewed");
  assert.equal((put?.Item?.sequence as { N?: string } | undefined)?.N, "8");

  console.log("Booking Assistant transactional store tests passed.");
}

void run();
