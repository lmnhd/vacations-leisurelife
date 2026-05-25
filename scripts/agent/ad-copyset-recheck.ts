/**
 * Agent-safe ad copy-set quality recheck - no Playwright, no HTTP, no LLM.
 *
 * Usage:
 *   npx tsx scripts/agent/ad-copyset-recheck.ts <slug> <copyset-json> [format...]
 *
 * The JSON file may be a full Copy Forge response ({ copySet: ... }) or a raw
 * AdCopySet. If formats are omitted, they are inferred from copySet.formats.
 * Output is written to scripts/agent/output/<slug>-ad-copyset-quality.json.
 */

import { loadEnvConfig } from '@next/env';
import * as fs from 'fs';
import * as path from 'path';
import { getCampaignBlueprint, getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { getMediaManifest } from '@/lib/campaigns/media/media-store';
import { buildCampaignAdInput } from '@/lib/campaigns/media/ad-pack-adapter';
import { runQualityGate } from '@/lib/ads/copy-forge';
import { AD_FORMATS, type AdCopySet, type AdFormat } from '@/lib/ads/types';

loadEnvConfig(process.cwd());

function isValidFormat(value: string): value is AdFormat {
    return (AD_FORMATS as readonly string[]).includes(value);
}

function readCopySet(filePath: string): AdCopySet {
    const document = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf-8')) as {
        copySet?: AdCopySet;
        formats?: AdCopySet['formats'];
    };
    const copySet = document.copySet ?? document;
    if (!copySet || typeof copySet !== 'object' || !copySet.formats) {
        throw new Error('Input JSON must be a Copy Forge response with copySet or a raw AdCopySet with formats.');
    }
    return copySet as AdCopySet;
}

async function main(): Promise<void> {
    const [slug, copySetPath, ...formatArgs] = process.argv.slice(2);
    if (!slug || !copySetPath) {
        console.error('Usage: npx tsx scripts/agent/ad-copyset-recheck.ts <slug> <copyset-json> [format...]');
        process.exit(1);
    }

    const copySet = readCopySet(copySetPath);
    const inferredFormats = Object.keys(copySet.formats).filter(isValidFormat);
    const requestedFormats = formatArgs.length > 0 ? formatArgs.filter(isValidFormat) : inferredFormats;

    if (requestedFormats.length === 0) {
        throw new Error(`No valid formats found. Valid formats: ${AD_FORMATS.join(', ')}`);
    }

    const [campaign, brief, manifest] = await Promise.all([
        getCampaignBlueprint(slug),
        getAestheticBrief(slug),
        getMediaManifest(slug),
    ]);

    if (!campaign) throw new Error(`Campaign not found: ${slug}`);
    if (!brief) throw new Error(`Aesthetic brief not found: ${slug}`);

    const input = buildCampaignAdInput({
        brief,
        campaign,
        manifest,
        formats: requestedFormats,
    });
    const gate = runQualityGate(copySet, input);
    const output = {
        slug,
        formats: requestedFormats,
        qualityGate: gate,
        checkedAt: new Date().toISOString(),
        source: path.resolve(copySetPath),
    };

    const outputDir = path.join(process.cwd(), 'scripts', 'agent', 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${slug}-ad-copyset-quality.json`);
    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');

    console.log(JSON.stringify(output, null, 2));
    console.log(`\n[agent] Written to ${outputPath}`);
    if (!gate.passed) {
        process.exitCode = 2;
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
