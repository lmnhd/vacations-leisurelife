/**
 * CB Retail Link Validator
 *
 * Scans all active campaigns with an odysseusRetailBookingLink stored, HEAD-checks
 * each URL for validity, and clears broken links from DynamoDB so the landing page
 * suppresses the "Need the faster path?" CTA automatically.
 *
 * CB package pages return HTTP 200 even for invalid packages (SPA), so we fetch
 * the page body and look for the known error markers in the response.
 *
 * Usage:
 *   npx tsx scripts/validate-cb-retail-links.ts             # all active campaigns
 *   npx tsx scripts/validate-cb-retail-links.ts --dry-run   # report only, no writes
 *   npx tsx scripts/validate-cb-retail-links.ts --slug yarn-touring-caribbean-2026
 */

import { loadEnvConfig } from "@next/env";
import path from "path";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { chatDynamoDocumentClient } from "../lib/chat/dynamo-client";
import { scanAllCampaigns } from "../lib/campaigns/campaign-store";
import type { Campaign } from "../lib/campaigns/types";

loadEnvConfig(path.join(process.cwd()));

const TABLE_NAME = "lll-shadow-campaigns";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const targetSlugs = args.reduce<string[]>((acc, val, idx) => {
  if (val === "--slug") {
    const slug = args[idx + 1];
    if (slug) acc.push(slug);
  }
  return acc;
}, []);

const CB_ERROR_MARKERS = [
  "Package Not Found",
  "No package details found",
  "package-not-found",
];

async function isCbRetailLinkValid(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LLI-LinkValidator/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status >= 400) {
      return false;
    }

    const body = await response.text();
    for (const marker of CB_ERROR_MARKERS) {
      if (body.includes(marker)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

async function clearRetailLink(slug: string): Promise<void> {
  const params = {
    TableName: TABLE_NAME,
    Key: { PK: `CAMPAIGN#${slug}`, SK: "METADATA" },
    UpdateExpression: "REMOVE odysseusRetailBookingLink SET updatedAt = :now",
    ExpressionAttributeValues: { ":now": new Date().toISOString() },
  };
  await chatDynamoDocumentClient.send(new UpdateCommand(params));
}

async function main(): Promise<void> {
  console.log(`[validate-cb-retail-links] Starting${isDryRun ? " (DRY RUN)" : ""}...`);

  const allCampaigns = await scanAllCampaigns();

  const candidates: Campaign[] = allCampaigns.filter((c) => {
    const hasLink = Boolean(c.odysseusRetailBookingLink);
    const isActive =
      c.status === "GATHERING_INTEREST" ||
      c.status === "THRESHOLD_MET" ||
      c.status === "CONVERTED";
    const slugMatch =
      targetSlugs.length === 0 || targetSlugs.includes(c.id);
    return hasLink && isActive && slugMatch;
  });

  console.log(`[validate-cb-retail-links] ${candidates.length} campaign(s) with retail links to check.`);

  let valid = 0;
  let broken = 0;
  let cleared = 0;

  for (const campaign of candidates) {
    const url = campaign.odysseusRetailBookingLink!;
    process.stdout.write(`  Checking "${campaign.id}" → ${url.slice(0, 70)}... `);

    const isValid = await isCbRetailLinkValid(url);

    if (isValid) {
      console.log("✅ valid");
      valid++;
    } else {
      console.log("❌ BROKEN");
      broken++;

      if (!isDryRun) {
        await clearRetailLink(campaign.id);
        console.log(`    ↳ odysseusRetailBookingLink cleared for "${campaign.id}"`);
        cleared++;
      } else {
        console.log(`    ↳ (dry-run) would clear odysseusRetailBookingLink for "${campaign.id}"`);
      }
    }
  }

  console.log(
    `\n[validate-cb-retail-links] Done. valid=${valid} broken=${broken} cleared=${cleared}`,
  );
}

main().catch((err) => {
  console.error("[validate-cb-retail-links] Fatal error:", err);
  process.exit(1);
});
