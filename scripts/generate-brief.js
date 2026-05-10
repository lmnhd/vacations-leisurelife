const fs = require('fs');
const path = require('path');

const SLUG = 'wellness-and-nature-cruise';
const OUT = path.join(__dirname, 'brief-generation-result.json');

async function main() {
  try {
    // Step 1: Fetch current campaign details
    console.log('Fetching campaign details...');
    const campaignRes = await fetch(`http://localhost:3000/api/groups/campaign/${SLUG}`);
    const campaignData = await campaignRes.json();
    fs.writeFileSync(path.join(__dirname, 'campaign-details.json'), JSON.stringify(campaignData, null, 2));
    console.log('Campaign:', campaignData.campaign?.name, '| briefStatus=', campaignData.campaign?.aestheticBriefStatus);

    // Step 2: Trigger brief generation
    console.log('Triggering brief generation...');
    const briefRes = await fetch(`http://localhost:3000/api/groups/campaign/${SLUG}/brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'create_or_refresh_brief' }),
    });
    const briefData = await briefRes.json();
    fs.writeFileSync(OUT, JSON.stringify({ step: 'generation', data: briefData }, null, 2));
    console.log('Brief generation result:', JSON.stringify(briefData, null, 2));

    if (briefData.success) {
      // Step 3: Check readiness
      console.log('Checking readiness...');
      const readyRes = await fetch(`http://localhost:3000/api/groups/campaign/${SLUG}/brief/readiness`);
      const readyData = await readyRes.json();
      fs.writeFileSync(OUT, JSON.stringify({ step: 'readiness', data: readyData }, null, 2));
      console.log('Readiness:', JSON.stringify(readyData, null, 2));
    }
  } catch (err) {
    fs.writeFileSync(OUT, JSON.stringify({ error: err.message, stack: err.stack }, null, 2));
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}

main();
