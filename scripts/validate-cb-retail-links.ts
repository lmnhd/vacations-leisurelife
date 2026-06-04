/**
 * CB Retail Link Validator
 *
 * Scans all active campaigns, checks both odysseusRetailBookingLink and
 * cbagenttoolsBookingLink for validity, and clears broken ones from DynamoDB.
 *
 * CB swift/cruise/package/ pages are JavaScript SPAs that always return HTTP 200
 * even when the package is gone — plain fetch cannot detect "Package Not Found".
 * These URLs are validated with a headless Playwright browser instead.
 *
 * Usage:
 *   npx tsx scripts/validate-cb-retail-links.ts             # all active campaigns
 *   npx tsx scripts/validate-cb-retail-links.ts --dry-run   # report only, no writes
 *   npx tsx scripts/validate-cb-retail-links.ts --slug fiber-arts-yarn-tasting-voyage
 */

import { loadEnvConfig } from "@next/env";
import path from "path";
import { chromium } from "playwright";
import type { Browser, BrowserContext } from "playwright";
import * as fs from "fs";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { chatDynamoDocumentClient } from "../lib/chat/dynamo-client";
import { scanAllCampaigns } from "../lib/campaigns/campaign-store";
import type { Campaign } from "../lib/campaigns/types";

loadEnvConfig(path.join(process.cwd()));

const TABLE_NAME = "lll-shadow-campaigns";
const STATE_FILE = path.join(process.cwd(), ".playwright-state.json");
const REAL_CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const targetSlugs = args.reduce<string[]>((acc, val, idx) => {
  if (val === "--slug") {
    const slug = args[idx + 1];
    if (slug) acc.push(slug);
  }
  return acc;
}, []);

const CB_SWIFT_SPA_PATH = "/swift/cruise/package/";
const CB_SPA_ERROR_MARKERS = ["Package Not Found", "Oops!"];
const CB_FETCH_ERROR_MARKERS = ["Package Not Found", "No package details found", "package-not-found"];
const PAGE_LOAD_TIMEOUT_MS = 15_000;

async function isCbSwiftLinkValid(url: string, context: BrowserContext): Promise<boolean> {
  const page = await context.newPage();
  let apiIndicatedNotFound = false;

  // Intercept all JSON API responses from the CB domain.
  // The SPA calls its backend to load package data — if that API signals
  // "not found" in the response body, the package is gone regardless of render timing.
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

    if (apiIndicatedNotFound) return false;

    // Final fallback: check visible rendered text
    const bodyText = (await page.innerText("body").catch(() => ""));
    return !CB_SPA_ERROR_MARKERS.some((m) => bodyText.includes(m));
  } catch {
    return false;
  } finally {
    await page.close();
  }
}

async function isCbFetchLinkValid(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LLI-LinkValidator/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status >= 400) return false;
    const body = await response.text();
    for (const marker of CB_FETCH_ERROR_MARKERS) {
      if (body.includes(marker)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function isCbLinkValid(url: string, swiftCtx: BrowserContext): Promise<boolean> {
  if (url.includes(CB_SWIFT_SPA_PATH)) {
    return isCbSwiftLinkValid(url, swiftCtx);
  }
  return isCbFetchLinkValid(url);
}

async function clearRetailLink(slug: string): Promise<void> {
  await chatDynamoDocumentClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `CAMPAIGN#${slug}`, SK: "METADATA" },
    UpdateExpression: "REMOVE odysseusRetailBookingLink SET updatedAt = :now",
    ExpressionAttributeValues: { ":now": new Date().toISOString() },
  }));
}

async function clearGroupLink(slug: string): Promise<void> {
  await chatDynamoDocumentClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `CAMPAIGN#${slug}`, SK: "METADATA" },
    UpdateExpression: "REMOVE cbagenttoolsBookingLink SET updatedAt = :now",
    ExpressionAttributeValues: { ":now": new Date().toISOString() },
  }));
}

async function main(): Promise<void> {
  console.log(`[validate-cb-retail-links] Starting${isDryRun ? " (DRY RUN)" : ""}...`);

  const allCampaigns = await scanAllCampaigns();

  const candidates: Campaign[] = allCampaigns.filter((c) => {
    const hasAnyLink = Boolean(c.odysseusRetailBookingLink) || Boolean(c.cbagenttoolsBookingLink);
    const isActive =
      c.status === "GATHERING_INTEREST" ||
      c.status === "THRESHOLD_MET" ||
      c.status === "CONVERTED";
    const slugMatch = targetSlugs.length === 0 || targetSlugs.includes(c.id);
    return hasAnyLink && isActive && slugMatch;
  });

  console.log(`[validate-cb-retail-links] ${candidates.length} campaign(s) to check.`);

  const useRealChrome = fs.existsSync(REAL_CHROME_PATH);
  const browser = await chromium.launch({
    headless: true,
    executablePath: useRealChrome ? REAL_CHROME_PATH : undefined,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });
  const swiftContext: BrowserContext = fs.existsSync(STATE_FILE)
    ? await browser.newContext({ storageState: STATE_FILE, viewport: { width: 1920, height: 1080 } })
    : await browser.newContext({ viewport: { width: 1920, height: 1080 } });

  let valid = 0;
  let broken = 0;
  let cleared = 0;

  try {
    for (const campaign of candidates) {
      console.log(`\n  Campaign: "${campaign.id}"`);

      if (campaign.odysseusRetailBookingLink) {
        const url = campaign.odysseusRetailBookingLink;
        process.stdout.write(`    [retail]  ${url.slice(0, 72)}... `);
        const isValid = await isCbLinkValid(url, swiftContext);
        if (isValid) {
          console.log("✅");
          valid++;
        } else {
          console.log("❌ BROKEN");
          broken++;
          if (!isDryRun) {
            await clearRetailLink(campaign.id);
            console.log(`    ↳ odysseusRetailBookingLink cleared`);
            cleared++;
          } else {
            console.log(`    ↳ (dry-run) would clear odysseusRetailBookingLink`);
          }
        }
      }

      if (campaign.cbagenttoolsBookingLink) {
        const url = campaign.cbagenttoolsBookingLink;
        process.stdout.write(`    [group]   ${url.slice(0, 72)}... `);
        const isValid = await isCbLinkValid(url, swiftContext);
        if (isValid) {
          console.log("✅");
          valid++;
        } else {
          console.log("❌ BROKEN");
          broken++;
          if (!isDryRun) {
            await clearGroupLink(campaign.id);
            console.log(`    ↳ cbagenttoolsBookingLink cleared (re-run Phase B to restore)`);
            cleared++;
          } else {
            console.log(`    ↳ (dry-run) would clear cbagenttoolsBookingLink`);
          }
        }
      }
    }
  } finally {
    await swiftContext.close();
    await browser.close();
  }

  console.log(
    `\n[validate-cb-retail-links] Done. valid=${valid} broken=${broken} cleared=${cleared}`,
  );
}

main().catch((err) => {
  console.error("[validate-cb-retail-links] Fatal error:", err);
  process.exit(1);
});
