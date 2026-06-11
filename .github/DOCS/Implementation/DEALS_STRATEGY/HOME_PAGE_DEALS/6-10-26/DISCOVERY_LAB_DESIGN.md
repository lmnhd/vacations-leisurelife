# Discovery Lab — Deal Workflow Step 1 (Design)

> Status: **Implemented.** Authored 2026-06-10; updated 2026-06-10 to match the
> shipped build. The Discovery Lab turns saved niche research into direct-response
> retail cruise angles (`SailingAngleProfile`). This doc is the spec AND the
> as-built reference; see "How this maps to the current implementation" for the
> exact files. Repeated runs do not regenerate the same ideas (see "Repeat-run
> behavior").

## Purpose

Discovery is **step 1 of the deal workflow** (per `TO_FIX.md` §"Workflow Order —
Research First, Package Second"). Instead of starting with a ship in mind, the
operator starts from **niche research** and lets the Lab propose self-contained
retail cruise **angles** ready to pitch directly to a passionate consumer/household.

The Lab consumes the **last saved discovery research**
(`.github/data/discovery-research-cache.json`) and emits one or more
**Sailing Angle Profiles** — a direct-response ad-creative payload that two
downstream engines can ingest:

- **Ad-copy engines** use `theCorePitch`, `sailingAngleTitle`, `visualAnchor`,
  `relevantKeywords`, and `targetAudienceDescriptor`.
- **The booking/inventory engine** uses `onboardAssetRequirements` and
  `destinationAndTimeOfYearHints` to scan live inventory and match the perfect ship
  + sailing date to the angle. (Matching is a later phase; discovery only produces
  the angle.)

## Critical framing change — niche-only, not cruise niches

The previous discovery research carried a **cruise travel bias** (themes oriented
around what staff or hosts would run). That violates policy. The corrected research
(`discovery-research-cache.json`, dated 2026-06-10, promptVersion
`2026-05-25-community-native-niche-evidence-v1`) is **niche-only**: it profiles
passionate consumer communities (e.g. *Cyanotype & Alternative Process Alchemists*,
*High-End Mechanical Puzzle Collectors*) defined entirely by their own non-travel
behavior, gear, vocabulary, and spend signals.

The Lab inherits this discipline: it pitches an **independent, self-contained retail
vacation** to an insider — never a group, meetup, club, organized event, or
cruise-run program.

## The agent: Sailing Angle Profile generator

### System role
> You are a direct-response creative marketing strategist. Your job is to generate a
> comprehensive "Sailing Angle Profile" to pitch a cruise booking directly to a
> passionate consumer or household.

### Critical ad-copy rules (hard constraints)
- **NO MASS-GROUP LANGUAGE.** Never use "group cruise," "meetups," "clubs," or
  "organized events." Pitch an independent, self-contained retail vacation.
  (Enforce against the existing `GROUP_ONLY_TERMS` list in `retail-discovery-adapter.ts`.)
- **BAN GENERIC TRAVEL PHRASES.** Avoid corporate/cliché travel speak: "unwind,"
  "escape," "luxury," "paradise."
- **TARGET THE INSIDER.** Copy and keywords must use the community's **native
  vocabulary** surfaced by the research, not generic travel terms.

### Output schema — `SailingAngleProfile`

| Field | Type | Definition |
|---|---|---|
| `sailingAngleTitle` | string | Punchy 3–6 word thematic ad hook. |
| `theCorePitch` | string | 2-sentence emotional direct-response pitch driving an immediate booking. |
| `visualAnchor` | string | Description of the high-contrast ad imagery matching the pitch. |
| `targetAudienceDescriptor` | string | Specific buyer profile: lifestyle + household dynamic. |
| `relevantKeywords` | string[] (6–8) | Hyper-targeted insider search terms / semantic tags for ad-platform targeting. |
| `destinationAndTimeOfYearHints` | string | Strategic geographic + seasonal recommendations that maximize the angle. |
| `onboardAssetRequirements` | string | Precise physical checklist of ship amenities / vessel style / layout the ad's promise requires. |

`onboardAssetRequirements` and `destinationAndTimeOfYearHints` are the **inventory
match keys**; the other five fields are the **ad-creative payload**.

### Per-niche derivation (Step 1 → Step 2)

For each niche in the saved research, the agent reasons in two steps before emitting
the JSON:

1. **Isolate the niche** — name the exact consumer identity (e.g. "The Cyanotype
   Botanical Alchemist," "The High-End Mechanical Puzzle Collector").
2. **Answer the core question** — *why is a cruise the uniquely ideal venue for this
   niche's practice?* (e.g. shifting latitude = changing UV + new port flora for sun
   printing; high sea-day density = uninterrupted cognitive quiet for puzzle solving.)
   This answer is what the pitch and asset requirements are built from.

## Few-shot examples (system context)

### Example A — Creative & environmental: *Cyanotype Alchemists*
- **Isolated niche:** The Cyanotype Botanical Alchemist.
- **Core question answer:** A cruise is a floating UV observatory and geographic
  conduit — shifting latitudinal sunlight plus new exotic island flora at every port,
  enabling site-specific prints from the deck chair without land-based travel friction.

```json
{
  "sailingAngleTitle": "Prints of Changing Latitudes",
  "theCorePitch": "Stop trying to force your creative practice into the unpredictable weather and familiar flora of home. On a cruise, the shifting latitude dynamically alters your UV exposure metrics daily, while foreign port stops provide a brand-new canvas of exotic, foraged botanicals to rinse and reveal right from the sun decks.",
  "visualAnchor": "A high-contrast, first-person shot of a traveler's hands unclipping a shatterproof plexiglass frame on a sun-drenched ship deck. A brilliant Prussian blue cyanotype print is revealed, showcasing the stark white silhouette of a freshly foraged tropical fern leaf, with the sparkling turquoise ocean rolling past in the background.",
  "targetAudienceDescriptor": "Solo creators, artistic couples, or mindful parents who practice alternative photography, printmaking, or botanical art, and value slow, analog creative travel.",
  "relevantKeywords": ["cyanotype printing", "alternative process photography", "botanical art", "Prussian blue prints", "sun printing", "analog art processing"],
  "destinationAndTimeOfYearHints": "Tropical or high-sun regions (Caribbean, Mediterranean, or Greek Isles) scheduled during high-UV seasons (Late Spring through early Autumn) to ensure reliable exposure conditions.",
  "onboardAssetRequirements": "Vessels featuring expansive open-air top decks with wind-shielded alcoves, a high percentage of private ocean-facing balconies, and easy access to outdoor fresh-water rinsing stations (such as pool deck showers)."
}
```

### Example B — High-net-worth & intellectual: *Mechanical Puzzle Solvers*
- **Isolated niche:** The High-End Mechanical Puzzle Collector.
- **Core question answer:** Blind sequential-discovery puzzles need deep cognitive
  quiet, free of digital pings and domestic interruption. A cruise is the ultimate
  distraction-free sanctuary — hours of mental white space in wood-paneled lounges
  with the ocean's low-frequency rhythm as the backdrop for intense tactical logic.

```json
{
  "sailingAngleTitle": "The Out-of-Office Enigma",
  "theCorePitch": "Your brain doesn’t know how to turn off corporate problem-solving just by staring at a beach. Trade the digital exhaustion of your daily grind for the pure physics of a masterfully machined sequential discovery puzzle, cracked during hours of uninterrupted cognitive flow in a quiet ocean lounge.",
  "visualAnchor": "A moody, elegant close-up shot on a polished wood table inside a quiet ship lounge. A heavy, gleaming machined-brass trick lock rests on a dark velvet mat alongside a glass of single-malt scotch, while massive panoramic windows in the background reveal the deep blue, unhurried expanse of the open ocean.",
  "targetAudienceDescriptor": "High-net-worth professionals, software engineers, executives, and mechanical puzzle collectors seeking an intellectually stimulating way to completely disconnect from screens and digital noise.",
  "relevantKeywords": ["sequential discovery puzzles", "trick locks", "mechanical puzzles", "Hanayama cast puzzles", "wood puzzle boxes", "analog brain teasers", "cognitive flow state"],
  "destinationAndTimeOfYearHints": "Transatlantic crossings, scenic fjord sailings, or open-ocean itineraries with high sea-day densities, scheduled during shoulder seasons to guarantee lower public venue volume and maximum quietude.",
  "onboardAssetRequirements": "Vessels favoring a traditional ocean-liner aesthetic, featuring dedicated library carrels, upscale wood-paneled observation bars (e.g., Schooner bars), stable/level lounge tables, and a distinct layout design that prioritizes quiet acoustic sanctuaries over high-decibel family attractions."
}
```

## How this maps to the current implementation (as-built)

| Concern | File | Notes |
|---|---|---|
| Contracts | `lib/cb/deals-system/deal-discovery-types.ts` | `SailingAngleProfile` (7 fields) + `DealDiscoveryIdea` (`isolatedNiche` + `sailingAngleProfile` + `aiTrace`) + `DealDiscoveryIdeasCache`. |
| Research source (read-only) | `lib/cb/deals-system/discovery-research-source.ts` | Reads saved `discovery-research-cache.json`; no Gemini run from Deals. |
| Generator | `lib/cb/deals-system/deal-discovery-generator.ts` | Claude Opus via gateway (`ModelName.CLAUDE_4_OPUS`), AI-only/hard-fail. System role + rules + Step 1/2 + both few-shot examples baked into the prompt. Returns `{ ideas, skipped, exhausted }`. |
| Ban check | `validateSailingAngleProfile()` (same file) | Flags mass-group terms and generic phrases ("unwind/escape/luxury/paradise") as operator warnings; does not auto-rewrite. |
| Storage | `lib/cb/deals-system/deal-discovery-cache.ts` | `deal-discovery-ideas-cache.json`; `upsertDealDiscoveryIdea` is idempotent on id. |
| API | `app/api/tests/deals-system/discovery/route.ts` | `GET` status/ideas; `POST {action:"generate", count?}` passes existing angles for dedup and returns generated/skipped/exhausted. |
| Tab UI | `app/(tests)/tests/deals-system/discovery/page.tsx` + `discovery-view.tsx` | Renders each angle (niche, title, pitch, audience, visual anchor, destination/season, onboard assets, keyword chips) + AI-debug panel; "Generate package ideas" with a count selector (1–8). |
| Dashboard link | `app/(tests)/tests/deals-system/dashboard-view.tsx` | "Step 1 · Discovery" panel with research freshness + idea count, and the cached angles as selectable bullets — each with a "manifested" badge and a "Manifest →" deep-link into Step 2 (`?angleId=`). |
| Test | `tests/deal-discovery-generator.ts` (+ `tests/deals-ai-stub.ts`) | Shape, ban check, missing-research error, dedup-on-rerun, cache idempotency. Run: `npm run test:deal-discovery`. |

Each `DealDiscoveryIdea` carries `isolatedNiche` (Step 1) and `sailingAngleProfile`
(Step 2). `RetailDiscoveryBrief` is no longer the discovery output (it remains in use
by the separate assembly/research pipeline).

## Repeat-run behavior — no regenerating the same ideas

Clicking "Generate package ideas" multiple times against the same saved research must
not reproduce the same angles. Two mechanisms enforce this:

1. **Prompt exclusion list.** The route loads the cached angles and passes them as
   `existingAngles`. The generator injects an "ALREADY GENERATED — DO NOT REPEAT" block
   listing every prior `isolatedNiche` + title, instructing the model to isolate
   entirely different niches and avoid near-neighbors. (Mirrors the Group discovery
   pipeline's dedup exclusion in `app/api/groups/discovery/core-logic.ts`.)
2. **Skip + report on collision.** Returned angles are compared (normalized,
   case/punctuation-insensitive) against existing niches AND titles, and against each
   other within the batch. A match is dropped and reported in `skipped[]` rather than
   overwriting the original or saving a near-duplicate. Only genuinely-new angles are
   persisted.

**Exhaustion signal.** The saved research holds a small fixed set of niches (~5). When a
run yields nothing new, the result is flagged `exhausted` and the UI tells the operator
plainly to refresh discovery research to find new niches — rather than reshuffling the
same niches. The count selector still controls how many angles a run requests (1–8); new
angles accumulate in the cache instead of replacing.

## Downstream contract (why the schema is shaped this way)

A selected angle feeds **Step 2 — Trip Manifestation** (see `TRIP_MANIFESTATION_DESIGN.md`),
which correlates it against the CB promo intelligence to manifest the cruise line /
destination / sail window / perks that pre-fill SOURCE & ASSEMBLE. The selected trip
manifest then deep-links into **Step 3 — Ad Copywriter** (see `COPYWRITER_DESIGN.md`),
where the unified manifest is expanded into ad copy.

```
Saved niche research ──▶ Discovery Lab ──▶ SailingAngleProfile
                                              │
        ┌─────────────────────────────────────┴───────────────────────────┐
        ▼ (ad-creative payload)                                            ▼ (inventory match keys)
  sailingAngleTitle / theCorePitch / visualAnchor /                 onboardAssetRequirements +
  targetAudienceDescriptor / relevantKeywords                       destinationAndTimeOfYearHints
        │                                                                  │
        └───────────────────────────┬──────────────────────────────────────┘
                                     ▼
                Step 2 · Trip Manifestation (angle + promo intelligence)
                                     ▼
              DealTripManifest → SOURCE & ASSEMBLE → Step 3 · Ad Copywriter
```

## Guardrails (carried from policy)
- LLM Gateway Mandate: all generation via `generateStructuredObject` + a `ModelName`
  enum value; no provider SDKs in feature code.
- Deals stay separate from Groups: the Lab only **reads** the shared research cache;
  no DynamoDB writes, no Group business-logic imports.
- No Gemini/Perplexity from Deals — saved research is operator-produced via the Group
  pipeline; the tab shows a clear empty state if the cache is missing.
- No booking, hold, or publish from discovery — it produces angles only.
