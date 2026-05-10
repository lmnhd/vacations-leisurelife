const SLUG = 'wellness-and-nature-cruise';

async function main() {
  const res = await fetch(`http://localhost:3000/api/groups/campaign/${SLUG}/media/manifest?t=${Date.now()}`);
  if (!res.ok) throw new Error(`Manifest load failed: ${res.status}`);
  const manifest = await res.json();

  console.log('=== MANIFEST SUMMARY ===');
  console.log(`Total assets: ${manifest.totalAssets}`);
  console.log(`Completion: ${manifest.completionStatus}`);
  console.log(`Generated at: ${manifest.generatedAt}`);

  console.log('\n=== HERO IMAGES ===');
  for (const h of manifest.images.hero || []) {
    console.log(`  ${h.assetId} | v${h.version} | ${h.reviewStatus} | ${h.generator}`);
    console.log(`    Prompt: ${h.promptUsed?.substring(0, 120)}...`);
  }

  console.log('\n=== AESTHETIC CONCEPTS ===');
  for (const c of manifest.images.aestheticConcepts || []) {
    console.log(`  ${c.assetId} | v${c.version} | ${c.reviewStatus} | ${c.generator}`);
    console.log(`    Prompt: ${c.promptUsed?.substring(0, 120)}...`);
  }

  console.log('\n=== DESIGNED AD ARTIFACTS ===');
  for (const d of manifest.images.designedAdArtifacts || []) {
    console.log(`  ${d.assetId} | v${d.version} | ${d.reviewStatus} | ${d.generator}`);
    console.log(`    Tags: ${d.tags?.join(', ') || 'none'}`);
    if (d.promptUsed) {
      console.log(`    Prompt: ${d.promptUsed?.substring(0, 120)}...`);
    }
  }

  console.log('\n=== DOCUMENTARY DETAILS ===');
  for (const d of manifest.images.documentaryDetails || []) {
    console.log(`  ${d.assetId} | v${d.version} | ${d.reviewStatus} | ${d.generator}`);
    if (d.promptUsed) {
      console.log(`    Prompt: ${d.promptUsed?.substring(0, 120)}...`);
    }
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
