import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function main() {
  const key = process.env.FAL_KEY;
  console.log('FAL_KEY exists:', !!key);

  // Test a simple queue submission to see if Fal responds
  try {
    const res = await fetch('https://queue.fal.run/fal-ai/kling-video/o3/standard/image-to-video', {
      method: 'POST',
      headers: {
        Authorization: `Key ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'test',
        image_url: 'https://via.placeholder.com/512x512.png',
        duration: '5',
        generate_audio: false,
      }),
    });
    console.log('Submit status:', res.status);
    const data = await res.json();
    console.log('Submit response:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.log('Submit error:', e instanceof Error ? e.message : String(e));
  }
}

main();
