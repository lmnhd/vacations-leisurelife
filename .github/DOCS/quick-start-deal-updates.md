# Quick Start: Automated Deal Updates

This guide will get you up and running with automated deal updates in 5 minutes.

## Prerequisites

- OpenAI API key configured (`OPENAI_API_KEY`)
- Database connected (Prisma)
- Node.js installed

## Step 1: Configure Environment Variables

Add to your `.env.local` file:

```env
# Enable AI in production
ALLOW_AI_IN_PRODUCTION=true

# Create a secure random key
CRON_SECRET=your_random_secret_key_here

# Your site URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Generate a secure key** (PowerShell):
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

## Step 2: Test Manually

Run the update script:
```powershell
npm run update-deals
```

You should see:
```
--- Starting Deal Update Trigger ---
Target URL: http://localhost:3000/api/serverutils/update-deals
Success!
Summary: Deals updated successfully
Processed: 7
```

## Step 3: Set Up Weekly Automation

### For Vercel (Recommended)

Create `vercel.json` in your project root:

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

Replace `your_random_secret_key` with your actual `CRON_SECRET`.

### For GitHub Actions

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

Add these secrets to your GitHub repository:
- `APP_URL`: `https://your-site.com`
- `CRON_SECRET`: Your secret key

## Step 4: Verify It Works

1. Visit a deal page: `/destinationdeal/11`
2. Check load time (should be 2-3 seconds after first update)
3. View database: `SELECT * FROM AIAssist WHERE componentId LIKE 'destinationdeal%'`

## That's It!

Your deals will now update automatically every week. Users will experience fast load times on all deal pages.

---

## Need Help?

See the full documentation: [automated-deal-updates.md](./automated-deal-updates.md)

## Common Commands

```powershell
# Manual update
npm run update-deals

# Check database
npx prisma studio

# View logs (if running dev server)
# Check terminal for update progress
```

## Troubleshooting

**401 Unauthorized**: Check your `CRON_SECRET` matches in both `.env` and cron URL

**No updates**: Verify `ALLOW_AI_IN_PRODUCTION=true` is set

**Slow updates**: Normal - takes ~3 minutes for 7 deals with OpenAI API calls
