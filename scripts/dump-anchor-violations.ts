import { loadEnvConfig } from '@next/env';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { validateAnchorCompliance } from '@/lib/campaigns/editors-room';
import { generateActionAnchors } from '@/lib/campaigns/editors-room';

loadEnvConfig(process.cwd());

async function main() {
    const slug = process.argv[2];
    if (!slug) { console.error('Usage: npx tsx --env-file=.env.local scripts/dump-anchor-violations.ts <slug>'); process.exit(1); }
    const brief = await getAestheticBrief(slug);
    if (!brief) { console.log('Brief not found'); return; }
    const stills = brief.landingStillBible?.stillLibrary ?? [];
    console.log('\n=== STILLS (stillId / slotRole / usage / anchorId / locationFamily) ===');
    for (const s of stills) {
        const locLower = (s.location + ' ' + s.environmentDetails).toLowerCase();
        console.log(`  stillId=${s.stillId} | slotRole=${s.slotRole} | usage=${s.usage} | anchorId=${s.anchorId} | loc=${s.location.slice(0,40)}`);
    }
    console.log('\n=== STILL COUNTS ===');
    console.log('stillLibrary.length:', stills.length);
    const slotRoleMap = new Map<string, number>();
    for (const s of stills) {
        slotRoleMap.set(s.slotRole ?? '', (slotRoleMap.get(s.slotRole ?? '') ?? 0) + 1);
    }
    console.log('slotRole distribution:', Object.fromEntries(slotRoleMap));
}

main().catch((e) => { console.error(e); process.exit(1); });
