import { loadEnvConfig } from '@next/env';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';

loadEnvConfig(process.cwd());

async function main() {
    const slug = process.argv[2];
    if (!slug) {
        console.error('Usage: npx tsx --env-file=.env.local scripts/inspect-brief-lint.ts <slug>');
        process.exit(1);
    }
    const brief = await getAestheticBrief(slug);
    if (!brief) { console.log('Brief not found.'); return; }

    console.log('\n=== PRODUCTION BUILD LINT ===');
    console.log('Status:', brief.productionBuildStatus);
    const lint = brief.productionBuildLint;
    if (lint) {
        console.log('Blockers:', JSON.stringify(lint.blockingIssues, null, 2));
        console.log('Warnings:', JSON.stringify(lint.warnings, null, 2));
    }

    console.log('\n=== AVOID LIST vs AVOID DIRECTIVES ===');
    console.log('avoidList:', JSON.stringify(brief.visual?.avoidList ?? [], null, 2));
    console.log('avoidDirectives:', JSON.stringify(brief.productionBible?.avoidDirectives ?? [], null, 2));

    console.log('\n=== STORYBOARD SHOT SEQUENCES ===');
    for (const sb of brief.productionBible?.storyboards ?? []) {
        console.log(`  [${sb.deliverableId}] shotSequence.length = ${sb.shotSequence?.length ?? 0}`);
    }

    console.log('\n=== LANDING STILLS ===');
    const stills = brief.landingStillBible?.stillLibrary ?? [];
    console.log('Count:', stills.length);
    for (const s of stills) {
        console.log(`  [${s.stillId}] usage=${s.usage} slotRole=${s.slotRole ?? 'none'} composition_has_intimate=${/intimate|close|tight|detail/i.test(s.composition)}`);
    }

    console.log('\n=== COMMUNITY EXPRESSION ===');
    console.log('visualTogethernessNotes:', JSON.stringify(brief.communityExpression?.visualTogethernessNotes));
}

main().catch((e) => { console.error(e); process.exit(1); });
