# Cruise Brothers Knowledge Ingestion Process

## Purpose
Generate `.github/data/cb-knowledge-cache.json` for the `cruise_brothers_knowledge` chat tool from authenticated Cruise Brothers pages.

## Prerequisites
- Playwright browsers installed (`npx playwright install`)
- Environment variables available:
  - `CB_EMAIL`
  - `CB_PASSWORD`

## Run
```powershell
$env:CB_EMAIL = "you@example.com"
$env:CB_PASSWORD = "your-password"
npx tsx scripts/ingest-cbagenttools.ts
```

## Output
- File: `.github/data/cb-knowledge-cache.json`
- Shape: object containing `generatedAtIso` and `entries[]`

## Notes
- The script fails fast if login does not complete.
- The `cruise_brothers_knowledge` tool throws a deterministic error if this cache file is missing.
- Re-run ingestion whenever agency resource content changes.
