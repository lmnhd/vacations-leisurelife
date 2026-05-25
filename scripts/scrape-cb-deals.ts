/**
 * Cruise Brothers Deals Scraper — Offline Ingestion Script.
 *
 * Uses the Playwright storageState pattern (same as Odysseus):
 *   - First run: opens browser visibly, waits for manual login, saves session
 *   - Subsequent runs: loads saved session, bypasses login entirely
 *
 * Scrapes: Today's Promos + Price Advantages → cb-deals-cache.json
 *
 * Usage: npx tsx scripts/scrape-cb-deals.ts
 */

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CB_BASE_URL = 'https://www.cbagenttools.com';
const TODAYS_PROMOS_URL = `${CB_BASE_URL}/marketing/todaysview/`;
const ALL_GROUPS_URL = `${CB_BASE_URL}/groups/view_groups/`;
const PRICE_ADVANTAGES_URL = `${CB_BASE_URL}/groups/view_groups/?price_advantage=on`;

/** Maximum pages to paginate through during the all-groups scrape (≈25 rows/page). */
const MAX_PAGES = 20;

/** Minimum days out for a sailing to be included in the cache (matches MINIMUM_CAMPAIGN_LEAD_DAYS). */
const MIN_LEAD_DAYS = 180;

const STATE_FILE = path.join(process.cwd(), '.playwright-state.json');
const OUTPUT_DIRECTORY = path.join(process.cwd(), '.github', 'data');
const OUTPUT_FILE_PATH = path.join(OUTPUT_DIRECTORY, 'cb-deals-cache.json');

// ─── Types ────────────────────────────────────────────────────────────────────

type PromoDeal = {
    title: string;
    description: string;
    validUntil: string;
    isFeatured: boolean;
    category: 'cruise' | 'land' | 'agent_incentive' | 'tln_amenity' | 'unknown';
    sourceUrl: string;
};

type PriceAdvantageDeal = {
    groupId: string;
    shipName: string;
    vendor: string;
    itinerary: string;
    departurePort: string;
    nights: string;
    sailDate: string;
    startingPrice: string;
    priceAdvantage: string;
    sourceUrl: string;
};

type DealsCache = {
    generatedAtIso: string;
    promos: PromoDeal[];
    priceAdvantages: PriceAdvantageDeal[];
};

// ─── Auth (Odysseus pattern) ──────────────────────────────────────────────────

async function getAuthenticatedContext(): Promise<{
    browser: Awaited<ReturnType<typeof chromium.launch>>;
    page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>;
}> {
    const hasExistingSession = existsSync(STATE_FILE);

    if (hasExistingSession) {
        console.log('[scrape-cb-deals] Found saved session. Loading cookies...');
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ storageState: STATE_FILE });
        const page = await context.newPage();

        await page.goto(`${CB_BASE_URL}/bookings/home/`, { waitUntil: 'networkidle' });

        const currentUrl = page.url().toLowerCase();
        if (currentUrl.includes('/login') || currentUrl.includes('/accounts/')) {
            console.log('[scrape-cb-deals] Session expired. Falling through to fresh login...');
            await browser.close();
        } else {
            console.log('[scrape-cb-deals] ✅ Authenticated via saved session.');
            return { browser, page };
        }
    }

    console.log('[scrape-cb-deals] No valid session. Performing automated login...');
    const email = process.env.CB_EMAIL ?? 'cc.lemonhead@gmail.com';
    const password = process.env.CB_PASSWORD ?? 'Rollpop1!';

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${CB_BASE_URL}/accounts/login/`, { waitUntil: 'domcontentloaded' });

    const usernameSelector = 'input#username, input[name="username"]';
    const passwordSelector = 'input#password, input[name="password"]';
    const submitSelector = 'button[type="submit"]';

    await page.waitForSelector(usernameSelector, { timeout: 15000 });
    await page.fill(usernameSelector, email);
    await page.fill(passwordSelector, password);
    await page.click(submitSelector);

    await page.waitForLoadState('networkidle', { timeout: 30000 });

    const currentUrl = page.url().toLowerCase();
    if (currentUrl.includes('/login') || currentUrl.includes('signin')) {
        await browser.close();
        throw new Error('CB Agent Tools login failed — still on login page. Check credentials.');
    }

    // Save session for future runs
    await context.storageState({ path: STATE_FILE });
    console.log('[scrape-cb-deals] ✅ Login successful. Session saved to .playwright-state.json');

    return { browser, page };
}

// ─── Scrape Today's Promos ────────────────────────────────────────────────────

async function scrapeTodaysPromos(
    page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>
): Promise<PromoDeal[]> {
    await page.goto(TODAYS_PROMOS_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const promos = await page.evaluate((sourceUrl: string) => {
        const cards = document.querySelectorAll('.result-wrapper.card, .card, [class*="promo"]');
        const results: PromoDeal[] = [];

        cards.forEach((card) => {
            const titleEl = card.querySelector('h3, h4.card-title, .card-title');
            const descEl = card.querySelector('p, .card-text, .description');
            const footerEl = card.querySelector('.card-footer, footer, h4:last-child');
            const featuredEl = card.querySelector('.featured, .badge, [class*="featured"]');

            const title = titleEl?.textContent?.trim() ?? '';
            const description = descEl?.textContent?.trim() ?? '';
            const validUntil = footerEl?.textContent?.trim() ?? '';
            const isFeatured = featuredEl !== null;

            if (title.length === 0 && description.length === 0) {
                return;
            }

            results.push({
                title,
                description: description.slice(0, 500),
                validUntil,
                isFeatured,
                category: 'unknown' as const,
                sourceUrl,
            });
        });

        return results;
    }, TODAYS_PROMOS_URL);

    console.log(`[scrape-cb-deals] Scraped ${promos.length} promos from Today's Promos.`);
    return promos;
}

// ─── Sail Date Filter ─────────────────────────────────────────────────────────

/** Returns true if the sail date string is parseable and < MIN_LEAD_DAYS out. */
function isTooClose(sailDateRaw: string, now: Date): boolean {
    if (!sailDateRaw) return false;
    const d = new Date(sailDateRaw);
    if (isNaN(d.getTime())) return false;
    const daysOut = (d.getTime() - now.getTime()) / 86400000;
    return daysOut < MIN_LEAD_DAYS;
}

// ─── Scrape Group Inventory (paginated) ───────────────────────────────────────

/**
 * Scrapes the CB group inventory table with correct column mapping.
 * Columns (0-indexed): groupId | ship | vendor | itinerary | port | nights | sailDate | priceFrom | priceAdvantage | personalLink
 *
 * @param url  Base URL to scrape (ALL_GROUPS_URL or PRICE_ADVANTAGES_URL)
 * @param paginate  Whether to follow pagination links (up to MAX_PAGES)
 */
async function scrapeGroupInventory(
    page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>,
    url: string,
    paginate: boolean,
): Promise<PriceAdvantageDeal[]> {
    const now = new Date();
    const allResults: PriceAdvantageDeal[] = [];
    const seenGroupIds = new Set<string>();
    let currentUrl = url;
    let pageNum = 0;

    while (pageNum < MAX_PAGES) {
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        const pageResults = await page.evaluate((sourceUrl: string) => {
            type RowResult = {
                groupId: string; shipName: string; vendor: string;
                itinerary: string; departurePort: string; nights: string;
                sailDate: string; startingPrice: string; priceAdvantage: string;
                sourceUrl: string;
            };
            const rows = document.querySelectorAll('table tbody tr');
            const results: RowResult[] = [];

            rows.forEach((row) => {
                const cells = row.querySelectorAll('td');
                const cellTexts = Array.from(cells).map((cell) => cell.textContent?.trim() ?? '');
                if (cellTexts.length < 3 || !cellTexts[0]) return;

                results.push({
                    groupId:       cellTexts[0] ?? '',
                    shipName:      cellTexts[1] ?? '',
                    vendor:        cellTexts[2] ?? '',
                    itinerary:     cellTexts[3] ?? '',
                    departurePort: cellTexts[4] ?? '',
                    nights:        cellTexts[5] ?? '',
                    sailDate:      cellTexts[6] ?? '',
                    startingPrice: cellTexts[7] ?? '',
                    priceAdvantage:cellTexts[8] ?? '',
                    sourceUrl,
                });
            });
            return results;
        }, currentUrl);

        let addedOnPage = 0;
        for (const row of pageResults) {
            if (!row.groupId || seenGroupIds.has(row.groupId)) continue;
            if (isTooClose(row.sailDate, now)) continue;
            seenGroupIds.add(row.groupId);
            allResults.push(row);
            addedOnPage++;
        }

        console.log(`[scrape-cb-deals] Page ${pageNum + 1}: ${pageResults.length} rows, ${addedOnPage} added (${allResults.length} total so far)`);

        if (!paginate) break;

        const nextUrl = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const nextLink = links.find((a) => /next|\u203a|>>/.test(a.textContent ?? ''));
            return nextLink?.href ?? null;
        });

        if (!nextUrl || nextUrl === currentUrl) break;
        currentUrl = nextUrl;
        pageNum++;
    }

    console.log(`[scrape-cb-deals] Finished scraping ${url} — ${allResults.length} groups across ${pageNum + 1} page(s).`);
    return allResults;
}

// ─── Scrape Price Advantages (single-page enrichment) ────────────────────────

async function scrapePriceAdvantages(
    page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>
): Promise<PriceAdvantageDeal[]> {
    return scrapeGroupInventory(page, PRICE_ADVANTAGES_URL, false);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runScraper(): Promise<void> {
    const { browser, page } = await getAuthenticatedContext();

    try {
        const promos = await scrapeTodaysPromos(page);

        // Primary pass: all groups (paginated, cross-line inventory)
        console.log('[scrape-cb-deals] Starting primary all-groups scrape (paginated)...');
        const allGroups = await scrapeGroupInventory(page, ALL_GROUPS_URL, true);

        // Enrichment pass: price-advantage groups (single page, for priceAdvantage field)
        console.log('[scrape-cb-deals] Starting price-advantage enrichment pass...');
        const priceAdvantageGroups = await scrapePriceAdvantages(page);

        // Merge: prefer price-advantage data when groupIds overlap
        const priceAdvantageMap = new Map<string, PriceAdvantageDeal>(
            priceAdvantageGroups.map((g) => [g.groupId, g]),
        );
        const mergedGroups = allGroups.map((g) => priceAdvantageMap.get(g.groupId) ?? g);

        // Add any price-advantage-only entries not in the all-groups pass
        for (const pg of priceAdvantageGroups) {
            if (!mergedGroups.some((g) => g.groupId === pg.groupId)) {
                mergedGroups.push(pg);
            }
        }

        const cache: DealsCache = {
            generatedAtIso: new Date().toISOString(),
            promos,
            priceAdvantages: mergedGroups,
        };

        await mkdir(OUTPUT_DIRECTORY, { recursive: true });
        await writeFile(OUTPUT_FILE_PATH, JSON.stringify(cache, null, 2), 'utf-8');

        console.log(`[scrape-cb-deals] ✅ Cache written to: ${OUTPUT_FILE_PATH}`);
        console.log(`[scrape-cb-deals] Promos: ${promos.length}, Groups: ${mergedGroups.length} (${allGroups.length} all-groups + ${priceAdvantageGroups.length} price-advantage)`);
    } finally {
        await browser.close();
    }
}

runScraper().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown scraper error';
    console.error(`[scrape-cb-deals] ${message}`);
    process.exitCode = 1;
});
