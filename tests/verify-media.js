const fs = require('fs');
const path = require('path');

const SLUG = 'wellness-and-nature-cruise';
const OUT = path.join(__dirname, 'verify-media-output.json');

async function main() {
  const res = await fetch(`http://localhost:3000/api/groups/campaign/${SLUG}/media/manifest?t=${Date.now()}`);
  const m = await res.json();

  const summary = {
    total: m.totalAssets,
    status: m.completionStatus,
    generatedAt: m.generatedAt,
    heroes: (m.images.hero || []).map(h => ({ id: h.assetId, v: h.version, status: h.reviewStatus, gen: h.generator })),
    concepts: (m.images.aestheticConcepts || []).map(c => ({ id: c.assetId, v: c.version, status: c.reviewStatus, gen: c.generator })),
    ads: (m.images.designedAdArtifacts || []).map(a => ({ id: a.assetId, v: a.version, status: a.reviewStatus, gen: a.generator })),
    docs: (m.images.documentaryDetails || []).map(d => ({ id: d.assetId, v: d.version, status: d.reviewStatus, gen: d.generator })),
  };

  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2), 'utf8');
  console.log('Saved to', OUT);
}

main().catch(err => {
  fs.writeFileSync(OUT, JSON.stringify({ error: err.message }, null, 2), 'utf8');
  console.error('Error:', err.message);
  process.exit(1);
});
