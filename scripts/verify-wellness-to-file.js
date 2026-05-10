const fs = require('fs');
const path = require('path');

const SLUG = 'wellness-and-nature-cruise';
const OUT = path.join(__dirname, 'verify-wellness-output.json');

async function main() {
  try {
    const res = await fetch(`http://localhost:3000/api/groups/campaign/${SLUG}/media/manifest?t=${Date.now()}`);
    if (!res.ok) throw new Error(`Manifest load failed: ${res.status}`);
    const manifest = await res.json();

    const result = {
      totalAssets: manifest.totalAssets,
      completionStatus: manifest.completionStatus,
      generatedAt: manifest.generatedAt,
      heroes: (manifest.images.hero || []).map(h => ({
        assetId: h.assetId,
        version: h.version,
        reviewStatus: h.reviewStatus,
        generator: h.generator,
        promptUsed: h.promptUsed?.substring(0, 200),
      })),
      concepts: (manifest.images.aestheticConcepts || []).map(c => ({
        assetId: c.assetId,
        version: c.version,
        reviewStatus: c.reviewStatus,
        generator: c.generator,
        promptUsed: c.promptUsed?.substring(0, 200),
      })),
      designedAds: (manifest.images.designedAdArtifacts || []).map(d => ({
        assetId: d.assetId,
        version: d.version,
        reviewStatus: d.reviewStatus,
        generator: d.generator,
        tags: d.tags,
        promptUsed: d.promptUsed?.substring(0, 200),
      })),
      documentaryDetails: (manifest.images.documentaryDetails || []).map(d => ({
        assetId: d.assetId,
        version: d.version,
        reviewStatus: d.reviewStatus,
        generator: d.generator,
        promptUsed: d.promptUsed?.substring(0, 200),
      })),
    };

    fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');
    console.log('Verification saved to', OUT);
  } catch (err) {
    fs.writeFileSync(OUT, JSON.stringify({ error: err.message }, null, 2), 'utf8');
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
