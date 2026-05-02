import { getMediaManifest } from '../lib/campaigns/media/media-store';

async function main() {
  const m = await getMediaManifest('board-games-at-sea');
  console.log('tiktokSeed:', m?.videos?.tiktokSeed?.assetId ?? 'null');
  console.log('heroExplainer:', m?.videos?.heroExplainer?.assetId ?? 'null');
  console.log('threshold:', m?.videos?.thresholdAnnouncement?.assetId ?? 'null');
  console.log('countdown:', m?.videos?.countdown?.length ?? 0);
  console.log('generatedAt:', m?.generatedAt ?? 'N/A');
}

main().catch(console.error);
