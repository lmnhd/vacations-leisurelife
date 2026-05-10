const SLUG = 'wellness-and-nature-cruise';
const BASE = 'http://localhost:3000';

const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'fix-remaining-output.json');

async function regenerateAsset(assetId, revisionNote) {
  const res = await fetch(`${BASE}/api/groups/campaign/${SLUG}/media/regenerate-with-revision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assetId,
      applyMode: 'append_note',
      revisionNote,
    }),
  });
  return { status: res.status, data: await res.json() };
}

async function main() {
  const results = [];

  // Remaining heroes (the ones still at v2)
  const remainingHeroes = [
    'img_hero_rev_5041d9c0',
    'img_hero_rev_e34024a4',
    'img_hero_rev_0886ec5a',
    'img_hero_rev_e752d338',
  ];

  for (const assetId of remainingHeroes) {
    console.log(`Regenerating hero: ${assetId}`);
    const r = await regenerateAsset(assetId,
      'Show a diverse group of 4-6 people of varying ages, ethnicities, and body types engaging in wellness activities together on the ship deck. Include yoga, stretching, and mindful movement. Make it clearly a group event, not a couple.'
    );
    results.push({ type: 'hero', assetId, ...r });
    console.log(`  -> status=${r.status}`);
  }

  // Remaining concept (the one still at v2)
  const remainingConcept = 'img_concept_rev_cd7cd87f';
  console.log(`Regenerating concept: ${remainingConcept}`);
  const conceptResult = await regenerateAsset(remainingConcept,
    'Depict a diverse group of 4-6 people doing wellness and nature activities together. Show individuals of different ages, ethnicities, and body types practicing yoga, meditation, or mindful movement on deck. This must look like an inclusive group gathering, not a couples retreat.'
  );
  results.push({ type: 'concept', assetId: remainingConcept, ...conceptResult });
  console.log(`  -> status=${conceptResult.status}`);

  // Documentary details with wellness instructions
  const docDetails = [
    'doc_detail_trust_photo_01',
    'doc_detail_artifact_still_life_02',
    'doc_detail_texture_plate_03',
    'doc_detail_human_glimpse_04',
    'doc_detail_motion_plate_05',
  ];

  for (const assetId of docDetails) {
    console.log(`Regenerating documentary detail: ${assetId}`);
    const r = await regenerateAsset(assetId,
      'Show people engaging in wellness and fitness activities together on the cruise ship. Include diverse individuals practicing yoga, stretching, or mindful movement in groups. This should feel like an active wellness gathering, not a prop still-life or empty space.'
    );
    results.push({ type: 'doc_detail', assetId, ...r });
    console.log(`  -> status=${r.status}`);
  }

  fs.writeFileSync(OUT, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nResults saved to ${OUT}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
