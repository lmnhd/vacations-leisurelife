import { loadEnvConfig } from '@next/env';
import { getMediaManifest, saveMediaManifest } from '../lib/campaigns/media/media-store';

loadEnvConfig(process.cwd());

const slug = 'board-games-at-sea';

async function main() {
  console.log('=== ENV CHECK ===');
  console.log('MEDIA_VIDEO_PROVIDER:', process.env.MEDIA_VIDEO_PROVIDER ?? '(not set)');
  console.log('FAL_KEY present:', !!process.env.FAL_KEY);
  console.log('RUNWAYML_API_KEY present:', !!process.env.RUNWAYML_API_KEY);
  console.log('ELEVENLABS_API_KEY present:', !!process.env.ELEVENLABS_API_KEY);

  const manifest = await getMediaManifest(slug);
  if (!manifest) {
    console.log('No manifest found.');
    return;
  }

  console.log('\n=== BEFORE CLEANUP ===');
  console.log('tiktokSeed:', manifest.videos.tiktokSeed?.assetId ?? 'null');
  console.log('heroExplainer:', manifest.videos.heroExplainer?.assetId ?? 'null');
  console.log('thresholdAnnouncement:', manifest.videos.thresholdAnnouncement?.assetId ?? 'null');
  console.log('countdown:', manifest.videos.countdown.length);
  console.log('broll:', manifest.videos.broll.length);

  // Clear all video records
  const cleaned = {
    ...manifest,
    videos: {
      ...manifest.videos,
      tiktokSeed: null,
      heroExplainer: null,
      thresholdAnnouncement: null,
      countdown: [],
      broll: [],
    },
  };

  await saveMediaManifest(cleaned);

  const after = await getMediaManifest(slug);
  console.log('\n=== AFTER CLEANUP ===');
  console.log('tiktokSeed:', after?.videos.tiktokSeed?.assetId ?? 'null');
  console.log('heroExplainer:', after?.videos.heroExplainer?.assetId ?? 'null');
  console.log('thresholdAnnouncement:', after?.videos.thresholdAnnouncement?.assetId ?? 'null');
  console.log('countdown:', after?.videos.countdown.length);
  console.log('broll:', after?.videos.broll.length);
}

main().catch(console.error);
