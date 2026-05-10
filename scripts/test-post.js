const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'test-post-result.json');

async function main() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch('http://localhost:3000/api/groups/campaign/wellness-and-nature-cruise/brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    
    const data = await res.json();
    fs.writeFileSync(OUT, JSON.stringify({ status: res.status, data }, null, 2));
  } catch (err) {
    fs.writeFileSync(OUT, JSON.stringify({ error: err.message, type: err.name }, null, 2));
  }
}

main();
