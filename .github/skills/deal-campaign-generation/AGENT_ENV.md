# Deal Campaign Agent Environment

Read this before running scripts or local API calls.

## Script Classification

| Class | Examples | Rule |
|---|---|---|
| Read-only CB/Odysseus automation | `lookup-odysseus-package`, `deep-cruise-search`, promo scrape, link validation | Allowed autonomously for research and validation. Stop before any hold, reservation, payment, or booking action. |
| Pure tests and local validation | `test:deals-system:all`, stage-specific `test:*` scripts, TypeScript checks | Safe to run autonomously. |
| Local HTTP routes | `/api/tests/deals-system/*` and browser labs | Use only after the user confirms the dev server is running. Do not start it yourself. |
| Cache-mutating campaign actions | Discovery generation, manifest creation, copy generation, publish assembly | Allowed when they are the requested campaign workflow. State what record or cache will be created or updated. |

## Reliable Commands

```powershell
# Find real Odysseus candidates near a date.
npm run lookup-odysseus-package -- --line Celebrity --date 2026-08-02 --window 3

# Broad inventory-first search.
npm run deep-cruise-search -- --months 6,12,18

# Refresh and structure CB promotion intelligence.
npm run scrape-cb-promo-intelligence
npm run extract-cb-promo-intelligence

# Validate the Deals system.
npm run test:deals-system:all
npx tsc --noEmit --pretty false
```

Use narrower stage tests during iteration. Run the aggregate Deals suite after workflow or contract changes.

## Localhost Rule

Never assume `localhost:3000` is available. Ask the user to confirm the dev server is running before:

- calling a Deals API route
- testing the Workbench in a browser
- generating through a lab page

Do not use a generic URL reader for localhost. Use the in-app browser when visual verification is requested and the server is confirmed running.

## Booking Hard Stop

Explicit user approval is required before:

- creating a hold or reservation
- submitting traveler information
- entering a payment step
- confirming a real booking

Research, inventory lookup, package inspection, promo review, and link validation do not cross this boundary.

## Data and Safety Notes

- Credentials live in `.env.local`. Never print or hardcode them.
- Deal caches live under `.github/data/`.
- Workbench assembly always creates or returns a review-state Deal. It must not auto-publish.
- A constructed package URL starts with unknown link health until validated.
- Preserve unrelated dirty-worktree changes.

