# Inventory Match Architecture Review

**Logged:** 2026-06-04  
**Status:** Open — needs decision before implementing  
**Context:** Raised after debugging INVENTORY_FAILED_PAUSED on `grand-costumed-promenade-explorer`

---

## ⭐ Core principle the operator articulated (2026-06-04)

> "The date should be defined PURELY by the inventory matching."

This is the correct north star and the root cause of the whole INVENTORY_FAILED class of
bugs. Today the sail date is **invented by GPT** during discovery (`targetDates`), then a CB
group is picked near that guess, then Phase B tries to find a retail sailing on the CB
group's date. Three layers, each adding drift — so the AI date, the group date, and the
retail manifest date rarely line up, and exact-match logic rejects real sailings.

**Target architecture:** inventory is the single source of date truth.
- Discovery picks niche + ship class + rough **season/preference** only.
- `targetDates` from GPT is treated as a *hint for matching*, never as the real date.
- When inventory is matched, the campaign's authoritative date becomes the **matched
  sailing's actual date** (`matchedSailDate`), overwriting the guess.
- Everything downstream (landing page, countdown, emails, Phase B retail lookup) reads the
  matched date — never the GPT guess.
- This makes a date "mismatch" structurally impossible: there's only ever one date, and it
  came from real bookable inventory.

Tactical fixes already shipped (proximity date matching ±3 days, vendor-scoped retail
search) make the *current* flow work, but the strategic fix above is what removes the bug
class entirely. It aligns with the "collapse to one match step" decision below.

---

## The Problem

The current pipeline runs inventory matching **twice** for every campaign:

**Match 1 — Discovery (Phase A)**, inline during blueprint generation:
- Runs `matchGroupInventoryToCampaign` against the CB deals cache (static JSON)
- Scores and ranks candidate groups by ship/date/niche fit
- Writes `matchedShipName`, `matchedSailDate`, `cbagenttoolsGroupId`, `pricingStatus: CB_MATCHED` to the campaign
- Sets the "CB Match Found" badge on Phase A cards
- Does **not** produce a booking link — the cache has no URLs

**Match 2 — Phase B**, via Playwright against the live CBAT site:
- Scrapes the group detail page (`view_group/[id]`) for the personal booking link
- Validates the link is healthy
- Only then produces something actually bookable

The result: two "match" steps, but only one (Phase B) produces anything actionable. The Phase A match creates the appearance of inventory confirmation before any real validation has happened.

---

## What Went Wrong in Practice

- `grand-costumed-promenade-explorer` was matched at discovery time to Explorer of the Seas group 50178
- Group 50178 is a **House group** — CB owns it, agents don't get a personal booking link
- Phase A had no way to know this; the cache has no `isHouseGroup` flag (though we added detection in Phase B now)
- The campaign sat showing "CB Match Found" (now renamed "Needs Phase B") while being completely unbookable
- Required a new **Rematch** operation to fix — which itself still needs a Phase B run after it

---

## The Argument for Collapsing to One Step

Phase B already has everything Phase A's match does, plus more:
- Loads the CB cache (same data source)
- Runs `rankGroupInventoryCandidates` (same scoring logic)
- Scrapes the live booking link
- Validates link health
- Detects House groups

If Phase B is the only step that produces a bookable link, the Phase A match is producing a **false intermediate state** — a group assignment that looks meaningful but isn't validated. The Rematch operation we just built exists entirely to fix cases where Phase A matched bad inventory.

Proposed single-step flow:
1. Blueprint generation records `shipTarget` + `targetDates` from GPT output only (no inventory match)
2. Light existence check: verify the ship name appears somewhere in the cache (keep the gate, remove the scoring)
3. Phase B does the full match + link validation in one pass — group assignment, link scrape, health check

---

## The Argument for Keeping Two Steps

- The Phase A gate **does** prevent saving blueprints for ships with zero inventory — without it, you'd generate ideas for Celebrity Edge Caribbean sailings that don't exist in CB
- The pre-matched ship name on Phase A cards is useful context even before Phase B runs
- Phase B requires Playwright + operator execution; having a lightweight cache-based pre-check in Phase A means bad inventory is caught before the expensive Phase B step is ever triggered
- The scoring at discovery time also feeds the GPT prompt — inventory context shapes the blueprint itself ("ICON class ships for high-energy niches", etc.)

---

## What We've Already Mitigated

Since the original issue was raised, several partial fixes were shipped:

- House group detection in `scrapeGroupPersonalLink` — Phase B now skips the link scrape for House groups immediately rather than wasting time
- Vendor field propagation to Odysseus retail search — better scoping for the retail fallback path
- "Needs Phase B" badge rename — Phase A no longer shows a green "CB Match Found" badge that implies confirmed inventory
- **Rematch operation** — `POST /api/groups/discovery/rematch/[slug]` lets you reassign inventory without touching the blueprint

These mitigations make the two-step approach more tolerable but don't address the underlying redundancy.

---

## Decision Needed

Choose one of:

**A) Collapse to one step** — remove Phase A scoring match, keep only the light existence check, let Phase B own all matching. Lower complexity, eliminates the false intermediate state, but loses the pre-screened ship name on Phase A cards and slightly weakens the blueprint generation prompt.

**B) Keep two steps, harden Phase A** — add House group detection to the CB cache at scrape time (flag all House groups during `scrape-cb-deals`), so Phase A can exclude them from matching. This eliminates the most common failure mode without restructuring the pipeline.

**C) Keep two steps, accept the Rematch UX** — the current state after the June 4 fixes. Rematch handles the edge cases. Not ideal but functional.

Option B is probably the lowest-risk incremental improvement. Option A is the cleaner long-term architecture but requires more careful migration.
