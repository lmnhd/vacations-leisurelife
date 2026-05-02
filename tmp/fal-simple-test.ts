import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const FAL_KEY = process.env.FAL_KEY;
const IMAGE_URL = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=512&h=512';
const PROMPT = 'gentle ocean waves';
const ENDPOINT = 'fal-ai/kling-video/o3/standard/image-to-video';

async function test() {
  console.log('FAL_KEY present:', !!FAL_KEY);
  console.log('Submitting to Fal at', new Date().toISOString());

  const submitRes = await fetch(`https://queue.fal.run/${ENDPOINT}`, {
    method: 'POST',
    headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: PROMPT, image_url: IMAGE_URL, duration: '5', generate_audio: false }),
  });
  console.log('Submit status:', submitRes.status);
  const submit = await submitRes.json();
  console.log('Submit body:', JSON.stringify(submit));

  if (!submit.request_id) {
    console.error('No request_id');
    return;
  }

  const statusUrl = `https://queue.fal.run/${ENDPOINT}/requests/${submit.request_id}/status?logs=1`;
  const responseUrl = `https://queue.fal.run/${ENDPOINT}/requests/${submit.request_id}`;

  const start = Date.now();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    const statusRes = await fetch(statusUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
    const status = await statusRes.json();
    console.log(`[${elapsed}s] status=${status.status} queue=${status.queue_position ?? 'N/A'}`);
    if (status.status === 'COMPLETED') {
      const resultRes = await fetch(responseUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
      const result = await resultRes.json();
      console.log('Result keys:', Object.keys(result));
      if (result.video?.url) {
        console.log('SUCCESS - video URL:', result.video.url.slice(0, 80));
      } else {
        console.log('COMPLETED but no video URL. Full result:', JSON.stringify(result).slice(0, 500));
      }
      return;
    }
    if (status.status === 'FAILED' || status.error) {
      console.error('FAILED:', status.error);
      return;
    }
  }
  console.error('TIMEOUT after 60 polls (10 minutes)');
}

test().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
