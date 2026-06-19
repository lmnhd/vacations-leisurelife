/**
 * Agent-safe campaign manifest export — no Playwright, no HTTP.
 * Reads the stored media manifest from DynamoDB and writes a local JSON copy.
 *
 * Usage:
 *   npx tsx scripts/agent/export-manifest.ts <slug> [outputPath]
 *
 * Default output:
 *   scripts/agent/output/<slug>-media-manifest.json
 */

import { loadEnvConfig } from '@next/env';
import * as fs from 'fs';
import * as path from 'path';
import { getMediaManifest } from '@/lib/campaigns/media/media-store';

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
    const [slug, requestedOutputPath] = process.argv.slice(2);

    if (!slug) {
        console.error('Usage: npx tsx scripts/agent/export-manifest.ts <slug> [outputPath]');
        process.exit(1);
    }

    const manifest = await getMediaManifest(slug);
    if (!manifest) {
        console.error(`No media manifest found for slug "${slug}".`);
        process.exit(1);
    }

    const outputPath = requestedOutputPath
        ? path.resolve(process.cwd(), requestedOutputPath)
        : path.join(process.cwd(), 'scripts', 'agent', 'output', `${slug}-media-manifest.json`);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf-8');

    console.log(JSON.stringify({
        slug,
        outputPath,
        totalAssets: manifest.totalAssets,
        completionStatus: manifest.completionStatus,
        exportedAt: new Date().toISOString(),
    }, null, 2));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
