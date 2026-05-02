import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function main() {
  const key = process.env.RUNWAYML_API_KEY;
  console.log('Key exists:', !!key);

  try {
    const res = await fetch('https://api.dev.runwayml.com/v1/organization', {
      headers: {
        Authorization: `Bearer ${key}`,
        'X-Runway-Version': '2024-11-06',
      },
    });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response:', text.slice(0, 500));
  } catch (e) {
    console.log('Error:', e instanceof Error ? e.message : String(e));
  }
}

main();
