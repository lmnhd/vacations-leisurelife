# Quick Start: Automated Deal Updates

## Goal

Refresh Cruise Brothers deals in the background and make production read the stored Dynamo payload.

## Step 1: Set Environment Variables

```env
CRON_SECRET=your_random_secret_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_CACHE_TABLE_NAME=lll-app-cache
OPENAI_API_KEY=sk-...
PEXELS_API_KEY=your_pexels_key
ALLOW_AI_IN_PRODUCTION=true
```

## Step 2: Run the Refresh

```powershell
npm run update-deals
```

Expected output:

```text
--- Starting Deal Update Trigger ---
Target URL: http://localhost:3000/api/serverutils/update-deals
Success!
Summary: Deals updated successfully
Processed: 7
Homepage Deals Stored: 6
Generated At: 2026-03-28T00:00:00.000Z
```

## Step 3: Verify

1. Open the homepage and confirm the deals section renders.
2. Open a destination deal page and confirm the content is already cached.
3. If production has no homepage deals, run the refresh job again.

## Production Rule

- Background refresh writes the data.
- Production reads the data.
- Production should not rebuild homepage deal tiles during request handling.

## Route Used By Schedulers

```text
/api/serverutils/update-deals?key=YOUR_CRON_SECRET
```

## More Detail

See `.github/DOCS/automated-deal-updates.md`.
