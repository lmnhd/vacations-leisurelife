const SLUG = 'wellness-and-nature-cruise';
const BASE = 'http://localhost:3000';
const OUT = require('path').join(__dirname, 'test-single-regen-output.json');

async function main() {
  const results = [];

  // Test 1: Regenerate one hero
  console.log('Test 1: Regenerate hero img_hero_rev_01ed476c');
  const heroRes = await fetch(`${BASE}/api/groups/campaign/${SLUG}/media/regenerate-with-revision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assetId: 'img_hero_rev_01ed476c',
      applyMode: 'append_note',
      revisionNote: 'Show a diverse group of 4-6 people of varying ages, ethnicities, and body types engaging in wellness activities together on the ship deck. Include yoga, stretching, and mindful movement.',
    }),
  });
  results.push({ test: 'hero', status: heroRes.status, data: await heroRes.json() });

  // Test 2: Regenerate one concept
  console.log('Test 2: Regenerate concept img_concept_rev_1da23aeb');
  const conceptRes = await fetch(`${BASE}/api/groups/campaign/${SLUG}/media/regenerate-with-revision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assetId: 'img_concept_rev_1da23aeb',
      applyMode: 'append_note',
      revisionNote: 'Depict a diverse group of 4-6 people doing wellness and nature activities together. Show individuals of different ages, ethnicities, and body types practicing yoga, meditation, or mindful movement on deck.',
    }),
  });
  results.push({ test: 'concept', status: conceptRes.status, data: await conceptRes.json() });

  require('fs').writeFileSync(OUT, JSON.stringify(results, null, 2), 'utf8');
  console.log('Results saved to', OUT);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
