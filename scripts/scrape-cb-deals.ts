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
import { existsSync, readFileSync } from 'node:fs';
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
const ESBUILD_BROWSER_HELPER_STUB =
    'window.__name = (f) => f; window.__publicField = (o,k,v) => { o[k] = v; return v; }; window.__defProp = Object.defineProperty;';

// ─── Types ────────────────────────────────────────────────────────────────────

type PromoDeal = {
    title: string;
    description: string;
    validUntil: string;
    isFeatured: boolean;
    category: 'cruise' | 'land' | 'agent_incentive' | 'tln_amenity' | 'unknown';
    detailUrl?: string;
    primaryBookingLink?: string;
    bookingLinks: string[];
    allLinks: string[];
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
    detailUrl?: string;
    personalLink?: string;
    /** True when the group's Contact field is "House" — CB owns the block and no
     *  agent personal booking link will ever appear. Booking must go through the
     *  Odysseus retail path instead. */
    isHouseGroup?: boolean;
    sourceUrl: string;
};

type DealsCache = {
    generatedAtIso: string;
    promos: PromoDeal[];
    priceAdvantages: PriceAdvantageDeal[];
};

function hasArg(name: string): boolean {
    return process.argv.includes(name);
}

function readExistingCache(): DealsCache {
    if (!existsSync(OUTPUT_FILE_PATH)) {
        return { generatedAtIso: '', promos: [], priceAdvantages: [] };
    }

    try {
        const parsed = JSON.parse(readFileSync(OUTPUT_FILE_PATH, 'utf-8')) as Partial<DealsCache>;
        return {
            generatedAtIso: parsed.generatedAtIso ?? '',
            promos: Array.isArray(parsed.promos) ? parsed.promos : [],
            priceAdvantages: Array.isArray(parsed.priceAdvantages) ? parsed.priceAdvantages : [],
        };
    } catch {
        return { generatedAtIso: '', promos: [], priceAdvantages: [] };
    }
}

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
        await page.addInitScript(ESBUILD_BROWSER_HELPER_STUB);

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
    const email = process.env.CB_EMAIL;
    const password = process.env.CB_PASSWORD;

    if (!email || !password) {
        throw new Error('Missing CB_EMAIL or CB_PASSWORD. Set env vars or refresh .playwright-state.json manually.');
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(ESBUILD_BROWSER_HELPER_STUB);

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

    const promos = await page.evaluate(({ sourceUrl, baseUrl }: { sourceUrl: string; baseUrl: string }) => {
        const cards = document.querySelectorAll('.result-wrapper.card, .card, [class*="promo"]');
        const results: PromoDeal[] = [];
        const seenKeys = new Set<string>();

        cards.forEach((card) => {
            const titleEl = card.querySelector('h3, h4.card-title, .card-title');
            const descEl = card.querySelector('p, .card-text, .description');
            const footerEl = card.querySelector('.card-footer, footer, h4:last-child');
            const featuredEl = card.querySelector('.featured, .badge, [class*="featured"]');
            const detailLinkEl = Array.from(card.querySelectorAll('a')).find((anchor) => {
                const href = anchor.getAttribute('href') ?? '';
                return href.includes('/marketing/promotion/');
            });

            const title = titleEl?.textContent?.trim() ?? '';
            const description = descEl?.textContent?.trim() ?? '';
            const validUntil = footerEl?.textContent?.trim() ?? '';
            const isFeatured = featuredEl !== null;
            let detailUrl: string | undefined;

            try {
                const href = detailLinkEl?.getAttribute('href') ?? '';
                detailUrl = href ? new URL(href, baseUrl).href : undefined;
            } catch {
                detailUrl = undefined;
            }

            const key = detailUrl ?? `${title}:${description.slice(0, 80)}`;
            if ((title.length > 0 || description.length > 0) && !seenKeys.has(key)) {
              seenKeys.add(key);
              results.push({
                title,
                description: description.slice(0, 500),
                validUntil,
                isFeatured,
                category: 'unknown' as const,
                detailUrl,
                primaryBookingLink: undefined,
                bookingLinks: [],
                allLinks: [],
                sourceUrl,
              });
            }
        });

        Array.from(document.querySelectorAll('a[href*="/marketing/promotion/"]')).forEach((anchor) => {
            const title = anchor.textContent?.trim() ?? '';
            let detailUrl: string | undefined;

            try {
                const href = anchor.getAttribute('href') ?? '';
                detailUrl = href ? new URL(href, baseUrl).href : undefined;
            } catch {
                detailUrl = undefined;
            }

            const key = detailUrl ?? `${title}:`;
            if (title.length > 0 && !seenKeys.has(key)) {
              seenKeys.add(key);
              results.push({
                title,
                description: '',
                validUntil: '',
                isFeatured: false,
                category: 'unknown' as const,
                detailUrl,
                primaryBookingLink: undefined,
                bookingLinks: [],
                allLinks: [],
                sourceUrl,
              });
            }
        });

        return results;
    }, { sourceUrl: TODAYS_PROMOS_URL, baseUrl: CB_BASE_URL });

    for (const promo of promos) {
        if (!promo.detailUrl) {
            continue;
        }

        const links = await scrapePromoDetailLinks(page, promo.detailUrl);
        promo.bookingLinks = links.bookingLinks;
        promo.primaryBookingLink = links.bookingLinks[0];
        promo.allLinks = links.allLinks;
    }

    const bookablePromos = promos.filter((promo) => promo.primaryBookingLink).length;
    console.log(`[scrape-cb-deals] Scraped ${promos.length} promos from Today's Promos (${bookablePromos} with dynamic booking links).`);
    return promos;
}

async function scrapePromoDetailLinks(
    page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>,
    detailUrl: string,
): Promise<{ bookingLinks: string[]; allLinks: string[] }> {
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    return page.evaluate(({ baseUrl }: { baseUrl: string }) => {
        const unique = (values: string[]) => Array.from(new Set(values));
        const allLinks = unique(
            Array.from(document.querySelectorAll('a'))
                .map((anchor) => {
                    const href = anchor.getAttribute('href') ?? '';
                    try {
                        return href ? new URL(href, baseUrl).href : '';
                    } catch {
                        return '';
                    }
                })
                .filter((href) => href.startsWith('http')),
        );

        const bookingLinks = allLinks.filter((href) =>
            /^https:\/\/bookings\.cbagenttools\.com\/swift\/cruise\/package\/[^/?#]+/i.test(href),
        );

        return {
            bookingLinks,
            allLinks,
        };
    }, { baseUrl: CB_BASE_URL });
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

        const pageResults = await page.evaluate(
            ({ sourceUrl, baseUrl }) => {
                const rows = document.querySelectorAll('table tbody tr');
                const results: Array<{
                    groupId: string; shipName: string; vendor: string; itinerary: string;
                    departurePort: string; nights: string; sailDate: string;
                    startingPrice: string; priceAdvantage: string;
                    detailUrl?: string; personalLink?: string; sourceUrl: string;
                }> = [];

                rows.forEach((row) => {
                    const cells = row.querySelectorAll('td');
                    const cellTexts = Array.from(cells).map((cell) => cell.textContent?.trim() ?? '');
                    if (cellTexts.length < 3 || !cellTexts[0]) return;
                    const firstCellLink = cells[0]?.querySelector('a');
                    const firstCellHref = firstCellLink?.getAttribute('href') ?? '';
                    let detailUrl: string | undefined;
                    if (/view_group\/[0-9]+/.test(firstCellHref)) {
                        try {
                            detailUrl = new URL(firstCellHref, baseUrl).href;
                        } catch {
                            detailUrl = undefined;
                        }
                    }
                    const hrefGroupId = firstCellHref.match(/view_group\/([0-9]+)/)?.[1];
                    let personalLink: string | undefined;
                    for (const anchor of Array.from(row.querySelectorAll('a'))) {
                        const rawHref = anchor.getAttribute('href') ?? '';
                        let absolute = '';
                        try {
                            absolute = new URL(rawHref, baseUrl).href;
                        } catch {
                            absolute = '';
                        }
                        if (!absolute.startsWith('http')) continue;
                        if (
                            !absolute.includes('cbagenttools.com') ||
                            absolute.includes('bookings.cbagenttools.com') ||
                            absolute.includes('/swift/') ||
                            absolute.includes('/web/cruises/')
                        ) {
                            personalLink = absolute;
                            break;
                        }
                    }

                    results.push({
                        groupId:       hrefGroupId ?? cellTexts[0] ?? '',
                        shipName:      cellTexts[1] ?? '',
                        vendor:        cellTexts[2] ?? '',
                        itinerary:     cellTexts[3] ?? '',
                        departurePort: cellTexts[4] ?? '',
                        nights:        cellTexts[5] ?? '',
                        sailDate:      cellTexts[6] ?? '',
                        startingPrice: cellTexts[7] ?? '',
                        priceAdvantage: cellTexts[8] ?? '',
                        detailUrl,
                        personalLink,
                        sourceUrl,
                    });
                });
                return results;
            },
            { sourceUrl: currentUrl, baseUrl: CB_BASE_URL },
        );

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
    const promosOnly = hasArg('--promos-only');
    const { browser, page } = await getAuthenticatedContext();

    try {
        const promos = await scrapeTodaysPromos(page);
        const existingCache = readExistingCache();
        let mergedGroups = existingCache.priceAdvantages;

        if (promosOnly) {
            console.log(`[scrape-cb-deals] Promos-only mode: preserving ${mergedGroups.length} cached group row(s).`);
        } else {
        // Primary pass: all groups (paginated, cross-line inventory)
        console.log('[scrape-cb-deals] Starting primary all-groups scrape (paginated)...');
        const allGroups = await scrapeGroupInventory(page, ALL_GROUPS_URL, true);

        // Enrichment pass: price-advantage groups (single page, for priceAdvantage field)
        console.log('[scrape-cb-deals] Starting price-advantage enrichment pass...');
        const priceAdvantageGroups = await scrapePriceAdvantages(page);

        // Merge: preserve the richer all-groups row, then overlay price advantage
        // fields that are unique to the price-advantage view.
        const priceAdvantageMap = new Map<string, PriceAdvantageDeal>(
            priceAdvantageGroups.map((g) => [g.groupId, g]),
        );
        mergedGroups = allGroups.map((g) => {
            const priceAdvantage = priceAdvantageMap.get(g.groupId);
            if (!priceAdvantage) return g;
            return {
                ...g,
                priceAdvantage: priceAdvantage.priceAdvantage || g.priceAdvantage,
                startingPrice: priceAdvantage.startingPrice || g.startingPrice,
                detailUrl: g.detailUrl || priceAdvantage.detailUrl,
                personalLink: g.personalLink || priceAdvantage.personalLink,
                sourceUrl: priceAdvantage.sourceUrl || g.sourceUrl,
            };
        });

        // Add any price-advantage-only entries not in the all-groups pass
        for (const pg of priceAdvantageGroups) {
            if (!mergedGroups.some((g) => g.groupId === pg.groupId)) {
                mergedGroups.push(pg);
            }
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
        console.log(`[scrape-cb-deals] Promos: ${promos.length}, Bookable Promos: ${promos.filter((promo) => promo.primaryBookingLink).length}, Groups: ${mergedGroups.length}`);
    } finally {
        await browser.close();
    }
}

runScraper().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown scraper error';
    console.error(`[scrape-cb-deals] ${message}`);
    process.exitCode = 1;
});
