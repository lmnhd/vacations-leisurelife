import { reviseDiscoveryBlueprint } from './lib/campaigns/discovery-revision';

async function run() {
  const slugs = ['cartridge-and-sunrise-retro-deck-nights', 'aesthetic-scandinavia-2026'];
  for (const slug of slugs) {
    console.log('Revising', slug, '...');
    try {
      const result = await reviseDiscoveryBlueprint(slug);
      console.log('Successfully revised', slug);
    } catch(e) {
      console.error('Failed to revise', slug, e);
    }
  }
}
run();
