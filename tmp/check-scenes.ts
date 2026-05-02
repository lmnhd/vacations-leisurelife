import { getMediaManifest } from '../lib/campaigns/media/media-store';

async function main() {
  const m = await getMediaManifest('board-games-at-sea');
  console.log('=== SCENE IMAGES ===');
  console.log('Count:', m?.images?.sceneImages?.length ?? 0);
  m?.images?.sceneImages?.forEach((s: any, i: number) => {
    console.log(`Scene ${i+1}: ${s.assetId}`);
    console.log(`  Prompt: ${s.prompt?.substring(0, 150) ?? 'N/A'}...`);
  });
}

main().catch(console.error);
