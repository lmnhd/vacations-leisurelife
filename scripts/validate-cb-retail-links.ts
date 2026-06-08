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
import type { BrowserContext } from "playwright";
import * as fs from "fs";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { chatDynamoDocumentClient } from "../lib/chat/dynamo-client";
import { scanAllCampaigns } from "../lib/campaigns/campaign-store";
import type { Campaign } from "../lib/campaigns/types";
import { checkCbLink } from "../lib/cb/link-broker/browser-validate";

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

// SPA-aware link checking now lives in lib/cb/link-broker/browser-validate.ts so
// the Link Broker and this script share one implementation. checkCbLink returns
// { passed, failureReason }; this script only needs the boolean.
async function isCbLinkValid(url: string, swiftCtx: BrowserContext): Promise<boolean> {
  const outcome = await checkCbLink(url, swiftCtx);
  return outcome.passed;
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
