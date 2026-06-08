/**
 * CB Agent Tools Promo Intelligence Scraper (Phase 4).
 *
 * Operator-run. Captures the Today's View promotions as auditable RAW
 * intelligence: title, vendor, booking/sailing windows, and the raw section text
 * (Promotion Details, Agent Instructions, Applicable Sailings, Offer Applicable
 * Products, Applicable Markets, Key features) plus supporting file links.
 *
 * It does NOT extract structured rules — that is Phase 5 (GPT through the LLM
 * gateway). Records are written with empty `extracted`/`marketingUse` scaffolds
 * and `diagnostics.status = "needs_review"` so Phase 5 can fill them.
 *
 * Auth follows the established storageState pattern (same as scrape-cb-deals.ts):
 * load .playwright-state.json, and if it has expired, log in headlessly with
 * CB_EMAIL / CB_PASSWORD. No booking, hold, reservation, or guest-info action.
 *
 * Usage:
 *   npm run scrape-cb-promo-intelligence
 *   npx tsx --env-file=.env.local scripts/scrape-cb-promo-intelligence.ts
 */

import { chromium } from "playwright";
import type { Page } from "playwright";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import type {
  CbPromoDateWindow,
  CbPromoIntelligenceCache,
  CbPromoIntelligenceRecord,
  CbPromoSupportingFile,
} from "../lib/cb/deals-system/promo-intelligence-types";

const CB_BASE_URL = "https://www.cbagenttools.com";
const TODAYS_VIEW_URL = `${CB_BASE_URL}/marketing/todaysview/` as const;
const STATE_FILE = path.join(process.cwd(), ".playwright-state.json");
const OUTPUT_DIRECTORY = path.join(process.cwd(), ".github", "data");
const OUTPUT_FILE_PATH = path.join(OUTPUT_DIRECTORY, "cb-promo-intelligence-cache.json");
const ESBUILD_BROWSER_HELPER_STUB =
  "window.__name = (f) => f; window.__publicField = (o,k,v) => { o[k] = v; return v; }; window.__defProp = Object.defineProperty;";

/** Section labels we slice the promo wrapper text on, in document order. */
const SECTION_LABELS = [
  "Promotion Details",
  "Key features",
  "Agent Instructions",
  "Applicable Sailings",
  "Offer Applicable Products",
  "Applicable Markets",
  "Supporting File",
] as const;

// ─── Auth (storageState pattern, identical to scrape-cb-deals.ts) ───────────────

async function getAuthenticatedPage(): Promise<{
  browser: Awaited<ReturnType<typeof chromium.launch>>;
  page: Page;
}> {
  if (existsSync(STATE_FILE)) {
    console.log("[scrape-cb-promo-intelligence] Found saved session. Loading cookies...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: STATE_FILE });
    const page = await context.newPage();
    await page.addInitScript(ESBUILD_BROWSER_HELPER_STUB);
    await page.goto(`${CB_BASE_URL}/bookings/home/`, { waitUntil: "networkidle" });

    const url = page.url().toLowerCase();
    if (url.includes("/login") || url.includes("/accounts/")) {
      console.log("[scrape-cb-promo-intelligence] Session expired. Falling through to fresh login...");
      await browser.close();
    } else {
      console.log("[scrape-cb-promo-intelligence] ✅ Authenticated via saved session.");
      return { browser, page };
    }
  }

  console.log("[scrape-cb-promo-intelligence] No valid session. Performing automated login...");
  const email = process.env.CB_EMAIL;
  const password = process.env.CB_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Missing CB_EMAIL or CB_PASSWORD. Set env vars or refresh .playwright-state.json manually."
    );
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(ESBUILD_BROWSER_HELPER_STUB);
  await page.goto(`${CB_BASE_URL}/accounts/login/`, { waitUntil: "domcontentloaded" });

  await page.waitForSelector('input#username, input[name="username"]', { timeout: 15000 });
  await page.fill('input#username, input[name="username"]', email);
  await page.fill('input#password, input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle", { timeout: 30000 });

  const url = page.url().toLowerCase();
  if (url.includes("/login") || url.includes("signin")) {
    await browser.close();
    throw new Error("CB Agent Tools login failed — still on login page. Check credentials.");
  }

  await context.storageState({ path: STATE_FILE });
  console.log("[scrape-cb-promo-intelligence] ✅ Login successful. Session saved.");
  return { browser, page };
}

// ─── Collect promo detail URLs from Today's View ────────────────────────────────

async function collectPromoDetailUrls(page: Page): Promise<string[]> {
  await page.goto(TODAYS_VIEW_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  return page.evaluate(() => {
    const set = new Set<string>();
    document.querySelectorAll('a[href*="/marketing/promotion/"]').forEach((a) => {
      const href = a.getAttribute("href");
      if (!href) return;
      try {
        set.add(new URL(href, location.origin).href);
      } catch {
        /* ignore */
      }
    });
    return Array.from(set);
  });
}

// ─── Extract one promo detail page ──────────────────────────────────────────────

interface RawPromoExtraction {
  title: string;
  vendor: string;
  bookingWindowRaw: string;
  sailingWindowRaw: string;
  sections: Record<string, string>;
  supportingFiles: CbPromoSupportingFile[];
  bookingLinks: string[];
}

async function extractPromoDetail(page: Page, detailUrl: string): Promise<RawPromoExtraction> {
  await page.goto(detailUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  return page.evaluate(
    ({ sectionLabels, baseUrl }: { sectionLabels: readonly string[]; baseUrl: string }) => {
      const wrapper =
        document.querySelector(".view-promotion-wrapper") ||
        document.querySelector("main.container.content") ||
        document.body;
      const wrapperText = (wrapper as HTMLElement).innerText || "";
      const lines = wrapperText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      // Title: the promo heading is the first line containing " - " near the top,
      // or the longest of the first several lines.
      const headerCandidates = lines.slice(0, 12);
      const title =
        headerCandidates.find((l) => / - /.test(l) && l.length > 15) ||
        headerCandidates.sort((a, b) => b.length - a.length)[0] ||
        "";

      const vendorLine = lines.find((l) => /^vendor:/i.test(l)) || "";
      const sailingLine = lines.find((l) => /^for sailings on or between/i.test(l)) || "";
      const bookingLine = lines.find((l) => /^must be booked between/i.test(l)) || "";

      // Slice the full text into sections by walking label positions.
      const fullText = wrapperText;
      const positions: Array<{ label: string; index: number }> = [];
      for (const label of sectionLabels) {
        const idx = fullText.toLowerCase().indexOf(label.toLowerCase());
        if (idx >= 0) positions.push({ label, index: idx });
      }
      positions.sort((a, b) => a.index - b.index);

      const sections: Record<string, string> = {};
      for (let i = 0; i < positions.length; i += 1) {
        const { label, index } = positions[i];
        const end = i + 1 < positions.length ? positions[i + 1].index : fullText.length;
        // Drop the heading label itself from the captured body.
        const body = fullText.slice(index + label.length, end).trim();
        sections[label] = body;
      }

      // Supporting files: links under /media/ plus any text "Supporting File: <path>".
      const supportingFiles: Array<{ label: string; url: string; fileName: string }> = [];
      const seenFiles = new Set<string>();
      document.querySelectorAll('a[href*="/media/"]').forEach((a) => {
        const href = a.getAttribute("href");
        if (!href) return;
        let abs = "";
        try {
          abs = new URL(href, baseUrl).href;
        } catch {
          return;
        }
        if (seenFiles.has(abs)) return;
        seenFiles.add(abs);
        supportingFiles.push({
          label: a.textContent?.trim() || "Supporting File",
          url: abs,
          fileName: decodeURIComponent(abs.split("/").pop() || ""),
        });
      });

      // Dynamic booking links present on the page, if any.
      const bookingLinks = Array.from(document.querySelectorAll("a"))
        .map((a) => {
          const href = a.getAttribute("href") || "";
          try {
            return href ? new URL(href, baseUrl).href : "";
          } catch {
            return "";
          }
        })
        .filter((h) =>
          /^https:\/\/bookings\.cbagenttools\.com\/swift\/cruise\/package\/[^/?#]+/i.test(h)
        );

      return {
        title,
        vendor: vendorLine,
        bookingWindowRaw: bookingLine,
        sailingWindowRaw: sailingLine,
        sections,
        supportingFiles,
        bookingLinks: Array.from(new Set(bookingLinks)),
      };
    },
    { sectionLabels: SECTION_LABELS, baseUrl: CB_BASE_URL }
  );
}

// ─── Normalize into a CbPromoIntelligenceRecord ─────────────────────────────────

function parseDateWindow(rawText: string): CbPromoDateWindow {
  const dates = rawText.match(/\d{2}\/\d{2}\/\d{4}/g) ?? [];
  const toIso = (mdY: string | undefined): string | undefined => {
    if (!mdY) return undefined;
    const [m, d, y] = mdY.split("/");
    return `${y}-${m}-${d}`;
  };
  return {
    startsOn: toIso(dates[0]),
    endsOn: toIso(dates[1]),
    rawText,
  };
}

function cleanVendor(vendorLine: string): string {
  return vendorLine.replace(/^vendor:\s*/i, "").trim();
}

function recordId(detailUrl: string, title: string): string {
  const promoId = detailUrl.match(/\/promotion\/(\d+)\//)?.[1];
  if (promoId) return `cbpromo-${promoId}`;
  return `cbpromo-${createHash("sha256").update(`${detailUrl}:${title}`).digest("hex").slice(0, 12)}`;
}

function toRecord(detailUrl: string, raw: RawPromoExtraction, capturedAtIso: string): CbPromoIntelligenceRecord {
  return {
    id: recordId(detailUrl, raw.title),
    source: "cb_agent_tools_todays_view",
    sourceUrl: TODAYS_VIEW_URL,
    detailUrl,
    capturedAtIso,
    title: raw.title,
    vendor: cleanVendor(raw.vendor),
    bookingWindow: parseDateWindow(raw.bookingWindowRaw),
    sailingWindow: parseDateWindow(raw.sailingWindowRaw),
    promotionDetailsRaw: raw.sections["Promotion Details"] ?? "",
    agentInstructionsRaw: raw.sections["Agent Instructions"] ?? "",
    keyFeaturesRaw: raw.sections["Key features"] ?? "",
    applicableSailingsRaw: raw.sections["Applicable Sailings"] ?? "",
    applicableProductsRaw: raw.sections["Offer Applicable Products"] ?? "",
    applicableMarketsRaw: raw.sections["Applicable Markets"] ?? "",
    supportingFiles: raw.supportingFiles,
    // Phase 5 fills these. Empty scaffolds for now.
    extracted: {
      offerTypes: [],
      percentDiscounts: [],
      dollarSavings: [],
      onboardCredits: [],
      freeGuestOffers: [],
      combinability: { rawRules: [] },
      exclusions: [],
      applicableProducts: [],
      applicableMarkets: [],
    },
    marketingUse: {
      publicClaimsAllowed: [],
      publicClaimsNeedsQualifier: [],
      agentOnlyNotes: [],
      suggestedAngles: [],
      cautionFlags: [],
      bestMatchedDealBriefs: [],
      visitorFriendlySummary: "",
    },
    diagnostics: {
      status: "needs_review",
      notes: ["Raw capture only; structured extraction pending Phase 5."],
      warnings: raw.title ? [] : ["No title parsed; review detail page."],
    },
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[scrape-cb-promo-intelligence] Starting...");
  const capturedAtIso = new Date().toISOString();
  const errors: string[] = [];

  const { browser, page } = await getAuthenticatedPage();
  const records: CbPromoIntelligenceRecord[] = [];
  let detailPagesScraped = 0;
  let supportingFilesFound = 0;

  try {
    const detailUrls = await collectPromoDetailUrls(page);
    console.log(`[scrape-cb-promo-intelligence] Found ${detailUrls.length} promotion link(s).`);

    for (const detailUrl of detailUrls) {
      try {
        const raw = await extractPromoDetail(page, detailUrl);
        detailPagesScraped += 1;
        supportingFilesFound += raw.supportingFiles.length;
        const record = toRecord(detailUrl, raw, capturedAtIso);
        records.push(record);
        console.log(
          `  • ${record.id} "${record.title.slice(0, 60)}" — ` +
            `${record.supportingFiles.length} file(s), ` +
            `details=${record.promotionDetailsRaw.length}c, ` +
            `instructions=${record.agentInstructionsRaw.length}c`
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${detailUrl}: ${msg}`);
        console.warn(`  ✗ ${detailUrl} — ${msg}`);
      }
    }
  } finally {
    await browser.close();
  }

  const cache: CbPromoIntelligenceCache = {
    version: 1,
    generatedAtIso: capturedAtIso,
    sourceUrl: TODAYS_VIEW_URL,
    records,
    diagnostics: {
      promotionLinksFound: records.length + errors.length,
      detailPagesScraped,
      extractionSucceeded: 0,
      extractionNeedsReview: records.length,
      supportingFilesFound,
      errors,
    },
  };

  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await writeFile(OUTPUT_FILE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");

  console.log(
    `\n[scrape-cb-promo-intelligence] Done. ` +
      `records=${records.length} detailPages=${detailPagesScraped} ` +
      `supportingFiles=${supportingFilesFound} errors=${errors.length}`
  );
  console.log(`[scrape-cb-promo-intelligence] Wrote ${OUTPUT_FILE_PATH}`);
}

main().catch((err) => {
  console.error("[scrape-cb-promo-intelligence] Fatal error:", err);
  process.exit(1);
});
