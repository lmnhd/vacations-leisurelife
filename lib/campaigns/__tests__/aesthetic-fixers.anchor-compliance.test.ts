/**
 * Anchor Compliance Deterministic Fixer — unit tests
 * Run with: npx tsx lib/campaigns/__tests__/aesthetic-fixers.anchor-compliance.test.ts
 */

import assert from "node:assert/strict";
import type { LandingStillBible, LandingStillSpec } from "../schema";
import { normalizeAnchorContent } from "../editors-room";

function makeBible(stills: LandingStillSpec[]): LandingStillBible {
  return {
    stillLibrary: stills,
    globalDirectionNotes: "Test bible direction.",
    avoidDirectives: [],
  };
}

function makeStill(
  overrides: Partial<LandingStillSpec> = {},
): LandingStillSpec {
  return {
    stillId: "still-01",
    anchorId: "anchor-01",
    imagePrompt: "People having fun.",
    subjectAction: "They are dancing.",
    location: "Pool deck",
    environmentDetails: "Sunny day",
    timeOfDay: "afternoon",
    lighting: "natural",
    mood: "upbeat",
    referenceCategory: "pool_deck",
    composition: "Wide shot",
    slotRole: "EDITORIAL_WIDE_A",
    usage: "concept",
    ...overrides,
  };
}

async function runTests() {
  console.log("Running Anchor Compliance Deterministic Fixer tests...");

  const anchors = [
    {
      anchorId: "anchor-01",
      nicheSignal: "DJ deck",
      locationFamily: "pool_deck",
    },
    {
      anchorId: "anchor-02",
      nicheSignal: "acoustic set",
      locationFamily: "cabaret",
    },
  ];

  {
    // Test 1: Injects missing nicheSignal
    const bible = makeBible([
      makeStill({
        anchorId: "anchor-01",
        imagePrompt: "Party on deck.",
        subjectAction: "Jumping around.",
      }),
    ]);
    const fixed = normalizeAnchorContent(anchors, bible);
    assert.ok(fixed.stillLibrary[0].imagePrompt.includes("DJ deck"));
    assert.ok(fixed.stillLibrary[0].subjectAction.includes("DJ deck"));
    console.log("✅ Test 1 passed: Injects missing nicheSignal");
  }

  {
    // Test 2: Does not duplicate if already present
    const bible = makeBible([
      makeStill({
        anchorId: "anchor-02",
        imagePrompt: "Listening to an acoustic set.",
        subjectAction: "Enjoying acoustic set.",
      }),
    ]);
    const fixed = normalizeAnchorContent(anchors, bible);
    assert.equal(
      fixed.stillLibrary[0].imagePrompt,
      "Listening to an acoustic set.",
    );
    assert.equal(fixed.stillLibrary[0].subjectAction, "Enjoying acoustic set.");
    console.log(
      "✅ Test 2 passed: Idempotency, does not duplicate existing signals",
    );
  }

  {
    // Test 3: Handles nicheCarryThrough if present
    const bible = makeBible([
      makeStill({
        anchorId: "anchor-01",
        imagePrompt: "Party on deck, featuring DJ deck",
        subjectAction: "Dancing by DJ deck",
        nicheCarryThrough: "headphones",
      }),
    ]);
    const fixed = normalizeAnchorContent(anchors, bible);
    assert.ok(fixed.stillLibrary[0].imagePrompt.includes("headphones"));
    assert.ok(fixed.stillLibrary[0].subjectAction.includes("headphones"));
    console.log("✅ Test 3 passed: Injects missing nicheCarryThrough");
  }

  console.log("All tests passed.");
}

runTests().catch(console.error);
