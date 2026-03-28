# Automated Deal Updates System

## Overview

The Cruise Brothers deal update flow now works like this:

1. A background job pulls the live Cruise Brothers deals.
2. The job builds the homepage tile data ahead of time.
3. The job stores both the raw picks and the homepage tile payload in Dynamo.
4. The job prewarms the destination deal page content cache.
5. Production reads stored data instead of scraping or doing AI/image work during page render.

This removes the homepage timeout risk from `GET /` and keeps the destination deal pages on the same stored-data path.

## What Changed

Before this change:
- The homepage scraped live Cruise Brothers data during render.
- The homepage also did Pexels and AI formatting work during render.
- Destination deal pages depended on live pick lookup and then generated content on first visit.

After this change:
- The homepage reads a prepared payload from Dynamo.
- `cbPicks()` and `cbPick()` read the stored picks payload in production.
- The background update route is the only place that should pull live Cruise Brothers data for this flow.

## Core Files

### Shared types
`lib/cb/cb-deal-types.ts`

Defines the shared raw-pick and stored-homepage payload types.

### Dynamo store
`lib/cb/cb-deals-store.ts`

Stores and reads the aggregate Cruise Brothers payload from the app cache table.

Stored record:
- `PK = CB_DEALS`
- `SK = LATEST`

Payload contains:
- `picks`: raw Cruise Brothers deals
- `homepageDeals`: prepared tile records for the landing page
- `generatedAtIso`: refresh timestamp

### Refresh builder
`lib/cb/cb-deals-refresh.ts`

Builds the homepage tile payload during the background refresh. This is where the image lookup and AI formatting now happen.

### Homepage component
`components/cb/cbdestinationpickstile.tsx`

Reads the stored homepage payload. In production it does not do live enrichment work.

### Deal readers
`app/(dashboard)/(routes)/destinationdeal/[id]/index.js`

`cbPicks()` and `cbPick()` now default to the stored payload. Use `{ source: "live" }` only for refresh jobs or local debugging.

### Background refresh route
`app/api/serverutils/update-deals/route.ts`

This route now:
- pulls live Cruise Brothers picks
- builds and stores the homepage payload
- prewarms destination deal content
- returns a summary including homepage deal count and refresh timestamp

## Required Environment

Add these to the environment used by the refresh job:

```env
CRON_SECRET=your_random_secret_here
NEXT_PUBLIC_APP_URL=https://your-site.com
APP_CACHE_TABLE_NAME=lll-app-cache
OPENAI_API_KEY=sk-...
PEXELS_API_KEY=your_pexels_key
ALLOW_AI_IN_PRODUCTION=true
```

Notes:
- `ALLOW_AI_IN_PRODUCTION` is for the background refresh job, not for homepage rendering.
- Production page renders should not need live AI calls once the refresh job has populated Dynamo.

## Manual Refresh

Run:

```powershell
npm run update-deals
```

Expected output includes:
- processed deal count
- homepage deals stored count
- generated timestamp

## Production Rule

Production should follow this rule:
- write path: background refresh job
- read path: Dynamo only

If the stored payload is empty, production will not fall back to live scraping for the homepage path. Run the refresh job to repopulate the store.

## Scheduling

Use any scheduler that can call the protected update route:
- Vercel Cron
- GitHub Actions
- Windows Task Scheduler
- external cron service

Target route:

```text
/api/serverutils/update-deals?key=YOUR_CRON_SECRET
```

## Operational Checklist

1. Run `npm run update-deals` after new Cruise Brothers deals are available.
2. Confirm the response includes a non-zero `homepageDealsStored` count.
3. Confirm the homepage shows deals.
4. Confirm destination deal pages open with cached content.

## Failure Mode

If the refresh job does not run:
- production homepage deals can be empty
- production will not scrape live data as a fallback for this path

That is intentional. It keeps production reliable and predictable instead of falling back to slow request-time work.
