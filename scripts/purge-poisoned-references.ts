/**
 * purge-poisoned-references.ts
 *
 * One-off cleanup for ship reference assets whose stored bytes are NOT a real
 * image. Root cause: some sources (notably Facebook lookaside/photo.php URLs)
 * return a 200 OK HTML redirect page instead of image bytes. Before the byte-
 * validation fix in ship-reference-service.ts, the rehoster persisted those
 * HTML bytes to R2 under a `.jpg` key, so the reference shows as a blank
 * "Open asset" tile and every downstream scene fetch degrades to text-only.
 *
 * What it does, for the given campaign slug:
 *   1. Loads all ACTIVE ship_reference_image records.
 *   2. Fetches each record's stored URL and checks the real content-type +
 *      magic bytes. Anything that isn't a true JPEG/PNG/GIF/WebP is "poisoned".
 *   3. Deactivates each poisoned AssetRecord (active = false) and deletes its
 *      poisoned object from R2.
 *   4. Unless --no-rediscover is passed, re-runs ship reference discovery
 *      (excluding all surviving + just-removed source URLs) and imports fresh
 *      candidates to backfill.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/purge-poisoned-references.ts <slug>
 *   npx tsx --env-file=.env.local scripts/purge-poisoned-references.ts <slug> --dry-run
 *   npx tsx --env-file=.env.local scripts/purge-poisoned-references.ts <slug> --no-rediscover
 */

import { getCampaignBlueprint } from '../lib/campaigns/campaign-store';
import { getAssetsByType, deactivateAssetRecord } from '../lib/campaigns/media/media-store';
import { deleteAsset, isR2Available } from '../lib/campaigns/media/r2-client';
import {
    discoverShipReferenceCandidatesWithExclusions,
    importShipReferenceAssets,
} from '../lib/campaigns/media/ship-reference-service';
import type { AssetRecord } from '../lib/campaigns/schema';

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const skipRediscover = args.includes('--no-rediscover');

if (!slug) {
    console.error('Usage: npx tsx --env-file=.env.local scripts/purge-poisoned-references.ts <slug> [--dry-run] [--no-rediscover]');
    process.exit(1);
}

/** Magic-byte image detection — the only trustworthy signal for third-party bytes. */
function isImageBuffer(buf: Buffer): boolean {
    if (buf.length < 12) return false;
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true; // JPEG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true; // PNG
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true; // GIF
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true; // WebP
    return false;
}

/** Derive the R2 object path (relative to campaigns/{slug}/) from a stored URL. */
function r2PathFromUrl(url: string, slug: string): string | null {
    const marker = `/campaigns/${slug}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return url.slice(idx + marker.length);
}

async function isPoisoned(record: AssetRecord): Promise<boolean> {
    const url = record.url;
    // Records that never rehosted (external/pending) aren't R2-poisoned; skip.
    if (!url || url.startsWith('r2://pending:') || url.startsWith('/api/')) {
        return false;
    }
    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.warn(`  ! ${record.assetId}: fetch ${res.status} (${url})`);
            return false; // a transient fetch failure is not the same as poisoned bytes
        }
        const buf = Buffer.from(await res.arrayBuffer());
        return !isImageBuffer(buf);
    } catch (err) {
        console.warn(`  ! ${record.assetId}: fetch error ${String(err)}`);
        return false;
    }
}

async function main() {
    console.log(`\n=== Purge poisoned references: ${slug} ===`);
    console.log(`mode: ${dryRun ? 'DRY RUN' : 'LIVE'}${skipRediscover ? ' (no rediscover)' : ''}\n`);

    if (!isR2Available()) {
        console.error('R2 not configured (CLOUDFLARE_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY). Aborting.');
        process.exit(1);
    }

    const campaign = await getCampaignBlueprint(slug!);
    if (!campaign) {
        console.error(`Campaign not found: ${slug}`);
        process.exit(1);
    }

    const references = await getAssetsByType(slug!, 'ship_reference_image');
    console.log(`Found ${references.length} active ship_reference_image record(s). Checking stored bytes...`);

    const poisoned: AssetRecord[] = [];
    const healthy: AssetRecord[] = [];
    for (const record of references) {
        if (await isPoisoned(record)) {
            poisoned.push(record);
            console.log(`  ✗ POISONED  ${record.assetId}  source=${record.sourcePageUrl ?? record.sourceImageUrl ?? 'n/a'}`);
        } else {
            healthy.push(record);
        }
    }

    if (poisoned.length === 0) {
        console.log('\nNo poisoned references found. Nothing to do.');
        return;
    }

    console.log(`\n${poisoned.length} poisoned reference(s) to remove, ${healthy.length} healthy reference(s) preserved.`);

    if (dryRun) {
        console.log('\nDRY RUN — no changes made.');
        return;
    }

    // 1. Deactivate records + delete poisoned R2 objects.
    for (const record of poisoned) {
        await deactivateAssetRecord(slug!, record.assetId);
        const path = r2PathFromUrl(record.url, slug!);
        if (path) {
            await deleteAsset(slug!, path);
            console.log(`  - removed ${record.assetId} (R2: ${path})`);
        } else {
            console.log(`  - deactivated ${record.assetId} (could not derive R2 path from ${record.url})`);
        }
    }

    if (skipRediscover) {
        console.log('\n--no-rediscover set. Re-run reference discovery from the UI when ready.');
        return;
    }

    // 2. Re-run discovery, excluding every source URL we still have or just removed,
    //    so we don't re-pick the same poisoned candidates.
    const excludedImageUrls = [...healthy, ...poisoned]
        .map((r) => r.sourceImageUrl ?? r.url)
        .filter(Boolean) as string[];

    console.log(`\nRe-running ship reference discovery (excluding ${excludedImageUrls.length} known source URL(s))...`);
    const candidates = await discoverShipReferenceCandidatesWithExclusions(campaign, poisoned.length + 2, {
        imageUrls: excludedImageUrls,
    });

    if (candidates.length === 0) {
        console.warn('Discovery returned no new candidates. The poisoned refs are removed; re-try discovery later.');
        return;
    }

    const imported = await importShipReferenceAssets(slug!, campaign, candidates);
    console.log(`Imported ${imported.length} replacement reference(s):`);
    for (const record of imported) {
        console.log(`  + ${record.assetId}  ${record.url}`);
    }

    console.log('\nDone. Reload the references panel to confirm the tiles render.');
}

main().catch((err) => {
    console.error('\nFAILED:', err);
    process.exit(1);
});
