const SLUG = 'wellness-and-nature-cruise';

async function main() {
  const res = await fetch(`http://localhost:3000/api/groups/campaign/${SLUG}/media/manifest?t=${Date.now()}`);
  const m = await res.json();

  console.log('HEROES:');
  for (const h of m.images.hero || []) {
    console.log(`  ${h.assetId} v${h.version} ${h.reviewStatus}`);
  }
  console.log('CONCEPTS:');
  for (const c of m.images.aestheticConcepts || []) {
    console.log(`  ${c.assetId} v${c.version} ${c.reviewStatus}`);
  }
  console.log('ADS:');
  for (const a of m.images.designedAdArtifacts || []) {
    console.log(`  ${a.assetId} v${a.version} ${a.reviewStatus}`);
  }
  console.log('DOCS:');
  for (const d of m.images.documentaryDetails || []) {
    console.log(`  ${d.assetId} v${d.version} ${d.reviewStatus}`);
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
