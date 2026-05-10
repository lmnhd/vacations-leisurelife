const fs = require('fs');
const path = require('path');

const SLUG = 'wellness-and-nature-cruise';
const OUT = path.join(__dirname, 'regen-ads-output.json');

async function main() {
  console.log('Triggering designed ad regeneration...');
  const res = await fetch(`http://localhost:3000/api/groups/campaign/${SLUG}/media/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assetTypes: ['designed_ad_artifact', 'documentary_detail_image'],
      forceRegenerateAssetTypes: ['designed_ad_artifact', 'documentary_detail_image'],
    }),
  });
  const data = await res.json();
  fs.writeFileSync(OUT, JSON.stringify({ status: res.status, data }, null, 2), 'utf8');
  console.log('Response saved to', OUT);
}

main().catch(err => {
  fs.writeFileSync(OUT, JSON.stringify({ error: err.message }, null, 2), 'utf8');
  console.error('Error:', err.message);
  process.exit(1);
});
