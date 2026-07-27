# Preliminary Replacement Cruise Plan

**Date:** July 25, 2026

## Purpose

When a caller comes in for a promoted Deal that no longer has bookable inventory, the operator needs a fast "save the sale" surface inside the operator dashboard that can produce a few close replacement cruises while the customer is still engaged.

This document is the first draft plan for that secondary operator system.

## Immediate Rule Now Live

As of July 25, 2026, homepage Deals are now hidden automatically once the sailing is within **45 days** of departure.

That is a simple protective rule, not a live inventory check. It should reduce obvious stale homepage promotions, but it will not eliminate every sold-out or unavailable call scenario. We still need a recovery tool for the calls that do happen.

## Goal

Give the operator 3-8 fast replacement options that feel close enough to the advertised cruise that the guest stays in purchase mode.

The system should optimize for:

- similar departure date
- similar destination or itinerary feel
- similar trip length
- similar price band
- similar premium level
- same cruise line when possible, but different line allowed
- immediately usable booking links

## Recommended Placement

Attach this as a secondary panel inside the existing operator-facing Deals / Booking Assistant area, not as a separate disconnected tool.

Recommended entry points:

- from a public Deal record in the Deals operator workbench
- from the callback / caller handling view when the operator marks the original cruise as unavailable
- from the Booking Assistant operator console after the caller is identified

## Trigger

The operator should be able to click one explicit action:

- `Find Similar Cruises`

Optional follow-up actions:

- `Same line first`
- `Widen to all lines`
- `Try earlier / later dates`
- `Lower price`
- `Upgrade experience`

## MVP Operator Flow

1. Operator opens the failed Deal or active caller record.
2. Operator clicks `Find Similar Cruises`.
3. System reads the original cruise facts and builds a replacement search profile.
4. System returns a ranked shortlist with 3-8 options.
5. Operator can quickly speak from the shortlist:
   - "I found one on the same week."
   - "I found one on the same itinerary with another line."
   - "I found one two days later at a similar price."
6. Operator can open booking links, copy the best option into notes, and send the customer the new link by the normal channel.

## Replacement Search Profile

The profile should be built from the original Deal's stored facts plus any live caller preferences already captured.

Core inputs:

- original deal id
- package id
- cruise line
- ship name
- sail date
- nights
- departure port
- destination
- ports of call
- cabin price range
- promo signals

Caller/session inputs when available:

- desired date flexibility
- preferred departure port flexibility
- hard budget ceiling
- adults / kids
- cabin preference
- strong line preference
- "same vibe" notes from the operator

## Ranking Logic

Start with a simple weighted score. We do not need ML for the first version.

Suggested first-pass weights:

- destination match: highest
- departure port match: highest
- date closeness: highest
- nights match: high
- same line: medium
- price closeness: medium
- ship class / premium feel: medium
- promo quality: medium-low

Suggested match buckets:

- `Best swap`
- `Close alternative`
- `Broader fallback`

## Recommended Selection Algorithm

Use a staged filter plus weighted scoring model.

### Hard preference order

The system should prefer candidates in this order:

1. Same destination family
2. Same departure port
3. Nearby departure port
4. Comparable sail date
5. Comparable number of nights
6. Comparable pricing
7. Same cruise line if available

### Stage 1: Candidate filter

Pull only candidates that meet these baseline rules:

- same destination family as the failed cruise
- sail date within plus/minus 14 days
- nights within plus/minus 2
- lead price within a reasonable comparison band

Port rule:

- first try exact departure port match
- if exact port results are too thin, widen to nearby substitute ports

Examples of nearby-port widening:

- Miami <-> Fort Lauderdale
- Port Canaveral <-> Tampa only as a weaker Florida fallback
- New York area ports grouped together when appropriate

### Stage 2: Weighted score

Score each candidate from 0 to 100.

Suggested simple weighting:

- destination family match: 30 points
- exact departure port match: 20 points
- nearby departure port match: 12 points
- sail date closeness: 15 points
- nights within plus/minus 1: 12 points
- nights within plus/minus 2: 8 points
- price within plus/minus 10 percent: 10 points
- price within plus/minus 20 percent: 6 points
- same cruise line: 5 points
- same premium tier / ship feel: 5 points

### Stage 3: Result labeling

Label results by score and by why they matched:

- `Best swap`: same destination, same port, close date, close nights, close price
- `Close alternative`: same destination, near port or near date, still commercially close
- `Broader fallback`: same destination but wider compromises on line, port, or price

### Minimum acceptable match

For the first version, do not show weak options that fail the core commercial shape.

Recommended minimum:

- same destination family is required
- departure port must be exact or nearby
- nights must be within plus/minus 2
- price should usually be within plus/minus 20 percent unless the operator explicitly widens

## Destination And Port Rules

The operator asked for replacements that still point to the same destination and
leave from the same port or a nearby port whenever possible. That should be the
default behavior, not an optional enhancement.

Default search posture:

- keep the same destination first
- keep the same departure port first
- widen only after exact matches are exhausted

This means a 7-night Eastern Caribbean sailing from Fort Lauderdale should not
initially be replaced by an unrelated Bahamas or Alaska result just because the
price is similar.

## Search Strategy

Use a widening funnel, so the operator gets something useful quickly.

### Pass 1

Strict search:

- same destination family
- same departure port
- same line
- sail date within plus/minus 7 days
- nights within plus/minus 1
- price within plus/minus 15 percent if enough supply exists

### Pass 2

Moderate widening:

- any line
- same destination family
- nearby departure ports allowed
- sail date within plus/minus 14 days
- nights within plus/minus 2
- price within plus/minus 20 percent

### Pass 3

Broader save-the-sale fallback:

- any line
- same destination family still preferred
- similar weather / trip type / premium level if destination-exact options are exhausted
- sail date within plus/minus 21 days
- nights within plus/minus 3
- broader price tolerance

## Data Sources

### First-choice source

Odysseus / CB package lookup results, because we need real bookable packages and real links.

### Secondary source

Existing deal / manifest / discovery cache data for speed and for pre-built context.

### Important rule

Do not show a replacement option unless it resolves to a real package id and a usable booking path.

## Recommended UI

### Left side

Original cruise summary:

- advertised deal name
- original sail date
- original price band
- reason the original failed

### Right side

Replacement shortlist cards:

- cruise line
- ship
- sail date
- nights
- departure port
- destination
- from price
- why it is similar
- booking link status

Per-card actions:

- `Open booking link`
- `Copy details`
- `Send to customer`
- `Use as replacement`

## Suggested Operator Language Support

Each result should generate one short talk track line.

Examples:

- "I found the closest match on the same week."
- "This one keeps the Caribbean routing but leaves two days later."
- "This one is a different line, but the price and trip length are very close."

This matters because speed of operator speech is part of conversion performance.

## State We Should Save

For each replacement search:

- source deal id
- caller or callback id if present
- time searched
- search profile snapshot
- options returned
- option selected
- whether the sale was saved

This gives us future evidence about what kinds of replacements actually close.

## MVP Boundaries

The first version does not need:

- autonomous booking
- full conversational AI
- perfect semantic itinerary similarity
- inventory prediction
- automatic customer messaging

The first version does need:

- real package options
- fast ranking
- clear operator actions
- logging of which replacement was chosen

## Preliminary Implementation Slices

### Slice 1: Search profile builder

Build a deterministic helper that turns a failed Deal plus optional caller notes into a replacement search request.

### Slice 2: Replacement package finder

Use existing package lookup / deep cruise search patterns to pull candidate packages across a bounded date window.

### Slice 3: Similarity scorer

Score and rank candidates with a simple weighted rule set.

### Slice 4: Operator panel

Add a replacement panel to the operator dashboard with shortlist cards and quick actions.

### Slice 5: Outcome logging

Record which option was presented and chosen.

## Best First MVP

If we want the fastest practical version, I recommend this exact first build:

1. Add `Find Similar Cruises` to the Deals operator workbench and Booking Assistant operator flow.
2. Use original Deal facts to search real packages within plus/minus 14 days.
3. Rank by destination, departure port, date, nights, price, then line.
4. Show top 5 options with live package ids and booking links.
5. Let the operator copy or send one replacement immediately.

That version is small enough to ship quickly and useful enough to save real calls.

## Open Questions

- Which existing operator surface should own the first UI: Deals workbench, Booking Assistant operator console, or both?
- Do we want the first version to search only cruises, or also land-based vacation products when the cruise is gone?
- Should replacement suggestions automatically inherit the original caller's notes and callback context?
- Do we want a hard price tolerance default, such as plus/minus 20 percent?

## Recommendation

Build this first in the operator dashboard as a guided shortlist tool, not as a full autonomous assistant.

The highest-value behavior is simple:

- recognize the failed advertised cruise
- produce a few real nearby alternatives
- help the operator pivot immediately

That is the shortest path to keeping the customer in motion instead of losing them during the inventory failure moment.

---

## July 26 Expansion: Live Call Copilot

The original plan treated full conversational AI as outside the replacement-search MVP. The operator need is broader than that first boundary: the same screen must also help answer insurance, state-specific coverage, deposits, refunds, cancellation terms, flight questions, agency procedures, pricing questions, and other issues that arise during a live booking call.

The operator console therefore now owns one combined **Live Call Copilot**. It replaces the Guest Flow Simulator, which was useful for early E2E testing but no longer belongs in the primary operating surface.

### Implemented operator experience

- The copilot accepts a free-form question during a call.
- Selecting a queue card automatically connects its current sailing context.
- Quick prompts cover insurance, deposits/refunds, flight information, and replacement cruises.
- Answers show the research tools used and clickable web sources when available.
- Agent availability and No Agents controls remain separate and unchanged.
- The E2E Guest Flow Simulator is no longer displayed in the operator console.

### Implemented knowledge and research sources

1. **Redacted current booking context**
   - cruise line, ship, sailing date, nights, itinerary, advertised price, traveler count, age at sailing, residency jurisdiction, cabin preferences, and relevant decisions
   - excludes names, email, phone, legal identity, birth dates, street addresses, loyalty identifiers, internal draft identifiers, and the private supplier booking URL
2. **Cruise Brothers / CB Agent Tools cache**
   - uses `.github/data/cb-knowledge-cache.json`
   - currently includes the ingested vendor directory, agency details, commission material, and promotions
3. **Live Odysseus search**
   - search-only inventory access for alternatives and comparisons
   - returns live package identifiers and pricing summaries when the supplier session is available
4. **Current web research**
   - built-in web search through the OpenAI Responses API
   - required for time-sensitive policies, insurer/state questions, airline details, schedules, prices, and other facts likely to change
5. **Cruise cost calculator**
   - deterministic total, per-person, per-night, and budget-variance calculations from amounts already known to the operator

### Model and gateway update

The operator copilot is routed through the central `lib/ai/llm-gateway` task map as `operator_copilot`. The top reasoning tier now resolves to `gpt-5.6-sol` and uses the OpenAI Responses API for first-class function tools and built-in web search.

No feature code instantiates the OpenAI client or hardcodes a raw model ID. The provider adapter remains inside the central gateway.

### Safety and approval boundary

The copilot can:

- research
- explain
- compare
- calculate
- search live cruises
- prepare options for the human operator

The copilot cannot:

- create or extend a hold
- create, change, or cancel a reservation
- submit payment
- finalize a booking
- reveal protected guest identity or contact data

All supplier commitments remain visible human actions with supplier verification.

### Source and freshness rules

- For a question about the selected cruise, the copilot first inspects the current public supplier booking page when one is stored. The URL and the sanitized page facts are available to the model as the primary source for that sailing. The server uses a read-only browser-rendered fallback when the supplier page loads its facts dynamically, and it still strips scripts and any guest identifiers from the extracted page text.
- Current policies, prices, availability, schedules, state rules, insurance terms, and flight facts must be researched rather than recalled.
- Internal CB Agent Tools cache results are labeled operational guidance when the date or authority is unclear.
- The answer must separate confirmed facts, estimates, and items that still require cruise-line, insurer, airline, or supplier verification.
- Web citations are returned to the operator beside the answer.

### Remaining knowledge limitation

The authenticated July 26 ingestion has now completed and expanded the CB Agent Tools cache from 111 legacy entries to **153 entries**. It includes the newly discovered training, agency, table, PDF, insurance, and policy surfaces that were accessible during that run.

Coverage still depends on what the authenticated portal exposed and what each supplier publishes. The next quality pass should:

1. inventory accessible CB Agent Tools sections and document types;
2. ingest policy and training pages with source URL, supplier, jurisdiction, effective date, and retrieval date;
3. preserve tables and linked PDFs as separately attributable entries;
4. schedule a freshness check and flag stale entries;
5. add deterministic retrieval tests for insurance, deposit, refund, cancellation, and flight questions.

The copilot uses the current supplier booking page and authoritative web sources to close remaining coverage gaps and explicitly identifies what still requires supplier confirmation.

### Authenticated ingestion expansion — implemented (July 26, 2026)

All five requirements above are now built, and the live authenticated
`npm run ingest:cbagenttools` run completed on July 26, 2026. The current cache
contains 153 entries; the inventory manifest and retrieval metadata now reflect
that live run.

1. **Inventory** — `scripts/ingest-cbagenttools.ts` logs in, reads the portal
   navigation, and auto-enumerates candidate insurance / deposit / refund /
   cancellation / flight / training / agency-policy section links (no hardcoded
   URLs for the discovered surfaces). It writes a review manifest to
   `.github/data/cb-knowledge-inventory.json` (`sections[]`, `entriesByKind`).
2. **Metadata** — every entry carries `url`, `supplier`, `jurisdiction` (US state
   when inferable), `sectionKind`, `docType`, `effectiveDate`, and
   `retrievedAtIso`. The shape lives in `lib/chat/tools/cb-knowledge-schema.ts`;
   all new fields are optional so the 111 legacy vendor entries continue to parse
   alongside the 42 newly ingested entries.
3. **Tables and PDFs** — each table (`docType: "table"`) and each linked PDF
   (`docType: "pdf"`) is ingested as a separately attributable entry.
4. **Freshness** — `scripts/check-cbagenttools-freshness.ts`
   (`npm run check:cbagenttools-freshness`) flags stale entries against per-kind
   age thresholds and reports undated entries as operational guidance; exit code 2
   signals a re-ingest is due (schedulable in CI). The retrieval tool
   (`lib/chat/tools/cruise-brothers-knowledge.ts`) now labels each match with its
   supplier / jurisdiction / effective date and a `fresh | stale | unknown` state.
5. **Deterministic retrieval tests** — `tests/cb-knowledge-ingestion.ts`
   (`npm run test:cb-knowledge-ingestion`, also part of the operator-copilot
   suite) covers insurance / deposit / refund / cancellation / flight retrieval by
   section kind, jurisdiction-facet steering, freshness classification, and schema
   round-tripping — no network or LLM.

Process doc: `.github/DOCS/PROCESSES/cb-knowledge-ingestion.md`.

### Implementation map

- `lib/booking-assistant/operator-copilot.ts` - redacted context, prompts, tool definitions, and orchestration
- `lib/booking-assistant/current-booking-link-research.ts` - approved-host fetch, HTML extraction, and guest-data scrubbing for the exact current booking page
- `app/api/booking-assistant/operator-copilot/route.ts` - fail-closed localhost operator API
- `app/(tests)/tests/booking-assistant-operator/operator-copilot-panel.tsx` - operator UI
- `lib/ai/llm-gateway/providers/openai.ts` - Responses API tool loop
- `lib/ai/llm-gateway/models.ts` - top-tier model and semantic task mapping
- `tests/booking-assistant-operator-copilot.ts` - model routing and PII-redaction regression coverage

### Local runtime requirements

- `OPENAI_API_KEY` must be configured.
- `BOOKING_ASSISTANT_ENABLED=true` must be set when intentionally running the localhost operator console.
- The existing local operator AWS role/KMS/DynamoDB preflight must pass.

The Booking Assistant flag remains a fail-closed operator security control and must not be enabled implicitly by application code.
