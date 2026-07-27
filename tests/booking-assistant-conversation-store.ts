import assert from "node:assert/strict";

import { PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";

import {
  loadConversationTurns,
  storeConversationTurn,
} from "../lib/booking-assistant/conversation-store.ts";
import type { EncryptedBlob, EncryptionHelper } from "../lib/booking-assistant/encryption.ts";

class FakeDynamo {
  items: Record<string, unknown>[] = [];

  async send(command: unknown): Promise<Record<string, unknown>> {
    if (command instanceof PutItemCommand) {
      this.items.push(command.input.Item as Record<string, unknown>);
      return {};
    }
    if (command instanceof QueryCommand) return { Items: this.items };
    throw new Error("Unexpected Dynamo command");
  }
}

const encryption: EncryptionHelper = {
  async encrypt(value: string): Promise<EncryptedBlob> {
    return {
      ciphertext: Buffer.from(value).toString("base64"),
      iv: "iv",
      tag: "tag",
      encryptedDataKey: "key",
      kmsKeyArn: "kms",
    };
  },
  async decrypt(blob: EncryptedBlob): Promise<string> {
    return Buffer.from(blob.ciphertext, "base64").toString("utf8");
  },
};

async function run(): Promise<void> {
  const dynamo = new FakeDynamo();
  const config = { tableName: "lll-booking-assistant", kmsKeyArn: "kms" };
  const accepted = await storeConversationTurn(dynamo as never, encryption, config, {
    draftId: "draft-1",
    interactionSessionId: "session-1",
    activeTaskId: "cabin_preference",
    channel: "text",
    role: "guest",
    text: "I would prefer a balcony.",
  });
  assert.equal(accepted.stored, true);
  const discarded = await storeConversationTurn(dynamo as never, encryption, config, {
    draftId: "draft-1",
    interactionSessionId: "session-1",
    activeTaskId: "review",
    channel: "text",
    role: "guest",
    text: "My card number is 4111111111111111",
  });
  assert.equal(discarded.stored, false);
  assert.equal(dynamo.items.length, 1);
  const turns = await loadConversationTurns(dynamo as never, encryption, config, "draft-1");
  assert.equal(turns.length, 1);
  assert.equal(turns[0].text, "I would prefer a balcony.");
  console.log("Booking Assistant conversation store tests passed.");
}

void run();
