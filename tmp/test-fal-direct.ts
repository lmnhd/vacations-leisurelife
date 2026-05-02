import { loadEnvConfig } from '@next/env';
import { FalVideoProvider } from '../lib/campaigns/media/video-providers/fal-provider';

loadEnvConfig(process.cwd());

async function main() {
  const provider = new FalVideoProvider();
  const imageUrl = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1024&h=1024';
  const prompt = 'gentle ocean waves, cinematic camera drift, golden hour lighting';
  const start = Date.now();

  console.log(`[${new Date().toISOString()}] Starting Fal video generation test...`);
  console.log(`Image: ${imageUrl}`);
  console.log(`Prompt: ${prompt}`);

  try {
    const result = await provider.generateImageToVideo(imageUrl, prompt, 5);
    const elapsed = (Date.now() - start) / 1000;
    console.log(`[${new Date().toISOString()}] SUCCESS in ${elapsed.toFixed(1)}s`);
    console.log(`Video URL: ${result.videoUrl}`);
    console.log(`Duration: ${result.durationSeconds}s`);
    console.log(`Task ID: ${result.taskId}`);
  } catch (err) {
    const elapsed = (Date.now() - start) / 1000;
    console.error(`[${new Date().toISOString()}] FAILED after ${elapsed.toFixed(1)}s`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
