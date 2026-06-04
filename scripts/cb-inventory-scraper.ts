/**
 * CB Group Inventory Scraper - Exportable Library
 *
 * Refactored from scripts/scrape-cb-deals.ts to be callable by run-phase-b.ts.
 * Playwright-based - must be run via Node (tsx), not inside Next.js API routes.
 *
 * Usage:
 *   import { scrapeGroupInventory } from './cb-inventory-scraper';
 *   const inventory = await scrapeGroupInventory();
 */

import { chromium, type Page } from "playwright";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { CbGroupInventoryItem } from "../lib/campaigns/cb-inventory-types";

const CB_BASE_URL = "https://www.cbagenttools.com";
const PRICE_ADVANTAGES_URL = `${CB_BASE_URL}/groups/view_groups/?price_advantage=on`;
const STATE_FILE = path.join(process.cwd(), ".playwright-state.json");
const CB_NAVIGATION_TIMEOUT_MS = 12000;

async function getAuthenticatedPage(): Promise<{
  browser: Awaited<ReturnType<typeof chromium.launch>>;
  page: Page;
}> {
  if (existsSync(STATE_FILE)) {
    console.log("[cb-inventory-scraper] Loading saved session...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: STATE_FILE });
    const page = await context.newPage();

    try {
      await page.goto(`${CB_BASE_URL}/bookings/home/`, {
        waitUntil: "domcontentloaded",
        timeout: CB_NAVIGATION_TIMEOUT_MS,
      });
    } catch (error) {
      console.warn(
        `[cb-inventory-scraper] Saved-session check timed out or failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      await browser.close();
      throw new Error("CB saved-session check failed quickly. Retry Phase B or refresh the CB session.");
    }
    const currentUrl = page.url().toLowerCase();

    if (!currentUrl.includes("/login") && !currentUrl.includes("/accounts/")) {
      console.log("[cb-inventory-scraper] Authenticated via saved session.");
      return { browser, page };
    }

    console.log("[cb-inventory-scraper] Session expired - performing fresh login...");
    await browser.close();
  }

  const email = process.env.CB_EMAIL;
  const password = process.env.CB_PASSWORD;

  if (!email || !password) {
    throw new Error("CB_EMAIL and CB_PASSWORD must be set for CB inventory scraping.");
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${CB_BASE_URL}/accounts/login/`, {
    waitUntil: "domcontentloaded",
    timeout: CB_NAVIGATION_TIMEOUT_MS,
  });
  await page.fill('input#username, input[name="username"]', email);
  await page.fill('input#password, input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded", { timeout: CB_NAVIGATION_TIMEOUT_MS }).catch(() => undefined);

  const postLoginUrl = page.url().toLowerCase();
  if (postLoginUrl.includes("/login") || postLoginUrl.includes("signin")) {
    await browser.close();
    throw new Error("CB login failed - still on login page. Check CB_EMAIL/CB_PASSWORD.");
  }

  await context.storageState({ path: STATE_FILE });
  console.log("[cb-inventory-scraper] Login successful. Session saved.");

  return { browser, page };
}

function parsePrice(raw: string): number {
  const digits = raw.replace(/[^0-9.]/g, "");
  return digits ? parseFloat(digits) : 0;
}

export async function scrapeGroupInventory(): Promise<CbGroupInventoryItem[]> {
  const { browser, page } = await getAuthenticatedPage();

  try {
    console.log("[cb-inventory-scraper] Navigating to view_groups (price_advantage=on)...");
    await page.goto(PRICE_ADVANTAGES_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    const rawItems = await page.evaluate((sourceUrl: string) => {
      const rows = document.querySelectorAll("table tbody tr, .group-row, .list-group-item");
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
        detailUrl?: string;
        personalLink?: string;
        sourceUrl: string;
      }> = [];

      rows.forEach((row) => {
        const cells = row.querySelectorAll("td");
        if (cells.length < 4) return;

        const cellTexts = Array.from(cells).map((c) => c.textContent?.trim() ?? "");
        const anchor = cells[0]?.querySelector("a");
        const href = anchor?.getAttribute("href") ?? "";
        const groupIdMatch = href.match(/view_group[/]([0-9]+)/);
        const groupId = groupIdMatch ? groupIdMatch[1] : cellTexts[0];
        let detailUrl;
        if (groupIdMatch) {
          try {
            detailUrl = new URL(href, "https://www.cbagenttools.com").href;
          } catch {
            detailUrl = undefined;
          }
        }
        let personalLink;
        for (const a of Array.from(row.querySelectorAll("a"))) {
          const rawHref = a.getAttribute("href") ?? "";
          let absolute = "";
          try {
            absolute = new URL(rawHref, "https://www.cbagenttools.com").href;
          } catch {
            absolute = "";
          }
          if (
            absolute &&
            (
              !absolute.includes("cbagenttools.com") ||
              absolute.includes("bookings.cbagenttools.com") ||
              absolute.includes("/swift/") ||
              absolute.includes("/web/cruises/")
            )
          ) {
            personalLink = absolute;
            break;
          }
        }

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
          detailUrl,
          personalLink,
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

    console.log(`[cb-inventory-scraper] Scraped ${items.length} group inventory items.`);
    return items;
  } finally {
    await browser.close();
  }
}

const BOOKING_HOST_PATTERNS = [
  "swift",
  "package",
  "bookings.cbagenttools.com",
  "/web/cruises/",
];

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

type LinkCandidate = { strategy: string; href: string; text: string };

type LinkExtractionDebug = {
  found: string | null;
  debug: LinkCandidate[];
  finalUrl: string;
  title: string;
  bodyExcerpt: string;
  anchorCount: number;
  buttonCount: number;
  inputCount: number;
  formCount: number;
  internalLinks: LinkCandidate[];
};

async function writeGroupLinkDebugArtifacts(
  page: Page,
  groupId: string,
  debug: LinkExtractionDebug,
): Promise<void> {
  const outputDir = path.join(
    process.cwd(),
    "scripts",
    "agent",
    "output",
    "cb-group-link-debug",
  );
  await mkdir(outputDir, { recursive: true });
  const basePath = path.join(outputDir, `group-${groupId}`);
  await writeFile(`${basePath}.json`, JSON.stringify(debug, null, 2), "utf-8");
  await writeFile(`${basePath}.html`, await page.content(), "utf-8");
  await page.screenshot({ path: `${basePath}.png`, fullPage: true });
}

export type PersonalLinkResult =
  | { link: string; isHouseGroup: false }
  | { link: null; isHouseGroup: true }
  | { link: null; isHouseGroup: false };

/**
 * Given a CBAT groupId, visits the group detail page and extracts the true
 * Personal Link which contains the actual Odysseus package ID.
 *
 * Returns `{ link, isHouseGroup }`. House groups (Group Contact = House) never
 * have a personal link — callers should go straight to the Odysseus retail path.
 */
export async function scrapeGroupPersonalLink(
  groupId: string,
): Promise<PersonalLinkResult> {
  const { browser, page } = await getAuthenticatedPage();
  try {
    // tsx/esbuild wraps named arrow functions with `__name(fn, "label")` to
    // preserve `Function.name`. When page.evaluate() serializes the function
    // body, that helper reference leaks into the browser where __name is not
    // defined → ReferenceError. Stub the common esbuild helpers in the page
    // context so the wrapped functions resolve as no-ops.
    await page.addInitScript(
      "window.__name = (f) => f; window.__publicField = (o,k,v) => { o[k] = v; return v; }; window.__defProp = Object.defineProperty;",
    );

    const url = `${CB_BASE_URL}/groups/view_group/${groupId}/`;
    console.log(`[cb-inventory-scraper] Navigating to group details: ${url}`);
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const result = await page.evaluate(
      ({
        hostPatterns,
        textLabels,
        baseHost,
      }: {
        hostPatterns: string[];
        textLabels: string[];
        baseHost: string;
      }): LinkExtractionDebug => {
        const anchors = Array.from(document.querySelectorAll("a"));
        const allExternal: LinkCandidate[] = anchors
          .filter((a) => a.href && a.href.startsWith("http") && !a.href.includes(baseHost))
          .map((a) => ({
            strategy: "external-anchor",
            href: a.href,
            text: (a.textContent ?? "").trim().slice(0, 80),
          }));
        const internalLinks: LinkCandidate[] = anchors
          .filter((a) => a.href && a.href.includes(baseHost))
          .slice(0, 20)
          .map((a) => ({
            strategy: "internal-anchor",
            href: a.href,
            text: (a.textContent ?? "").trim().slice(0, 80),
          }));
        const isCbBookingHref = (href: string): boolean => {
          const normalized = (href ?? "").toLowerCase();
          return normalized.includes("bookings.cbagenttools.com") &&
            (normalized.includes("/swift/") ||
              normalized.includes("/web/cruises/") ||
              normalized.includes("/cruise/package/"));
        };

        for (const a of anchors) {
          const text = (a.textContent ?? "").toLowerCase().trim();
          if (textLabels.some((label) => text.includes(label)) && isCbBookingHref(a.href)) {
            return {
              found: a.href,
              debug: [{ strategy: "text-label", href: a.href, text: (a.textContent ?? "").trim().slice(0, 80) }],
              finalUrl: window.location.href,
              title: document.title,
              bodyExcerpt: (document.body?.innerText ?? "").replace(/\\s+/g, " ").trim().slice(0, 1200),
              anchorCount: anchors.length,
              buttonCount: document.querySelectorAll("button").length,
              inputCount: document.querySelectorAll("input").length,
              formCount: document.querySelectorAll("form").length,
              internalLinks,
            };
          }
        }

        for (const a of anchors) {
          const href = (a.href ?? "").toLowerCase();
          if (hostPatterns.some((p) => href.includes(p)) && isCbBookingHref(href)) {
            return {
              found: a.href,
              debug: [{ strategy: "href-pattern", href: a.href, text: (a.textContent ?? "").trim().slice(0, 80) }],
              finalUrl: window.location.href,
              title: document.title,
              bodyExcerpt: (document.body?.innerText ?? "").replace(/\\s+/g, " ").trim().slice(0, 1200),
              anchorCount: anchors.length,
              buttonCount: document.querySelectorAll("button").length,
              inputCount: document.querySelectorAll("input").length,
              formCount: document.querySelectorAll("form").length,
              internalLinks,
            };
          }
        }

        const inputs = Array.from(
          document.querySelectorAll('input[type="text"], input[type="url"], input:not([type])'),
        ) as HTMLInputElement[];
        for (const input of inputs) {
          const val = (input.value ?? "").trim();
          if (val.startsWith("http") && isCbBookingHref(val)) {
            return {
              found: val,
              debug: [{ strategy: "input-value", href: val, text: input.name || input.id || "(input)" }],
              finalUrl: window.location.href,
              title: document.title,
              bodyExcerpt: (document.body?.innerText ?? "").replace(/\\s+/g, " ").trim().slice(0, 1200),
              anchorCount: anchors.length,
              buttonCount: document.querySelectorAll("button").length,
              inputCount: document.querySelectorAll("input").length,
              formCount: document.querySelectorAll("form").length,
              internalLinks,
            };
          }
        }

        return {
          found: null,
          debug: allExternal,
          finalUrl: window.location.href,
          title: document.title,
          bodyExcerpt: (document.body?.innerText ?? "").replace(/\\s+/g, " ").trim().slice(0, 1200),
          anchorCount: anchors.length,
          buttonCount: document.querySelectorAll("button").length,
          inputCount: document.querySelectorAll("input").length,
          formCount: document.querySelectorAll("form").length,
          internalLinks,
        };
      },
      {
        hostPatterns: BOOKING_HOST_PATTERNS,
        textLabels: BOOKING_TEXT_LABELS,
        baseHost: "www.cbagenttools.com",
      },
    );

    if (!result) {
      console.warn(
        `[cb-inventory-scraper] Link extraction returned no diagnostics for group ${groupId}.`,
      );
      return { link: null, isHouseGroup: false };
    }

    // House groups: CB owns the block; no personal booking link will ever appear.
    // Detect from the "Group Contact\tHouse" text in the page body.
    const isHouseGroup = /group\s+contact[:\t\s]+house/i.test(result.bodyExcerpt);
    if (isHouseGroup) {
      console.log(
        `[cb-inventory-scraper] Group ${groupId} is a House group — no personal link available. Use Odysseus retail path.`,
      );
      return { link: null, isHouseGroup: true };
    }

    if (result.found) {
      console.log(
        `[cb-inventory-scraper] Personal Link (strategy=${result.debug[0]?.strategy ?? "?"}): ${result.found}`,
      );
      return { link: result.found, isHouseGroup: false };
    }

    console.warn(`[cb-inventory-scraper] Could not find Personal Link on page ${url}`);
    console.warn(
      `[cb-inventory-scraper] Page diagnostics: finalUrl=${result.finalUrl}; title="${result.title}"; anchors=${result.anchorCount}; buttons=${result.buttonCount}; inputs=${result.inputCount}; forms=${result.formCount}`,
    );
    if (result.debug.length > 0) {
      console.warn(
        `[cb-inventory-scraper] External links found on page (${result.debug.length}):\n` +
          result.debug.map((d) => `  ${d.href} | "${d.text}"`).join("\n"),
      );
    } else {
      console.warn(
        "[cb-inventory-scraper] No external links found on page at all - page may not have loaded correctly, session may be expired, or CB moved the link behind an action.",
      );
      if (result.internalLinks.length > 0) {
        console.warn(
          `[cb-inventory-scraper] Internal links visible (${result.internalLinks.length} sampled):\n` +
            result.internalLinks.map((d) => `  ${d.href} | "${d.text}"`).join("\n"),
        );
      }
      if (result.bodyExcerpt) {
        console.warn(`[cb-inventory-scraper] Body excerpt: ${result.bodyExcerpt}`);
      }
    }

    try {
      await writeGroupLinkDebugArtifacts(page, groupId, result);
      console.warn(
        `[cb-inventory-scraper] Wrote debug artifacts to scripts/agent/output/cb-group-link-debug/group-${groupId}.{json,html,png}`,
      );
    } catch (debugError) {
      console.warn(
        `[cb-inventory-scraper] Could not write debug artifacts for group ${groupId}: ${debugError instanceof Error ? debugError.message : String(debugError)}`,
      );
    }

    return { link: null, isHouseGroup: false };
  } catch (e) {
    console.error(
      `[cb-inventory-scraper] Error extracting personal link for group ${groupId}:`,
      e,
    );
    return { link: null, isHouseGroup: false };
  } finally {
    await browser.close();
  }
}
