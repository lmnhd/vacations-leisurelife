# Automated Deal Updates System

## Overview

The automated deal updates system pre-caches cruise deal content from CruiseBrothers.com into the database, eliminating the 20+ second load times users experience when visiting deal pages for the first time.

## Problem Solved

Previously, when a user visited a destination deal page (e.g., `/destinationdeal/11`):
1. The page would scrape CruiseBrothers.com for deal data (~2-3 seconds)
2. Make 9 separate OpenAI API calls to generate content (title, body, itinerary, etc.) (~18-20 seconds)
3. Store the results in the database for future visits

This meant the first visitor to each deal would experience a 20+ second load time.

## Solution

The automated system runs weekly to:
1. Fetch all current deals from CruiseBrothers.com
2. Generate all content via OpenAI in the background
3. Cache everything in the database (AIAssist table)

Now when users visit deal pages, content loads instantly from the database.

---

## Architecture

### Core Components

#### 1. Shared Utility (`lib/deals-utils.ts`)
Centralizes the deal content generation logic:
- Fetches deal data from external scraper
- Runs 9 GPT tasks per deal (title, subtitle, body, etc.)
- Caches responses in the database via `aiAssistBackOff`

```typescript
export async function generateDealContent(id: string): Promise<{
  data: Record<string, string>, 
  pick: CBPickData 
} | null>
```

#### 2. Page Component (`app/(dashboard)/(routes)/destinationdeal/[id]/page.tsx`)
Updated to use the shared utility:
- Calls `generateDealContent(id)`
- Retrieves cached content if available
- Falls back to generating on-the-fly if not cached

#### 3. Background Update API (`app/api/serverutils/update-deals/route.ts`)
Processes all deals in bulk:
- Protected by `CRON_SECRET` environment variable
- Iterates through all available deals
- Logs success/failure for each deal
- Returns a summary JSON response

#### 4. Trigger Script (`scripts/trigger-update.js`)
Node.js script to manually trigger updates:
- Loads environment variables from `.env.local` or `.env`
- Calls the update API with authentication
- Displays results and status

#### 5. NPM Command
Added to `package.json`:
```json
"update-deals": "node scripts/trigger-update.js"
```

---

## Setup Instructions

### 1. Environment Variables

Add these to your `.env.local` (development) or production environment:

```env
# Required for background updates
ALLOW_AI_IN_PRODUCTION=true

# Secure key to protect the update endpoint (use a strong random string)
CRON_SECRET=your_random_secret_key_here

# Your site URL (for production)
NEXT_PUBLIC_APP_URL=https://your-site.com
```

**Security Note**: The `CRON_SECRET` prevents unauthorized access to the update endpoint. Generate a strong random key:
```powershell
# PowerShell command to generate a secure key
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

### 2. Database Setup

The system uses the existing `AIAssist` Prisma model:
```prisma
model AIAssist {
  id          String   @id @default(cuid())
  prompt      String   @db.Text
  response    String   @db.Text
  componentId String
  functionId  String
  ignore      Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

No additional migrations needed.

### 3. OpenAI Configuration

Ensure your `OPENAI_API_KEY` is set in your environment:
```env
OPENAI_API_KEY=sk-...
```

The system uses GPT-3.5-turbo by default (configured in `app/utils/api.ts`).

---

## Usage

### Manual Trigger (Testing/On-Demand)

Run the update script manually:
```powershell
npm run update-deals
```

**Output Example**:
```
--- Starting Deal Update Trigger ---
Target URL: http://localhost:3000/api/serverutils/update-deals
Success!
Summary: Deals updated successfully
Processed: 7
Details: [
  { id: "11", status: "success", title: "..." },
  { id: "6", status: "success", title: "..." },
  ...
]
```

### Automated Weekly Updates

Choose one of the following methods:

#### Option A: Vercel Cron (Recommended for Vercel deployments)

Create `vercel.json` in project root:
```json
{
  "crons": [
    {
      "path": "/api/serverutils/update-deals?key=your_random_secret_key",
      "schedule": "0 0 * * 0"
    }
  ]
}
```

Schedule formats:
- `"0 0 * * 0"` - Every Sunday at midnight (weekly)
- `"0 2 * * 1"` - Every Monday at 2 AM
- `"0 0 * * *"` - Every day at midnight

[Vercel Cron Documentation](https://vercel.com/docs/cron-jobs)

#### Option B: GitHub Actions

Create `.github/workflows/update-deals.yml`:
```yaml
name: Update Cruise Deals

on:
  schedule:
    - cron: '0 0 * * 0' # Every Sunday at midnight UTC
  workflow_dispatch: # Allow manual triggers

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Deal Update
        run: |
          curl -f "${{ secrets.APP_URL }}/api/serverutils/update-deals?key=${{ secrets.CRON_SECRET }}"
```

Required GitHub Secrets:
- `APP_URL`: Your production site URL
- `CRON_SECRET`: Your cron secret key

#### Option C: External Cron Service

Use services like:
- [cron-job.org](https://cron-job.org)
- [EasyCron](https://www.easycron.com)
- [Uptime Robot](https://uptimerobot.com) (monitoring + cron)

Configure to hit:
```
https://your-site.com/api/serverutils/update-deals?key=your_random_secret_key
```

#### Option D: Windows Task Scheduler (Self-Hosted)

1. Create a PowerShell script `trigger-update.ps1`:
```powershell
cd C:\path\to\vacations-leisurelife
npm run update-deals
```

2. Open Task Scheduler
3. Create Basic Task → Weekly → Sunday at midnight
4. Action: Start a Program
   - Program: `powershell.exe`
   - Arguments: `-File "C:\path\to\trigger-update.ps1"`

---

## How It Works

### Data Flow

```
┌─────────────────────────────────────────────────────────┐
│  Trigger (Cron/Manual)                                   │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  API Route: /api/serverutils/update-deals                │
│  - Validates CRON_SECRET                                 │
│  - Calls cbPicks() to get all deals                      │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
          ┌───────────────────────┐
          │  For Each Deal:       │
          └───────────┬───────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  generateDealContent(id)                                 │
│  - Scrapes CruiseBrothers.com for deal data             │
│  - Runs 9 GPT tasks (title, body, price, etc.)          │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  aiAssistBackOff()                                       │
│  - Checks database for cached response                   │
│  - If not found: calls OpenAI API                        │
│  - Stores response in AIAssist table                     │
│  - Returns content                                       │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
          ┌───────────────────────┐
          │  User Visits Page     │
          │  → Instant Load       │
          └───────────────────────┘
```

### Database Caching Strategy

The `AIAssist` table stores responses keyed by:
- `componentId`: `"destinationdeal" + dealId` (e.g., `"destinationdeal11"`)
- `functionId`: Task name (e.g., `"title"`, `"bodyText"`, `"price"`)
- `prompt`: The raw deal data (used for cache invalidation)

When a deal changes on CruiseBrothers.com, the prompt changes, so new content is generated.

### GPT Tasks

Each deal generates 9 pieces of content:

| Task | Description | Example |
|------|-------------|---------|
| `title` | Creative trip title | "Experience the Majesty of Alaska..." |
| `subtitle` | Supporting headline | "Explore Alaska in Luxury: 10 Nights..." |
| `mainImage` | Ship name for image search | "Princess Ruby Princess" |
| `mainImageAlt` | Image alt text | "Alaska cruise with Ruby Princess ship" |
| `bodyText` | 200-word article | "Don't miss out on this amazing deal..." |
| `featuresText` | Special offers list | "- onboard credit package available..." |
| `itinerary` | Ports of call | "Nassau and Perfect Day at CocoCay..." |
| `price` | Price formatting | "$1,799" |
| `tripLength` | Duration | "10 nights" |

---

## Monitoring & Troubleshooting

### Checking Last Update

Query the database:
```sql
SELECT 
  componentId, 
  functionId, 
  createdAt,
  updatedAt
FROM AIAssist 
WHERE componentId LIKE 'destinationdeal%'
ORDER BY updatedAt DESC
LIMIT 20;
```

### Common Issues

#### Issue: "Unauthorized" 401 Error
**Cause**: `CRON_SECRET` mismatch or missing
**Fix**: Verify the secret matches in both `.env` and your cron trigger URL

#### Issue: API returns "Internal Error"
**Cause**: OpenAI API failure or database connection issue
**Fix**: 
1. Check `OPENAI_API_KEY` is valid
2. Verify database connection (`DATABASE_URL`)
3. Check server logs for details

#### Issue: Content not updating
**Cause**: Cached responses still valid
**Fix**: 
- Delete old entries from `AIAssist` table for specific deals
- Or change the `prompt` (deal data) to invalidate cache

#### Issue: Slow updates
**Cause**: OpenAI rate limits or network issues
**Fix**:
- The system uses exponential backoff (via `exponential-backoff` package)
- Check OpenAI dashboard for rate limit status
- Consider upgrading OpenAI tier for higher limits

### Logs

Check application logs for update progress:
```
Starting background deal update...
Found 7 deals to process.
Processing deal: 11 - 10 Nights Ruby Princess
Processing deal: 6 - 3 Nights Utopia of the Seas
...
```

Each deal logs:
- Stored responses found: `stored response found`
- New API calls: `no stored response found, querying openai...`
- Success: `storing response...`

---

## Performance Metrics

### Before Automation
- First visit to deal page: **20-25 seconds**
- Subsequent visits: **2-3 seconds**
- User experience: Poor (long wait time)

### After Automation
- All visits to deal page: **2-3 seconds**
- Background update time: **~3 minutes for 7 deals**
- User experience: Excellent (consistent fast loads)

### Cost Considerations

OpenAI API costs (GPT-3.5-turbo):
- ~9 requests per deal
- ~500 tokens per request
- For 7 deals weekly: ~$0.05-0.10/week
- Monthly cost: ~$0.20-0.40

---

## Maintenance

### Weekly Checklist
1. Monitor cron job execution (check logs)
2. Verify all deals updated successfully
3. Spot-check a few deal pages for accurate content

### Monthly Tasks
1. Review OpenAI API usage and costs
2. Check database size of `AIAssist` table
3. Clean up old/unused cached responses if needed

### When to Re-Run Updates
- After CruiseBrothers.com releases new deals
- After changing GPT task instructions
- After detecting stale content on live pages

### Updating GPT Instructions

To change how content is generated, edit `lib/deals-utils.ts`:
```typescript
export const gptTasks: gptTask[] = [
  {
    task: "title",
    instruction: "YOUR NEW INSTRUCTION HERE",
  },
  // ...
];
```

Then delete cached responses and re-run updates:
```sql
DELETE FROM AIAssist WHERE functionId = 'title';
```
```powershell
npm run update-deals
```

---

## Related Files

### Core Implementation
- `lib/deals-utils.ts` - Shared content generation logic
- `app/(dashboard)/(routes)/destinationdeal/[id]/page.tsx` - Deal page component
- `app/(dashboard)/(routes)/destinationdeal/[id]/index.js` - CruiseBrothers scraper
- `app/utils/api.ts` - OpenAI API wrapper with caching

### Automation
- `app/api/serverutils/update-deals/route.ts` - Background update endpoint
- `scripts/trigger-update.js` - Manual trigger script
- `package.json` - NPM scripts

### Database
- `prisma/schema.prisma` - Database schema (AIAssist model)

---

## Future Enhancements

### Potential Improvements
1. **Email Notifications**: Send summary email after each update
2. **Slack/Discord Webhooks**: Alert team of update status
3. **Incremental Updates**: Only update changed deals (diff detection)
4. **Image Pre-caching**: Download and cache featured images
5. **Content Versioning**: Track content history for A/B testing
6. **Admin Dashboard**: UI to view update status and trigger manually
7. **Health Checks**: Monitor scraper reliability and OpenAI availability

### Scaling Considerations
- For 100+ deals: Consider parallel processing with rate limiting
- For high-frequency updates: Implement a job queue (Bull, BullMQ)
- For multiple sources: Generalize the scraper pattern

---

## Support

For issues or questions:
1. Check server logs first
2. Review this documentation
3. Test manually with `npm run update-deals`
4. Check OpenAI API status: [status.openai.com](https://status.openai.com)

---

**Last Updated**: February 4, 2026
**Version**: 1.0
**Author**: Automated Deal Update System Implementation
