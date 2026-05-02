import { loadEnvConfig } from '@next/env';
import { runMediaGeneration } from '../lib/campaigns/media/media-orchestrator';

loadEnvConfig(process.cwd());

async function main() {
  try {
    const result = await runMediaGeneration('board-games-at-sea', {
      assetTypes: [
        'theme_music',
        'ambient_narration',
        'hype_clip',
        'tiktok_seed_video',
        'hero_explainer_video',
        'threshold_video',
        'countdown_video',
        'broll_clip',
      ],
    });
    console.log(JSON.stringify({
      message: `Media generation ${result.manifest.completionStatus} for board-games-at-sea`,
      slug: result.slug,
      totalAssets: result.manifest.totalAssets,
      completionStatus: result.manifest.completionStatus,
      jobSummary: result.jobSummary,
      videos: {
        tiktokSeed: result.manifest.videos.tiktokSeed?.assetId ?? null,
        heroExplainer: result.manifest.videos.heroExplainer?.assetId ?? null,
        threshold: result.manifest.videos.thresholdAnnouncement?.assetId ?? null,
        countdownCount: result.manifest.videos.countdown.length,
        brollCount: result.manifest.videos.broll.length,
      },
      audio: {
        ambientNarration: result.manifest.audio.ambientNarration?.assetId ?? null,
        hypeClip: result.manifest.audio.hypeClip?.assetId ?? null,
        themeMusic: result.manifest.audio.themeMusic?.assetId ?? null,
      },
    }, null, 2));
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
