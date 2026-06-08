/**
 * Browser-aware link validation (operator-run).
 *
 * Extracted from scripts/validate-cb-retail-links.ts so the Link Broker and the
 * retail-link validator share one implementation. CB Swift package pages are
 * JavaScript SPAs that return HTTP 200 even when the package is gone, so plain
 * `fetch` is not enough — Swift package links are checked in a real browser
 * context that watches the SPA's JSON API responses for not-found markers.
 *
 * Playwright is imported dynamically so this module can live alongside the rest
 * of the broker without pulling Playwright into the Next runtime bundle. Only
 * callers that actually run validation (operator scripts) load it.
 *
 * This is the only Link Broker module that touches a browser. It must stay
 * operator-run (PHASE_0_BASELINE_GUARDRAILS.md rule 4) and never books, holds,
 * or submits anything — it only opens the URL and inspects the response.
 */

import type { BrowserContext } from "playwright";

import { computeHealth } from "./health";
import { isOdysseusBookingsUrl } from "./normalize";
import type { LinkBrokerHealth } from "./types";

const CB_SWIFT_SPA_PATH = "/swift/cruise/package/";
const CB_SPA_ERROR_MARKERS = ["Package Not Found", "Oops!"];
const CB_FETCH_ERROR_MARKERS = [
  "Package Not Found",
  "No package details found",
  "package-not-found",
];
const PAGE_LOAD_TIMEOUT_MS = 15_000;

export interface LinkCheckOutcome {
  passed: boolean;
  failureReason?: string;
}

/**
 * Validates a CB Swift SPA package link inside an existing browser context by
 * watching its JSON API responses and, as a fallback, the rendered body text.
 */
export async function checkCbSwiftLink(
  url: string,
  context: BrowserContext
): Promise<LinkCheckOutcome> {
  const page = await context.newPage();
  let apiIndicatedNotFound = false;

  page.on("response", async (response) => {
    const respUrl = response.url();
    if (!respUrl.includes("cbagenttools.com")) return;
    const contentType = response.headers()["content-type"] ?? "";
    if (!contentType.includes("json")) return;
    try {
      const text = await response.text();
      const lower = text.toLowerCase();
      if (
        lower.includes("not found") ||
        lower.includes("notfound") ||
        lower.includes("package_not_found") ||
        lower.includes('"error"') ||
        response.status() >= 400
      ) {
        apiIndicatedNotFound = true;
      }
    } catch {
      // ignore parse errors
    }
  });

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: PAGE_LOAD_TIMEOUT_MS });
    if (apiIndicatedNotFound) {
      return { passed: false, failureReason: "CB API response indicated package not found." };
    }
    const bodyText = await page.innerText("body").catch(() => "");
    const marker = CB_SPA_ERROR_MARKERS.find((m) => bodyText.includes(m));
    if (marker) {
      return { passed: false, failureReason: `Page shows error marker: "${marker}".` };
    }
    return { passed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { passed: false, failureReason: `Navigation failed: ${message}` };
  } finally {
    await page.close();
  }
}

/** Validates a non-SPA CB link with a plain fetch + error-marker scan. */
export async function checkCbFetchLink(url: string): Promise<LinkCheckOutcome> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LLI-LinkValidator/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status >= 400) {
      return { passed: false, failureReason: `HTTP ${response.status}` };
    }
    const body = await response.text();
    const marker = CB_FETCH_ERROR_MARKERS.find((m) => body.includes(m));
    if (marker) {
      return { passed: false, failureReason: `Body contains error marker: "${marker}".` };
    }
    return { passed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { passed: false, failureReason: `Fetch failed: ${message}` };
  }
}

/** Routes a URL to the SPA or fetch check based on its path. */
export async function checkCbLink(
  url: string,
  swiftContext: BrowserContext
): Promise<LinkCheckOutcome> {
  if (url.includes(CB_SWIFT_SPA_PATH)) {
    return checkCbSwiftLink(url, swiftContext);
  }
  return checkCbFetchLink(url);
}

export interface ValidateBrokerLinkOptions {
  /** Reuse an existing context (e.g. an authenticated session) across links. */
  context?: BrowserContext;
  /** Path to a Playwright storageState file for an authenticated session. */
  storageStatePath?: string;
  /** Explicit Chrome executable path (falls back to bundled Chromium). */
  executablePath?: string;
  capturedAtIso?: string;
  freshnessHours?: number;
}

/**
 * Operator-run: validates a broker link in a browser and returns a full
 * LinkBrokerHealth record (valid/stale/broken). When no `context` is supplied it
 * launches and tears down its own headless browser.
 *
 * Dynamically imports Playwright so importing this file does not require it until
 * validation actually runs.
 */
export async function validateBrokerLink(
  url: string,
  options: ValidateBrokerLinkOptions = {}
): Promise<LinkBrokerHealth> {
  if (!isOdysseusBookingsUrl(url)) {
    return computeHealth({
      passed: false,
      capturedAtIso: options.capturedAtIso,
      failureReason: "URL host is not bookings.cbagenttools.com.",
      freshnessHours: options.freshnessHours,
    });
  }

  // Reuse a supplied context without owning its lifecycle.
  if (options.context) {
    const outcome = await checkCbLink(url, options.context);
    return computeHealth({
      passed: outcome.passed,
      capturedAtIso: options.capturedAtIso,
      failureReason: outcome.failureReason,
      freshnessHours: options.freshnessHours,
    });
  }

  const { chromium } = await import("playwright");
  const fs = await import("fs");

  const browser = await chromium.launch({
    headless: true,
    executablePath:
      options.executablePath && fs.existsSync(options.executablePath)
        ? options.executablePath
        : undefined,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });
  try {
    const context =
      options.storageStatePath && fs.existsSync(options.storageStatePath)
        ? await browser.newContext({
            storageState: options.storageStatePath,
            viewport: { width: 1920, height: 1080 },
          })
        : await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    try {
      const outcome = await checkCbLink(url, context);
      return computeHealth({
        passed: outcome.passed,
        capturedAtIso: options.capturedAtIso,
        failureReason: outcome.failureReason,
        freshnessHours: options.freshnessHours,
      });
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
