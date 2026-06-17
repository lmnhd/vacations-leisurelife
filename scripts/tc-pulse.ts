/**
 * TC Pulse CLI — operator-run autonomous Tour Conductor sweep.
 *
 *   npm run tc-pulse:report          # dry-run: show engagement + what WOULD post
 *   npm run tc-pulse                 # live: actually post the chosen messages
 *   npm run tc-pulse:report -- --slug=my-campaign   # scope to one campaign
 *   npm run tc-pulse -- --slug=my-campaign
 *
 * Dry-run is the default and prints the exact generated copy for each campaign
 * so you can review tone before anything goes public (review-then-send). Pass
 * `--live` (wired by the `tc-pulse` script) to post.
 */

import { runTcPulse, type PulseRunResult } from '@/lib/campaigns/chat/tc-pulse';

function parseArgs(argv: string[]): { live: boolean; slug?: string } {
    let live = false;
    let slug: string | undefined;
    for (const arg of argv) {
        if (arg === '--live') live = true;
        else if (arg.startsWith('--slug=')) slug = arg.slice('--slug='.length).trim() || undefined;
    }
    return { live, slug };
}

function report(result: PulseRunResult): void {
    const mode = result.dryRun ? 'DRY-RUN (no posts written)' : 'LIVE';
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log(`  TC PULSE — ${mode}`);
    console.log(`  ${result.runAt} · ${result.campaignsScanned} campaigns scanned`);
    console.log('══════════════════════════════════════════════════════════════\n');

    for (const c of result.perCampaign) {
        const e = c.engagement;
        console.log(`▸ ${c.name}  (${c.slug})`);
        console.log(`    signups: ${e.verifiedSignups} verified · ${e.thresholdPercent}% to ${e.requiredCabins} cabins · ideas: ${e.guestIdeaCount}`);
        console.log(`    last guest msg: ${e.lastGuestMessageAt ?? 'never'}${e.daysSinceLastGuestMessage !== null ? ` (${e.daysSinceLastGuestMessage}d ago)` : ''}`
            + ` · expiry: ${e.daysToExpiry !== null ? `${e.daysToExpiry}d` : 'n/a'}`);

        if (c.skippedReason) {
            console.log(`    ⏭  skipped: ${c.skippedReason}\n`);
            continue;
        }
        if (c.plans.length === 0) {
            console.log(`    ✓ no intervention warranted this sweep\n`);
            continue;
        }
        for (const p of c.plans) {
            const status = p.error ? `✗ ERROR: ${p.error}` : p.posted ? '✅ POSTED' : '📝 WOULD POST';
            console.log(`    ${status}  [${p.rule} → #${p.channel}, key=${p.dedupeKey}]`);
            console.log(`       reason: ${p.reason}`);
            if (p.message) {
                console.log(`       message: "${p.message}"`);
            }
        }
        console.log('');
    }

    console.log('──────────────────────────────────────────────────────────────');
    console.log(`  decided: ${result.totals.decided} · posted: ${result.totals.posted} · failed: ${result.totals.failed}`);
    if (result.dryRun && result.totals.decided > 0) {
        console.log('  Run `npm run tc-pulse` to post these live.');
    }
    console.log('──────────────────────────────────────────────────────────────\n');
}

async function main(): Promise<void> {
    const { live, slug } = parseArgs(process.argv.slice(2));
    const result = await runTcPulse({ dryRun: !live, onlyCampaignSlug: slug });
    report(result);
    if (result.totals.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
    console.error('[tc-pulse] fatal:', err);
    process.exit(1);
});
