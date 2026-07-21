/**
 * KMS envelope encryption for Booking Assistant Tier B/C fields.
 *
 * Pattern: KMS GenerateDataKey returns a plaintext data key (used locally)
 * and an encrypted data key (stored alongside ciphertext). Decryption
 * requires KMS Decrypt on the stored encrypted data key first.
 *
 * No plaintext data keys or decrypted values are logged or persisted.
 */

import {
  createCipheriv,
  createDecipheriv,
  createSecretKey,
  randomBytes,
} from "node:crypto";

import type { KMSClient } from "@aws-sdk/client-kms";
import {
  DecryptCommand,
  GenerateDataKeyCommand,
} from "@aws-sdk/client-kms";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const DATA_KEY_SPEC = "AES_256";

/** Copy a Buffer into a fresh ArrayBuffer-backed Uint8Array for crypto APIs. */
function toArr(buf: Buffer): Uint8Array {
  const arr = new Uint8Array(buf.length);
  arr.set(buf);
  return arr;
}

/** Serialized encrypted blob stored in DynamoDB. */
export interface EncryptedBlob {
  /** Base64-encoded ciphertext. */
  ciphertext: string;
  /** Base64-encoded 12-byte IV. */
  iv: string;
  /** Base64-encoded 16-byte GCM auth tag. */
  tag: string;
  /** Base64-encoded KMS-encrypted data key. */
  encryptedDataKey: string;
  /** KMS key ARN used for envelope encryption. */
  kmsKeyArn: string;
}

export interface EncryptionHelper {
  encrypt(plaintext: string): Promise<EncryptedBlob>;
  decrypt(blob: EncryptedBlob): Promise<string>;
}

export function createEncryptionHelper(
  kms: KMSClient,
  kmsKeyArn: string
): EncryptionHelper {
  async function encrypt(plaintext: string): Promise<EncryptedBlob> {
    const dataKey = await kms.send(
      new GenerateDataKeyCommand({
        KeyId: kmsKeyArn,
        KeySpec: DATA_KEY_SPEC,
      })
    );

    const plaintextKey = dataKey.Plaintext;
    const encryptedKey = dataKey.CiphertextBlob;
    if (!plaintextKey || !encryptedKey) {
      throw new Error("KMS GenerateDataKey returned empty key material");
    }

    const keyObj = createSecretKey(toArr(Buffer.from(plaintextKey)));
    const iv = toArr(randomBytes(IV_LENGTH));
    const cipher = createCipheriv(ALGORITHM, keyObj, iv);
    const ciphertextParts: Uint8Array[] = [
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ].map((b) => toArr(b));
    const ciphertext = Buffer.concat(ciphertextParts);
    const tag = cipher.getAuthTag();

    return {
      ciphertext: ciphertext.toString("base64"),
      iv: Buffer.from(iv).toString("base64"),
      tag: tag.toString("base64"),
      encryptedDataKey: Buffer.from(encryptedKey).toString("base64"),
      kmsKeyArn,
    };
  }

  async function decrypt(blob: EncryptedBlob): Promise<string> {
    const decryptedKey = await kms.send(
      new DecryptCommand({
        CiphertextBlob: new Uint8Array(Buffer.from(blob.encryptedDataKey, "base64")),
      })
    );

    const plaintextKey = decryptedKey.Plaintext;
    if (!plaintextKey) {
      throw new Error("KMS Decrypt returned empty key material");
    }

    const keyObj = createSecretKey(toArr(Buffer.from(plaintextKey)));
    const iv = toArr(Buffer.from(blob.iv, "base64"));
    const tag = toArr(Buffer.from(blob.tag, "base64"));
    const decipher = createDecipheriv(ALGORITHM, keyObj, iv);
    decipher.setAuthTag(tag);

    const ciphertext = toArr(Buffer.from(blob.ciphertext, "base64"));
    const plaintextParts: Uint8Array[] = [
      decipher.update(ciphertext),
      decipher.final(),
    ].map((b) => toArr(b));
    const plaintext = Buffer.concat(plaintextParts).toString("utf8");
    return plaintext;
  }

  return { encrypt, decrypt };
}

/**
 * Encrypts a JSON-serializable object. Returns the same EncryptedBlob shape
 * so callers don't need to know whether the payload was a string or object.
 */
export async function encryptJson(
  helper: EncryptionHelper,
  value: object
): Promise<EncryptedBlob> {
  return helper.encrypt(JSON.stringify(value));
}

/** Decrypts an EncryptedBlob and parses the JSON. */
export async function decryptJson<T>(
  helper: EncryptionHelper,
  blob: EncryptedBlob
): Promise<T> {
  const plaintext = await helper.decrypt(blob);
  return JSON.parse(plaintext) as T;
}
