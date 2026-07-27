# Cruise Brothers Knowledge Ingestion Process

## Purpose
Generate `.github/data/cb-knowledge-cache.json` for the `cruise_brothers_knowledge`
chat/copilot tool from authenticated Cruise Brothers pages.

As of the July 2026 expansion the ingester goes beyond the vendor directory and
promotions: it inventories accessible CBAT sections from the portal navigation and
auto-ingests policy/training/help pages (insurance, deposits, refunds,
cancellation, flights, training) with full attribution and freshness metadata.

## Prerequisites
- Playwright browsers installed (`npx playwright install`)
- Environment variables available (already in `.env.local`):
  - `CB_EMAIL`
  - `CB_PASSWORD`

## Run
```powershell
npm run ingest:cbagenttools
```
(That script loads `.env.local` automatically via `--env-file`.)

To run without the npm wrapper:
```powershell
$env:CB_EMAIL = "you@example.com"
$env:CB_PASSWORD = "your-password"
npx tsx scripts/ingest-cbagenttools.ts
```

## What it does
1. **Inventory** — logs in, reads the portal navigation, and auto-enumerates
   candidate section links whose href/text match insurance, deposit, refund,
   cancellation, flight, training, or agency-policy patterns. No hardcoded URLs
   are needed for the discovered surfaces.
2. **Ingest with metadata** — each page is captured with `url`, `supplier`,
   `jurisdiction` (US state when inferable), `sectionKind`, `docType`,
   `effectiveDate` (when printed on the page), and `retrievedAtIso`.
3. **Tables and PDFs** — every table and every linked PDF becomes a *separately
   attributable* entry (`docType: "table"` / `"pdf"`).
4. **Manifest** — writes `.github/data/cb-knowledge-inventory.json` listing every
   section visited, its classification, and how many entries it produced.

The curated vendor directory and today's-view promotions keep their bespoke
high-quality extractors.

## Output
- `/.github/data/cb-knowledge-cache.json` — `{ generatedAtIso, entries[] }`
- `/.github/data/cb-knowledge-inventory.json` — review manifest
  (`{ generatedAtIso, totalEntries, entriesByKind, sections[] }`)

Entry shape and freshness thresholds are defined once in
`lib/chat/tools/cb-knowledge-schema.ts` and shared by the ingester, the retrieval
tool, the freshness checker, and the tests. All expansion fields are optional, so
pre-expansion entries continue to parse.

## Freshness check
```powershell
npm run check:cbagenttools-freshness
```
Reports stale entries (per-kind age thresholds) and undated entries treated as
operational guidance. Exit code `2` when stale entries exist — suitable for a
scheduled/CI check that signals a re-ingest is due.

## Tests
```powershell
npm run test:cb-knowledge-ingestion
```
Deterministic (no network/LLM) coverage: insurance/deposit/refund/cancellation/
flight retrieval by section kind, jurisdiction-facet steering, freshness
classification, and schema round-tripping of both cache shapes plus legacy
metadata-free entries. Also runs as part of
`npm run test:booking-assistant:operator-copilot`.

## Notes
- The script fails fast if login does not complete.
- The `cruise_brothers_knowledge` tool throws a deterministic error if the cache
  file is missing, and labels each match with its supplier/jurisdiction/effective
  date and a `fresh | stale | unknown` freshness state so the copilot can separate
  confirmed dated guidance from stale or authority-unclear material.
- Re-run ingestion whenever agency resource content changes or the freshness check
  reports stale entries.
