const fs = require('fs');
const path = require('path');

const SLUG = 'wellness-and-nature-cruise';
const OUT = path.join(__dirname, 'check-manifest-output.json');

async function main() {
  const res = await fetch(`http://localhost:3000/api/groups/campaign/${SLUG}/media/manifest?t=${Date.now()}`);
  const m = await res.json();

  const summary = {
    totalAssets: m.totalAssets,
    completionStatus: m.completionStatus,
    generatedAt: m.generatedAt,
    heroes: (m.images.hero || []).map(h => ({ id: h.assetId, v: h.version, status: h.reviewStatus, gen: h.generator })),
    concepts: (m.images.aestheticConcepts || []).map(c => ({ id: c.assetId, v: c.version, status: c.reviewStatus, gen: c.generator })),
    ads: (m.images.designedAdArtifacts || []).map(d => ({ id: d.assetId, v: d.version, status: d.reviewStatus, gen: d.generator })),
    docs: (m.images.documentaryDetails || []).map(d => ({ id: d.assetId, v: d.version, status: d.reviewStatus, gen: d.generator })),
  };

  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2), 'utf8');
  console.log('Summary saved to', OUT);
  console.log('Heroes:', summary.heroes.map(h => `${h.id}(v${h.v})`).join(', '));
  console.log('Concepts:', summary.concepts.map(c => `${c.id}(v${c.v})`).join(', '));
  console.log('Ads:', summary.ads.map(a => `${a.id}(v${a.v})`).join(', '));
  console.log('Docs:', summary.docs.map(d => `${d.id}(v${d.v})`).join(', '));
}

main().catch(err => {
  fs.writeFileSync(OUT, JSON.stringify({ error: err.message }, null, 2), 'utf8');
  console.error('Error:', err.message);
  process.exit(1);
});
