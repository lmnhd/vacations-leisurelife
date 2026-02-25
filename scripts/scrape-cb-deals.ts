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
const PRICE_ADVANTAGES_URL = `${CB_BASE_URL}/groups/view_groups/?price_advantage=on`;

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

// ─── Scrape Price Advantages ──────────────────────────────────────────────────

async function scrapePriceAdvantages(
    page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>
): Promise<PriceAdvantageDeal[]> {
    await page.goto(PRICE_ADVANTAGES_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const advantages = await page.evaluate((sourceUrl: string) => {
        const rows = document.querySelectorAll('table tbody tr, .group-row, .list-group-item');
        const results: PriceAdvantageDeal[] = [];

        rows.forEach((row) => {
            const cells = row.querySelectorAll('td, .col, span');
            const cellTexts = Array.from(cells).map((cell) => cell.textContent?.trim() ?? '');

            if (cellTexts.length < 3) {
                return;
            }

            results.push({
                groupId: cellTexts[0] ?? '',
                shipName: cellTexts[1] ?? '',
                vendor: cellTexts[2] ?? '',
                sailDate: cellTexts[3] ?? '',
                startingPrice: cellTexts[4] ?? '',
                priceAdvantage: cellTexts[5] ?? '',
                sourceUrl,
            });
        });

        return results;
    }, PRICE_ADVANTAGES_URL);

    console.log(`[scrape-cb-deals] Scraped ${advantages.length} price advantages.`);
    return advantages;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runScraper(): Promise<void> {
    const { browser, page } = await getAuthenticatedContext();

    try {
        const promos = await scrapeTodaysPromos(page);
        const priceAdvantages = await scrapePriceAdvantages(page);

        const cache: DealsCache = {
            generatedAtIso: new Date().toISOString(),
            promos,
            priceAdvantages,
        };

        await mkdir(OUTPUT_DIRECTORY, { recursive: true });
        await writeFile(OUTPUT_FILE_PATH, JSON.stringify(cache, null, 2), 'utf-8');

        console.log(`[scrape-cb-deals] ✅ Cache written to: ${OUTPUT_FILE_PATH}`);
        console.log(`[scrape-cb-deals] Promos: ${promos.length}, Price Advantages: ${priceAdvantages.length}`);
    } finally {
        await browser.close();
    }
}

runScraper().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown scraper error';
    console.error(`[scrape-cb-deals] ${message}`);
    process.exitCode = 1;
});
