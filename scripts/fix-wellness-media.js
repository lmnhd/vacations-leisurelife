const SLUG = 'wellness-and-nature-cruise';
const BASE = 'http://localhost:3000';

async function loadManifest() {
  const res = await fetch(`${BASE}/api/groups/campaign/${SLUG}/media/manifest?t=${Date.now()}`);
  if (!res.ok) throw new Error(`Manifest load failed: ${res.status}`);
  return res.json();
}

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

async function forceRegenerateDesignedAds() {
  const res = await fetch(`${BASE}/api/groups/campaign/${SLUG}/media/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assetTypes: ['designed_ad_artifact', 'documentary_detail_image'],
      forceRegenerateAssetTypes: ['designed_ad_artifact', 'documentary_detail_image'],
    }),
  });
  return { status: res.status, data: await res.json() };
}

async function main() {
  console.log('Loading manifest...');
  const manifest = await loadManifest();

  const heroes = manifest.images.hero || [];
  const concepts = manifest.images.aestheticConcepts || [];
  const designedAds = manifest.images.designedAdArtifacts || [];
  const documentaryDetails = manifest.images.documentaryDetails || [];

  console.log(`Found: ${heroes.length} heroes, ${concepts.length} concepts, ${designedAds.length} designed ads, ${documentaryDetails.length} documentary details`);

  const results = {
    heroes: [],
    concepts: [],
    designedAds: null,
  };

  // Regenerate heroes with diverse group instruction
  for (const hero of heroes) {
    console.log(`Regenerating hero: ${hero.assetId}`);
    const r = await regenerateAsset(hero.assetId,
      'Show a diverse group of 4-6 people of varying ages, ethnicities, and body types engaging in wellness activities together on the ship deck. Include yoga, stretching, and mindful movement. Make it clearly a group event, not a couple.'
    );
    results.heroes.push({ assetId: hero.assetId, ...r });
    console.log(`  -> status=${r.status}`);
  }

  // Regenerate concepts with diverse group instruction
  for (const concept of concepts) {
    console.log(`Regenerating concept: ${concept.assetId}`);
    const r = await regenerateAsset(concept.assetId,
      'Depict a diverse group of people doing wellness and nature activities together. Show 4-6 individuals of different ages, ethnicities, and body types practicing yoga, meditation, or mindful movement on deck. This must look like an inclusive group gathering, not a couples retreat.'
    );
    results.concepts.push({ assetId: concept.assetId, ...r });
    console.log(`  -> status=${r.status}`);
  }

  // Force regenerate designed ads
  console.log('Force regenerating designed ads...');
  results.designedAds = await forceRegenerateDesignedAds();
  console.log(`  -> status=${results.designedAds.status}`);

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
