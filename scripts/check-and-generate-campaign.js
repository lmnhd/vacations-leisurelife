const fs = require('fs');
const path = require('path');

const OUT_FILE = path.join(__dirname, 'campaign-check-result.json');
const SLUG = 'wellness-and-nature-cruise';

async function main() {
  try {
    // Step 1: Check if campaign exists
    const checkRes = await fetch('http://localhost:3000/api/groups/discovery?load=true');
    const checkData = await checkRes.json();
    const existing = checkData.campaigns?.find(c => c.id === SLUG);

    if (existing) {
      fs.writeFileSync(OUT_FILE, JSON.stringify({ exists: true, campaign: existing }, null, 2));
      console.log('EXISTS:', existing.id, 'status=', existing.pricingStatus);
      return;
    }

    // Step 2: Generate the campaign
    console.log('Campaign not found, generating...');
    const genRes = await fetch('http://localhost:3000/api/groups/discovery/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs: [SLUG] }),
    });
    const genData = await genRes.json();
    fs.writeFileSync(OUT_FILE, JSON.stringify({ exists: false, generated: genData }, null, 2));
    console.log('GENERATED:', JSON.stringify(genData, null, 2));
  } catch (err) {
    fs.writeFileSync(OUT_FILE, JSON.stringify({ error: err.message }, null, 2));
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}

main();
