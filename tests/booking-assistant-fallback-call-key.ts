import assert from "node:assert/strict";

import {
  SAFE_WORD_REGISTRY,
  CALL_KEY_VERSION,
  computeCallKeyHmac,
  constantTimeHmacMatch,
  normalizeCallKeyInput,
  selectRandomCallKey,
} from "../lib/booking-assistant/fallback-call-key.ts";

process.env.BOOKING_ASSISTANT_CALL_KEY_HMAC_SECRET ??=
  "booking-assistant-test-secret-with-at-least-thirty-two-characters";

function isUppercaseAsciiLetter(value: string): boolean {
  return value >= "A" && value <= "Z";
}

function testRegistry(): void {
  assert.equal(SAFE_WORD_REGISTRY.length, 90, "Registry should have 90 words");
  for (const word of SAFE_WORD_REGISTRY) {
    assert.equal(word.length, 3, `Word ${word} must be 3 letters`);
    assert.equal(word, word.toUpperCase(), `Word ${word} must be uppercase`);
    assert.equal(
      [...word].every(isUppercaseAsciiLetter),
      true,
      `Word ${word} must be alpha only`
    );
  }
  console.log("  ✓ Registry integrity (90 words, all 3-letter uppercase)");
}

function testNormalize(): void {
  assert.equal(normalizeCallKeyInput("map"), "MAP");
  assert.equal(normalizeCallKeyInput("  cat  "), "CAT");
  assert.equal(normalizeCallKeyInput("Dog"), "DOG");
  assert.equal(normalizeCallKeyInput("xyz"), null, "Non-registry word rejected");
  assert.equal(normalizeCallKeyInput("ab"), null, "Too short rejected");
  assert.equal(normalizeCallKeyInput("abcd"), null, "Too long rejected");
  assert.equal(normalizeCallKeyInput("12"), null, "Numeric rejected");
  console.log("  ✓ normalizeCallKeyInput (case, trim, validation)");
}

function testHmacDeterministic(): void {
  const h1 = computeCallKeyHmac("MAP");
  const h2 = computeCallKeyHmac("MAP");
  const h3 = computeCallKeyHmac("CAT");
  assert.equal(h1, h2, "Same key must produce same HMAC");
  assert.notEqual(h1, h3, "Different keys must produce different HMACs");
  assert.equal(h1.length, 64, "SHA-256 hex digest is 64 chars");
  console.log("  ✓ HMAC deterministic + distinct");
}

function testConstantTimeMatch(): void {
  const h1 = computeCallKeyHmac("SUN");
  const h2 = computeCallKeyHmac("SUN");
  const h3 = computeCallKeyHmac("SKY");
  assert.equal(constantTimeHmacMatch(h1, h2), true);
  assert.equal(constantTimeHmacMatch(h1, h3), false);
  assert.equal(constantTimeHmacMatch(h1, "short"), false, "Length mismatch returns false");
  console.log("  ✓ constantTimeHmacMatch (match, mismatch, length guard)");
}

function testRandomSelection(): void {
  const selected = selectRandomCallKey();
  assert.equal(selected.keyVersion, CALL_KEY_VERSION);
  assert.equal(selected.normalizedKey, selected.rawKey.toUpperCase());
  assert.equal(selected.normalizedKey.length, 3);
  assert.ok(
    SAFE_WORD_REGISTRY.includes(selected.rawKey as (typeof SAFE_WORD_REGISTRY)[number]),
    `Selected key ${selected.rawKey} must be in registry`
  );
  assert.equal(selected.lookupHmac, computeCallKeyHmac(selected.normalizedKey));
  console.log("  ✓ selectRandomCallKey (version, normalization, HMAC)");
}

function testNoSequentialBias(): void {
  const selections = new Set<string>();
  for (let i = 0; i < 20; i++) {
    selections.add(selectRandomCallKey().rawKey);
  }
  assert.ok(selections.size > 1, "20 selections should produce >1 unique key");
  console.log(`  ✓ Random distribution (${selections.size} unique in 20 draws)`);
}

function run(): void {
  testRegistry();
  testNormalize();
  testHmacDeterministic();
  testConstantTimeMatch();
  testRandomSelection();
  testNoSequentialBias();
  console.log("Booking Assistant fallback call-key tests passed.");
}

run();
