import { loadEnvConfig } from '@next/env';
import { getMediaManifest } from '../lib/campaigns/media/media-store';

loadEnvConfig(process.cwd());

async function main() {
  const m = await getMediaManifest('board-games-at-sea');
  console.log('Total assets:', m?.totalAssets ?? 0);
  console.log('Videos:', JSON.stringify({
    tiktokSeed: m?.videos?.tiktokSeed?.assetId ?? null,
    heroExplainer: m?.videos?.heroExplainer?.assetId ?? null,
    threshold: m?.videos?.thresholdAnnouncement?.assetId ?? null,
    countdown: m?.videos?.countdown?.length ?? 0,
    broll: m?.videos?.broll?.length ?? 0,
  }, null, 2));
  console.log('Audio:', JSON.stringify({
    ambientNarration: m?.audio?.ambientNarration?.assetId ?? null,
    hypeClip: m?.audio?.hypeClip?.assetId ?? null,
    themeMusic: m?.audio?.themeMusic?.assetId ?? null,
  }, null, 2));
}

main().catch(console.error);
