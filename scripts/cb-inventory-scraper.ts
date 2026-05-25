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
import * as path from "node:path";
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

// Booking URL hostname fragments that indicate a real personal/retail link
const BOOKING_HOST_PATTERNS = [
  "swift",
  "package",
  "cruisingco",
  "royalcaribbean",
  "celebrity",
  "ncl.com",
  "carnival",
  "hollandamerica",
  "princess",
  "msccruises",
  "book",
  "reserve",
  "odysseus",
];

// Text content labels that indicate the link is a personal/booking link
const BOOKING_TEXT_LABELS = [
  "personal link",
  "personal booking",
  "booking link",
  "book now",
  "book this group",
  "reserve",
  "shareable link",
  "share link",
  "group link",
];

/**
 * Given a CBAT groupId (e.g. "44071"), visits the group detail page
 * and extracts the true Personal Link which contains the actual Odysseus package ID.
 *
 * Tries four strategies in order:
 *   1. Anchor whose visible text matches a booking label
 *   2. Anchor whose href matches a known booking URL pattern
 *   3. Any input[type=text] / input[type=url] value that looks like an external URL
 *   4. Any anchor pointing outside cbagenttools.com
 *
 * Always logs all found candidates when no strategy succeeds, to aid diagnosis.
 */
export async function scrapeGroupPersonalLink(
  groupId: string,
): Promise<string | null> {
  const { browser, page } = await getAuthenticatedPage();
  try {
    const url = `${CB_BASE_URL}/groups/view_group/${groupId}/`;
    console.log(
      `[cb-inventory-scraper] Navigating to group details: ${url}`,
    );
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    type LinkCandidate = { strategy: string; href: string; text: string };

    const result = await page.evaluate(
      ({
        hostPatterns,
        textLabels,
        baseHost,
      }: {
        hostPatterns: string[];
        textLabels: string[];
        baseHost: string;
      }): { found: string | null; debug: LinkCandidate[] } => {
        const anchors = Array.from(document.querySelectorAll("a"));
        const allExternal: LinkCandidate[] = anchors
          .filter(
            (a) =>
              a.href &&
              a.href.startsWith("http") &&
              !a.href.includes(baseHost),
          )
          .map((a) => ({
            strategy: "external-anchor",
            href: a.href,
            text: (a.textContent ?? "").trim().slice(0, 80),
          }));

        // Strategy 1 — text label match
        for (const a of anchors) {
          const text = (a.textContent ?? "").toLowerCase().trim();
          if (textLabels.some((label) => text.includes(label)) && a.href) {
            return {
              found: a.href,
              debug: [{ strategy: "text-label", href: a.href, text: (a.textContent ?? "").trim().slice(0, 80) }],
            };
          }
        }

        // Strategy 2 — href URL pattern match
        for (const a of anchors) {
          const href = (a.href ?? "").toLowerCase();
          if (hostPatterns.some((p) => href.includes(p)) && !href.includes(baseHost)) {
            return {
              found: a.href,
              debug: [{ strategy: "href-pattern", href: a.href, text: (a.textContent ?? "").trim().slice(0, 80) }],
            };
          }
        }

        // Strategy 3 — input field containing an external URL
        const inputs = Array.from(
          document.querySelectorAll('input[type="text"], input[type="url"], input:not([type])'),
        ) as HTMLInputElement[];
        for (const input of inputs) {
          const val = (input.value ?? "").trim();
          if (val.startsWith("http") && !val.includes(baseHost)) {
            return {
              found: val,
              debug: [{ strategy: "input-value", href: val, text: input.name || input.id || "(input)" }],
            };
          }
        }

        // Strategy 4 — any external anchor (last resort)
        if (allExternal.length > 0) {
          return { found: allExternal[0].href, debug: allExternal };
        }

        // Nothing found — return all external links for diagnostics
        return { found: null, debug: allExternal };
      },
      {
        hostPatterns: BOOKING_HOST_PATTERNS,
        textLabels: BOOKING_TEXT_LABELS,
        baseHost: "www.cbagenttools.com",
      },
    );

    if (result.found) {
      console.log(
        `[cb-inventory-scraper] ✅ Personal Link (strategy=${result.debug[0]?.strategy ?? "?"}): ${result.found}`,
      );
      return result.found;
    }

    // Log everything we saw for diagnosis
    console.warn(
      `[cb-inventory-scraper] ⚠️ Could not find Personal Link on page ${url}`,
    );
    if (result.debug.length > 0) {
      console.warn(
        `[cb-inventory-scraper] External links found on page (${result.debug.length}):\n` +
          result.debug.map((d) => `  ${d.href} | "${d.text}"`).join("\n"),
      );
    } else {
      console.warn(
        `[cb-inventory-scraper] No external links found on page at all — page may not have loaded correctly or session may be expired.`,
      );
    }

    return null;
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
