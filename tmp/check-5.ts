import { getDiscoveries } from './lib/services/dynamodb';

async function run() {
  const all = await getDiscoveries();
  const slugs = [
    'alaska-slow-living-2026-09-20',
    'night-sky-sea-2026',
    'retro-handheld-arcade-2026',
    'alaska-tea-ritual-2026-09-20',
    'eastern-caribbean-stitch-sail-2026-09-19'
  ];
  
  for (const slug of slugs) {
    const item = all.find(c => c.id === slug);
    if (!item) {
      console.log(`❌ ${slug}: Not found in DB entirely.`);
      continue;
    }
    
    if (item.aestheticBrief) {
      console.log(`✅ ${slug}: Brief is PRESENT.`);
    } else {
      console.log(`⚠️ ${slug}: NO BRIEF PRESENT.`);
    }
  }
}
run();