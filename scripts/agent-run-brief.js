const fs = require('fs');
const path = require('path');

const SLUG = 'wellness-and-nature-cruise';
const OUT = path.join(__dirname, 'agent-run-brief-output.json');

async function main() {
  try {
    // Trigger brief generation
    const postRes = await fetch(`http://localhost:3000/api/groups/campaign/${SLUG}/brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const postData = await postRes.json();
    
    // Write initial response
    fs.writeFileSync(OUT, JSON.stringify({
      step: 'triggered',
      status: postRes.status,
      data: postData,
      time: new Date().toISOString(),
    }, null, 2));
    
    if (!postData.jobId) {
      console.log('NO_JOB_ID');
      process.exit(1);
    }
    
    console.log('JOB_ID:', postData.jobId);
    
    // Poll for completion
    const jobId = postData.jobId;
    let lastData = null;
    
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));
      
      const pollRes = await fetch(`http://localhost:3000/api/groups/campaign/${SLUG}/brief?jobId=${jobId}`);
      const pollData = await pollRes.json();
      lastData = pollData;
      
      fs.writeFileSync(OUT, JSON.stringify({
        step: 'polling',
        poll: i + 1,
        status: pollData.status,
        data: pollData,
        time: new Date().toISOString(),
      }, null, 2));
      
      if (pollData.status === 'completed' || pollData.status === 'failed') {
        fs.writeFileSync(OUT, JSON.stringify({
          step: 'done',
          status: pollData.status,
          data: pollData,
          time: new Date().toISOString(),
        }, null, 2));
        console.log('DONE:', pollData.status);
        process.exit(0);
      }
    }
    
    fs.writeFileSync(OUT, JSON.stringify({
      step: 'timeout',
      lastData,
      time: new Date().toISOString(),
    }, null, 2));
    console.log('TIMEOUT');
    process.exit(1);
    
  } catch (err) {
    fs.writeFileSync(OUT, JSON.stringify({
      step: 'error',
      error: err.message,
      stack: err.stack,
      time: new Date().toISOString(),
    }, null, 2));
    console.log('ERROR:', err.message);
    process.exit(1);
  }
}

main();
