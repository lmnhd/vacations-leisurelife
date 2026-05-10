const fs = require('fs');
const path = require('path');

const SLUG = 'wellness-and-nature-cruise';
const OUT = path.join(__dirname, 'brief-poll-result.json');
const LOG = path.join(__dirname, 'brief-poll.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  fs.writeFileSync(LOG, ''); // clear log
  
  try {
    // Step 1: Trigger brief generation
    log('Triggering brief generation...');
    const postRes = await fetch(`http://localhost:3000/api/groups/campaign/${SLUG}/brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const postData = await postRes.json();
    log(`POST status: ${postRes.status}, jobId: ${postData.jobId}, status: ${postData.status}`);
    
    if (!postData.jobId) {
      fs.writeFileSync(OUT, JSON.stringify({ error: 'No jobId returned', data: postData }, null, 2));
      log('ERROR: No jobId returned');
      return;
    }
    
    // Step 2: Poll for completion
    const jobId = postData.jobId;
    const maxPolls = 60; // ~5 minutes at 5s intervals
    
    for (let i = 0; i < maxPolls; i++) {
      await sleep(5000);
      
      const getRes = await fetch(`http://localhost:3000/api/groups/campaign/${SLUG}/brief?jobId=${jobId}`);
      const getData = await getRes.json();
      
      log(`Poll ${i+1}: status=${getData.status}, steps=${getData.steps?.length || 0}`);
      
      if (getData.status === 'completed' || getData.status === 'failed') {
        fs.writeFileSync(OUT, JSON.stringify({ done: true, job: getData }, null, 2));
        log(`FINAL: ${getData.status}`);
        if (getData.summary) log(`Summary: ${JSON.stringify(getData.summary)}`);
        return;
      }
    }
    
    log('TIMEOUT: Max polls reached');
    fs.writeFileSync(OUT, JSON.stringify({ error: 'Timeout', jobId }, null, 2));
    
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`ERROR: ${msg}`);
    fs.writeFileSync(OUT, JSON.stringify({ error: msg }, null, 2));
    process.exit(1);
  }
}

main();
