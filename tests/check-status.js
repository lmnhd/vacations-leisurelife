const fs = require('fs');
const path = require('path');

const SLUG = 'wellness-and-nature-cruise';
const OUT = path.join(__dirname, 'check-status-output.json');

async function main() {
  const results = {};

  // Check brief readiness
  try {
    const r = await fetch(`http://localhost:3000/api/groups/campaign/${SLUG}/brief/readiness`);
    results.briefReadiness = { status: r.status, data: await r.json() };
  } catch (e) {
    results.briefReadiness = { error: e.message };
  }

  // Check media manifest
  try {
    const r = await fetch(`http://localhost:3000/api/groups/campaign/${SLUG}/media/manifest?t=${Date.now()}`);
    const m = await r.json();
    results.manifest = {
      status: r.status,
      totalAssets: m.totalAssets,
      completionStatus: m.completionStatus,
      generatedAt: m.generatedAt,
      heroes: (m.images.hero || []).map(h => ({ id: h.assetId, v: h.version })),
      concepts: (m.images.aestheticConcepts || []).map(c => ({ id: c.assetId, v: c.version })),
      ads: (m.images.designedAdArtifacts || []).map(a => ({ id: a.assetId, v: a.version })),
      docs: (m.images.documentaryDetails || []).map(d => ({ id: d.assetId, v: d.version })),
    };
  } catch (e) {
    results.manifest = { error: e.message };
  }

  fs.writeFileSync(OUT, JSON.stringify(results, null, 2), 'utf8');
  console.log('Saved to', OUT);
}

main().catch(err => {
  fs.writeFileSync(OUT, JSON.stringify({ error: err.message }, null, 2), 'utf8');
  console.error('Error:', err.message);
  process.exit(1);
});
