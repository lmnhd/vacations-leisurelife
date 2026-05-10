const fs = require('fs');
const path = require('path');

const SLUG = 'wellness-and-nature-cruise';
const OUT = path.join(__dirname, 'brief-readiness.json');

async function main() {
  try {
    const res = await fetch(`http://localhost:3000/api/groups/campaign/${SLUG}/brief/readiness`);
    const data = await res.json();
    fs.writeFileSync(OUT, JSON.stringify({ status: res.status, data }, null, 2));
    console.log('Status:', res.status);
    console.log('Has brief:', !!data.brief);
    console.log('Readiness:', data.readiness?.state);
    console.log('Blockers:', data.readiness?.blockers?.length || 0);
  } catch (err) {
    fs.writeFileSync(OUT, JSON.stringify({ error: err.message }, null, 2));
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}

main();
