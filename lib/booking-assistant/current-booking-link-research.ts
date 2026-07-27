import { load } from "cheerio";

import type { BookingDraft } from "./types";

const ALLOWED_BOOKING_HOSTS = new Set([
  "bookings.cbagenttools.com",
  "booking.cruisebrothers.com",
  "cruisebrothers.com",
  "www.cruisebrothers.com",
]);

const MAX_RESPONSE_CHARACTERS = 1_000_000;
const MAX_EXCERPT_CHARACTERS = 18_000;

export interface CurrentBookingLinkResearch {
  pageTitle: string;
  pageExcerpt: string;
  checkedAtIso: string;
  sourceLabel: string;
  sourceUrl: string;
}

function assertAllowedBookingUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || !ALLOWED_BOOKING_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("The current booking link is not on an approved Cruise Brothers booking host.");
  }
  return url;
}

function collapseWhitespace(value: string): string {
  let output = "";
  let previousWasWhitespace = false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    const isWhitespace =
      code === 9 ||
      code === 10 ||
      code === 11 ||
      code === 12 ||
      code === 13 ||
      code === 32 ||
      code === 160;
    if (isWhitespace) {
      if (!previousWasWhitespace && output.length > 0) output += " ";
      previousWasWhitespace = true;
    } else {
      output += character;
      previousWasWhitespace = false;
    }
  }
  return output.trim();
}

function replaceLiteral(value: string, sensitiveValue: string | undefined): string {
  const target = sensitiveValue?.trim();
  if (!target || target.length < 3) return value;
  return value.split(target).join("[redacted]");
}

function redactDraftValues(value: string, draft: BookingDraft): string {
  let redacted = value;
  const sensitiveValues: Array<string | undefined> = [
    draft.contact.firstName,
    draft.contact.email,
    draft.contact.phoneE164,
  ];

  for (const traveler of draft.travelers) {
    sensitiveValues.push(
      traveler.legalFirstName,
      traveler.legalMiddleName,
      traveler.legalLastName,
      traveler.dateOfBirth,
      traveler.addressLine1,
      traveler.addressLine2,
      traveler.addressCity,
      traveler.addressPostalCode,
      traveler.email,
      traveler.phone,
      traveler.loyaltyNumber,
      traveler.pastPassengerNumber
    );
  }

  for (const sensitiveValue of sensitiveValues) {
    redacted = replaceLiteral(redacted, sensitiveValue);
  }
  return redacted;
}

function containsSailingMarker(value: string, draft: BookingDraft): boolean {
  const normalized = value.toLowerCase();
  const ship = draft.dealSnapshot.ship.trim().toLowerCase();
  const cruiseLine = draft.dealSnapshot.cruiseLine.trim().toLowerCase();
  const packageId = draft.dealSnapshot.packageId.trim().toLowerCase();
  return (
    (ship.length > 2 && normalized.includes(ship)) ||
    (cruiseLine.length > 2 && normalized.includes(cruiseLine)) ||
    (packageId.length > 2 && normalized.includes(packageId))
  );
}

async function renderBookingPage(
  sourceUrl: URL,
  draft: BookingDraft
): Promise<{ pageTitle: string; pageExcerpt: string; finalUrl: URL }> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(sourceUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    const finalUrl = assertAllowedBookingUrl(page.url());
    const pageTitle = redactDraftValues(collapseWhitespace(await page.title()), draft);
    const bodyText = await page.locator("body").innerText({ timeout: 10_000 });
    const pageExcerpt = redactDraftValues(
      collapseWhitespace(bodyText).slice(0, MAX_EXCERPT_CHARACTERS),
      draft
    );
    return { pageTitle, pageExcerpt, finalUrl };
  } finally {
    await browser.close();
  }
}

export async function inspectCurrentBookingLink(
  draft: BookingDraft,
  fetchImplementation: typeof fetch = fetch
): Promise<CurrentBookingLinkResearch> {
  const sourceUrl = assertAllowedBookingUrl(draft.dealSnapshot.sourceBookingUrl);
  const response = await fetchImplementation(sourceUrl, {
    method: "GET",
    redirect: "follow",
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "LeisureLife-Booking-Call-Copilot/1.0",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`The current supplier booking page returned HTTP ${response.status}.`);
  }

  const finalUrl = assertAllowedBookingUrl(response.url || sourceUrl.toString());
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) {
    throw new Error("The current supplier booking link did not return an HTML page.");
  }

  const html = (await response.text()).slice(0, MAX_RESPONSE_CHARACTERS);
  const document = load(html);
  document("script, style, noscript, svg, iframe").remove();

  let pageTitle = redactDraftValues(collapseWhitespace(document("title").text()), draft);
  let pageExcerpt = redactDraftValues(
    collapseWhitespace(document("body").text()).slice(0, MAX_EXCERPT_CHARACTERS),
    draft
  );
  let resolvedFinalUrl = finalUrl;

  if (pageExcerpt.length < 40 || !containsSailingMarker(pageExcerpt, draft)) {
    const rendered = await renderBookingPage(sourceUrl, draft);
    pageTitle = rendered.pageTitle;
    pageExcerpt = rendered.pageExcerpt;
    resolvedFinalUrl = rendered.finalUrl;
  }

  if (pageExcerpt.length < 40 || !containsSailingMarker(pageExcerpt, draft)) {
    throw new Error("The current supplier booking page loaded without readable facts for the selected sailing.");
  }

  return {
    pageTitle: pageTitle || "Current supplier booking page",
    pageExcerpt,
    checkedAtIso: new Date().toISOString(),
    sourceLabel: `${resolvedFinalUrl.hostname}${resolvedFinalUrl.pathname}`,
    sourceUrl: sourceUrl.toString(),
  };
}
