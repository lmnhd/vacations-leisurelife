const fs = require('fs');
const path = require('path');

const SLUG = 'wellness-and-nature-cruise';
const OUT = path.join(__dirname, 'start-brief-result.json');

async function main() {
  try {
    const res = await fetch(`http://localhost:3000/api/groups/campaign/${SLUG}/brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    fs.writeFileSync(OUT, JSON.stringify({ status: res.status, data }, null, 2));
  } catch (err) {
    fs.writeFileSync(OUT, JSON.stringify({ error: err.message }, null, 2));
    process.exit(1);
  }
}

main();
