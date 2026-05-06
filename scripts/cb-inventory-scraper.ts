/**
 * CB Group Inventory Scraper — Exportable Library
 *
 * Refactored from scripts/scrape-cb-deals.ts to be callable by run-phase-b.ts.
 * Playwright-based — must be run via Node (tsx), NOT inside Next.js API routes.
 *
 * Usage:
 *   import { scrapeGroupInventory } from './cb-inventory-scraper';
 *   const inventory = await scrapeGroupInventory();
 */

import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { CbGroupInventoryItem } from "../lib/campaigns/cb-inventory-types";

const CB_BASE_URL = "https://www.cbagenttools.com";
const PRICE_ADVANTAGES_URL = `${CB_BASE_URL}/groups/view_groups/?price_advantage=on`;
const STATE_FILE = path.join(process.cwd(), ".playwright-state.json");

// ─── Auth (shared pattern with OdysseusEngine) ───────────────────────────────

async function getAuthenticatedPage(): Promise<{
  browser: Awaited<ReturnType<typeof chromium.launch>>;
  page: Awaited<
    ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>
  >;
}> {
  if (existsSync(STATE_FILE)) {
    console.log("[cb-inventory-scraper] Loading saved session...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: STATE_FILE });
    const page = await context.newPage();

    await page.goto(`${CB_BASE_URL}/bookings/home/`, {
      waitUntil: "networkidle",
    });
    const currentUrl = page.url().toLowerCase();

    if (!currentUrl.includes("/login") && !currentUrl.includes("/accounts/")) {
      console.log("[cb-inventory-scraper] ✅ Authenticated via saved session.");
      return { browser, page };
    }

    console.log(
      "[cb-inventory-scraper] Session expired — performing fresh login...",
    );
    await browser.close();
  }

  const email = process.env.CB_EMAIL;
  const password = process.env.CB_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "CB_EMAIL and CB_PASSWORD must be set for CB inventory scraping.",
    );
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${CB_BASE_URL}/accounts/login/`, {
    waitUntil: "domcontentloaded",
  });
  await page.fill('input#username, input[name="username"]', email);
  await page.fill('input#password, input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle", { timeout: 30000 });

  const postLoginUrl = page.url().toLowerCase();
  if (postLoginUrl.includes("/login") || postLoginUrl.includes("signin")) {
    await browser.close();
    throw new Error(
      "CB login failed — still on login page. Check CB_EMAIL/CB_PASSWORD.",
    );
  }

  await context.storageState({ path: STATE_FILE });
  console.log("[cb-inventory-scraper] ✅ Login successful. Session saved.");

  return { browser, page };
}

// ─── Core Scrape ─────────────────────────────────────────────────────────────

function parsePrice(raw: string): number {
  const digits = raw.replace(/[^0-9.]/g, "");
  return digits ? parseFloat(digits) : 0;
}

export async function scrapeGroupInventory(): Promise<CbGroupInventoryItem[]> {
  const { browser, page } = await getAuthenticatedPage();

  try {
    console.log(
      "[cb-inventory-scraper] Navigating to view_groups (price_advantage=on)...",
    );
    await page.goto(PRICE_ADVANTAGES_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    const rawItems = await page.evaluate((sourceUrl: string) => {
      const rows = document.querySelectorAll(
        "table tbody tr, .group-row, .list-group-item",
      );
      const results: Array<{
        groupId: string;
        shipName: string;
        vendor: string;
        itinerary: string;
        sailDate: string;
        startingPrice: string;
        priceAdvantage: string;
        departurePort: string;
        nights: string;
        sourceUrl: string;
      }> = [];

      rows.forEach((row) => {
        const cells = row.querySelectorAll("td");
        if (cells.length < 4) return;

        const cellTexts = Array.from(cells).map(
          (c) => c.textContent?.trim() ?? "",
        );

        // Also try to grab the group link from the first cell's anchor
        const anchor = cells[0]?.querySelector("a");
        const href = anchor?.getAttribute("href") ?? "";
        const groupIdMatch = href.match(/view_group\/(\d+)/);
        const groupId = groupIdMatch ? groupIdMatch[1] : cellTexts[0];

        results.push({
          groupId,
          shipName: cellTexts[1] ?? "",
          vendor: cellTexts[2] ?? "",
          itinerary: cellTexts[3] ?? "",
          departurePort: cellTexts[4] ?? "",
          nights: cellTexts[5] ?? "",
          sailDate: cellTexts[6] ?? "",
          startingPrice: cellTexts[7] ?? "",
          priceAdvantage: cellTexts[8] ?? "",
          sourceUrl,
        });
      });

      return results;
    }, PRICE_ADVANTAGES_URL);

    const items: CbGroupInventoryItem[] = rawItems.map((item) => ({
      ...item,
      startingPriceNumber: parsePrice(item.startingPrice),
      priceAdvantageNumber: parsePrice(item.priceAdvantage),
    }));

    console.log(
      `[cb-inventory-scraper] ✅ Scraped ${items.length} group inventory items.`,
    );
    return items;
  } finally {
    await browser.close();
  }
}

/**
 * Given a CBAT groupId (e.g. "44071"), visits the group detail page
 * and extracts the true Personal Link which contains the actual Odysseus package ID.
 */
export async function scrapeGroupPersonalLink(
  groupId: string,
): Promise<string | null> {
  const { browser, page } = await getAuthenticatedPage();
  try {
    const url = `${CB_BASE_URL}/groups/view_group/${groupId}/`;
    console.log(
      `[cb-inventory-scraper] Navigating to group details to extract personal link: ${url}`,
    );
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Sometimes the link takes a moment to render or is just a static anchor
    const personalLink = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a"));
      const link = anchors.find(
        (a) =>
          a.href.includes("swift") ||
          a.href.includes("package") ||
          a.innerText.includes("Personal Link"),
      );
      return link ? link.href : null;
    });

    if (personalLink) {
      console.log(
        `[cb-inventory-scraper] ✅ Found true Personal Link: ${personalLink}`,
      );
    } else {
      console.warn(
        `[cb-inventory-scraper] ⚠️ Could not find Personal Link on page ${url}`,
      );
    }

    return personalLink;
  } catch (e) {
    console.error(
      `[cb-inventory-scraper] Error extracting personal link for group ${groupId}:`,
      e,
    );
    return null;
  } finally {
    await browser.close();
  }
}
