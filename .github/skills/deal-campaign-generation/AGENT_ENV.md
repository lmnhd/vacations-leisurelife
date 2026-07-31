# Deal Campaign Agent Environment

Read this before running scripts or local API calls.

## Script Classification

| Class | Examples | Rule |
| --- | --- | --- |
| CB/Odysseus research | package lookup, deep search, promotion scrape, link validation, pricing checks | Allowed autonomously for research and careful testing. |
| Temporary session testing | one active `brn` session | Allowed through the visible payment boundary. Reuse one session and do not enter traveler/payment data or submit a booking. |
| Pure validation | focused Deal tests, aggregate Deal tests, TypeScript | Safe to run autonomously. |
| Local HTTP and browser labs | `/api/tests/deals-system/*`, `/tests/deals-system` | Use only after the user confirms the dev server is running. Do not start it yourself. |
| Direct route-handler orchestration | agent scripts that import an operator-only route handler and call it with an in-memory `Request` | Allowed for the requested campaign workflow when no HTTP request reaches localhost. Keep the action review-state and use an existing contract rather than reimplementing the pipeline. |
| Cache/store campaign actions | manifest, copy, funnel, publication-review assembly, pricing correction | Allowed when requested. State what record or cache will change. Never approve or distribute without the required operator decision. |

## Reliable Commands

```powershell
# Search when no package ID is known.
npx tsx --env-file=.env.local scripts/lookup-odysseus-package.ts --line Celebrity --date 2026-08-02 --window 3 --best-effort

# Broad inventory-first search.
npm run deep-cruise-search -- --months 6,12,18

# Refresh and structure CB promotion intelligence.
npm run scrape-cb-promo-intelligence
npm run extract-cb-promo-intelligence

# Validate the Deals system.
npm run test:deals-system:all
npx tsc --noEmit --pretty false

# Read-only pricing drift check.
npm run check-deal-pricing -- --deal 1543052
npm run check-deal-pricing
```

Call `scripts/lookup-odysseus-package.ts` directly when PowerShell/npm argument forwarding drops option names.

## Exact-Package Fast Path

When a package ID is already known:

1. Load the exact package page by ID through the established package-capture path.
2. Require title, line, ship, sail date, day-by-day itinerary, and numeric cabin pricing.
3. Preserve the exact URL used for the successful capture.
4. Treat that exact page capture as link-health evidence when the package loads correctly.
5. Do not call a broad link-broker search afterward merely to reconstruct the same URL. A broad search can introduce runner-up ambiguity even though the exact package is valid.
6. Use canonical ID builders from `lib/cb/deals-system/deal-ids.ts`; the Deal ID is the package ID.

If exact package capture fails, stop and report that specific package failure before broadening the search.

## Bounded Promotion-Extraction Fallback

The scrape and extraction commands are separate layers. A successful raw scrape can remain useful when structured extraction times out.

After one extraction repair attempt:

1. Confirm the raw record is fresh and came from the expected CB promotion page.
2. Select only the promotion needed for the chosen campaign.
3. Preserve its raw details, agent instructions, source URL, capture date, booking window, and sailing window.
4. Structure only explicit source terms. Do not infer missing markets, exclusions, amounts, combinability, or rate eligibility.
5. Mark diagnostics `needs_review` and identify the extraction as bounded manual source review.
6. Put uncertain benefits in qualified claims or agent-only notes.
7. Attach the reviewed promotion record before copy generation.

Do not advertise a select-sailing benefit, onboard credit, free guest offer, deposit amount, or rate benefit without source and rate-level support.

## Review-State Assembly

Workbench assembly, direct route-handler orchestration, and the route action named `publish` create or update a review-state Deal.

- Treat `publish` as publication-review assembly.
- Keep `status` and `operatorApproval.status` at `needs_review`.
- Approval and distribution remain separate operator decisions.
- A green gate list does not itself authorize publication.

## Localhost Rule

Never assume `localhost:3000` is available. Ask the user to confirm the dev server is running before:

- calling a Deals HTTP route;
- testing the Workbench in a browser;
- generating through a lab page.

An agent script that imports a route handler and calls it with an in-memory `Request` is not a localhost call. It still must obey the route's review and approval contract.

## Temporary Odysseus Session Locks

Creating one short-lived `brn` session that may temporarily lock the sailing for about 15 minutes is allowed without a separate prompt.

- Reuse the active session.
- Do not create bulk, repeated, or parallel locks.
- Stop before traveler data, payment, or final submission.
- Allow the session to close and release.

## Booking Hard Stop

Explicit user approval is required before:

- an explicit or durable hold;
- a named reservation;
- submitting traveler information;
- entering payment;
- confirming a real booking.

Research, exact package inspection, promotion review, link validation, and review-state assembly do not cross this boundary.

## Data and Safety Notes

- Credentials live in `.env.local`. Never print or hardcode them.
- Deal caches live under `.github/data/`.
- Show stored and live cabin amounts before applying a pricing correction.
- Preserve unrelated dirty-worktree changes.
