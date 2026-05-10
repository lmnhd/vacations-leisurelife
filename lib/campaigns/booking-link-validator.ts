/**
 * Booking Link Validator — Playwright-based health check for CB group and retail links.
 *
 * Detects broken booking pages that return HTTP 200 but render error content.
 * Called by run-phase-b.ts and future heartbeat scripts. Not bundled with Next.js.
 */

// @ts-ignore — optional dependency; install playwright to activate
import { chromium } from "playwright";

export interface BookingLinkValidationResult {
    status: "HEALTHY" | "DEGRADED" | "FAILED";
    checkedAt: string;
    url: string;
    finalUrl?: string;
    pageTitle?: string;
    failureReason?: string;
    screenshotPath?: string;
}

const FAILURE_PATTERNS =
    /oops|package not found|not available|expired|page not found|404 not found|session expired|please log in|login required|invalid link|no results/i;

const BOOKABLE_CONTENT_PATTERNS =
    /cabin|stateroom|price|per person|select|book now|continue|departure|cruise|itinerary/i;

const TIMEOUT_MS = 25000;

/**
 * Physically validates a booking link by loading it in a headless browser.
 * Returns HEALTHY, DEGRADED, or FAILED with a reason and optional screenshot.
 */
export async function validateBookingLink(
    url: string,
    opts?: { screenshotPath?: string },
): Promise<BookingLinkValidationResult> {
    const checkedAt = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let browser: any;

    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        let finalUrl = url;
        let pageTitle = "";

        try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
            await page.waitForTimeout(3500);
            finalUrl = page.url();
            pageTitle = await page.title();
        } catch {
            return {
                status: "FAILED",
                checkedAt,
                url,
                finalUrl,
                failureReason: "Page did not load within timeout",
            };
        }

        if (opts?.screenshotPath) {
            await page.screenshot({ path: opts.screenshotPath }).catch(() => undefined);
        }

        const bodyText: string = await page.innerText("body").catch(() => "");
        const excerpt = bodyText.slice(0, 3000);

        // Login redirect loop
        const isLoginRedirect =
            finalUrl !== url &&
            (finalUrl.includes("/login") || finalUrl.includes("/signin"));
        if (isLoginRedirect) {
            return {
                status: "FAILED",
                checkedAt,
                url,
                finalUrl,
                pageTitle,
                failureReason: "Redirected to login page",
            };
        }

        // Error content on page
        if (FAILURE_PATTERNS.test(pageTitle) || FAILURE_PATTERNS.test(excerpt)) {
            return {
                status: "FAILED",
                checkedAt,
                url,
                finalUrl,
                pageTitle,
                failureReason: "Error content detected on page",
            };
        }

        // Page loaded but no bookable content visible
        if (!BOOKABLE_CONTENT_PATTERNS.test(excerpt)) {
            return {
                status: "DEGRADED",
                checkedAt,
                url,
                finalUrl,
                pageTitle,
                failureReason: "No bookable content detected",
                screenshotPath: opts?.screenshotPath,
            };
        }

        return {
            status: "HEALTHY",
            checkedAt,
            url,
            finalUrl,
            pageTitle,
            screenshotPath: opts?.screenshotPath,
        };
    } catch (err) {
        return {
            status: "FAILED",
            checkedAt,
            url,
            failureReason: err instanceof Error ? err.message : "Unknown validation error",
        };
    } finally {
        await browser?.close();
    }
}
