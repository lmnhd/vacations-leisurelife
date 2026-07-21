import assert from "node:assert/strict";

import {
  createEncryptionHelper,
  encryptJson,
  decryptJson,
  type EncryptedBlob,
  type EncryptionHelper,
} from "../lib/booking-assistant/encryption.ts";

function testEncryptedBlobShape(blob: EncryptedBlob): void {
  assert.equal(typeof blob.ciphertext, "string");
  assert.equal(typeof blob.iv, "string");
  assert.equal(typeof blob.tag, "string");
  assert.equal(typeof blob.encryptedDataKey, "string");
  assert.equal(typeof blob.kmsKeyArn, "string");
  assert.ok(blob.ciphertext.length > 0, "ciphertext must not be empty");
  assert.ok(blob.iv.length > 0, "iv must not be empty");
  assert.ok(blob.tag.length > 0, "tag must not be empty");
  assert.ok(blob.encryptedDataKey.length > 0, "encryptedDataKey must not be empty");
}

async function run(): Promise<void> {
  // We can't call real KMS in unit tests, so we test the shape and
  // the encryptJson/decryptJson round-trip with a mock helper.

  const mockHelper: EncryptionHelper = {
    async encrypt(plaintext: string): Promise<EncryptedBlob> {
      return {
        ciphertext: Buffer.from(plaintext).toString("base64"),
        iv: "aGVsbG8=",
        tag: "dGFnMTIzNDU2Nzg5MDEy",
        encryptedDataKey: "ZW5jcnlwdGVkS2V5",
        kmsKeyArn: "arn:aws:kms:us-east-1:123:key/mock",
      };
    },
    async decrypt(blob: EncryptedBlob): Promise<string> {
      return Buffer.from(blob.ciphertext, "base64").toString("utf8");
    },
  };

  // Test encryptJson produces correct shape
  const testPayload = { name: "John", phone: "+15551234567", email: "test@test.com" };
  const blob = await encryptJson(mockHelper, testPayload);
  testEncryptedBlobShape(blob);
  console.log("  ✓ encryptJson produces valid EncryptedBlob shape");

  // Test decryptJson round-trip
  const decrypted = await decryptJson<typeof testPayload>(mockHelper, blob);
  assert.deepEqual(decrypted, testPayload, "Round-trip must preserve data");
  console.log("  ✓ encryptJson → decryptJson round-trip preserves data");

  // Test with empty object
  const emptyBlob = await encryptJson(mockHelper, {});
  const emptyDecrypted = await decryptJson<Record<string, unknown>>(mockHelper, emptyBlob);
  assert.deepEqual(emptyDecrypted, {}, "Empty object round-trip");
  console.log("  ✓ Empty object round-trip");

  // Test with nested object
  const nestedPayload = {
    contact: { firstName: "Jane", phone: "+15559876543" },
    preferences: { channel: "sms", marketing: false },
  };
  const nestedBlob = await encryptJson(mockHelper, nestedPayload);
  const nestedDecrypted = await decryptJson<typeof nestedPayload>(mockHelper, nestedBlob);
  assert.deepEqual(nestedDecrypted, nestedPayload, "Nested object round-trip");
  console.log("  ✓ Nested object round-trip");

  // Test createEncryptionHelper signature (without calling KMS)
  const helper = createEncryptionHelper({ send: async () => ({}) } as never, "arn:aws:kms:us-east-1:123:key/mock");
  assert.equal(typeof helper.encrypt, "function");
  assert.equal(typeof helper.decrypt, "function");
  console.log("  ✓ createEncryptionHelper returns correct interface");

  console.log("Booking Assistant encryption tests passed.");
}

void run();
