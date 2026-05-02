import { loadEnvConfig } from '@next/env';
import { getAestheticBrief } from '../lib/campaigns/campaign-store';
import { getMediaManifest } from '../lib/campaigns/media/media-store';

loadEnvConfig(process.cwd());

async function main() {
  const brief = await getAestheticBrief('board-games-at-sea');
  const manifest = await getMediaManifest('board-games-at-sea');

  console.log('=== PRODUCTION BIBLE ===');
  console.log('hasProductionBible:', !!brief?.productionBible);
  console.log('sceneLibrary count:', brief?.productionBible?.sceneLibrary?.length ?? 0);
  console.log('storyboards count:', brief?.productionBible?.storyboards?.length ?? 0);
  if (brief?.productionBible?.storyboards) {
    for (const sb of brief.productionBible.storyboards) {
      console.log(`  storyboard ${sb.deliverableId}: shots=${sb.shotSequence?.length ?? 0}, duration=${sb.totalDurationSeconds ?? 'N/A'}`);
    }
  }

  console.log('=== SCENE IMAGES IN MANIFEST ===');
  console.log('sceneImages count:', manifest?.images?.sceneImages?.length ?? 0);
  if (manifest?.images?.sceneImages?.length > 0) {
    manifest.images.sceneImages.slice(0, 3).forEach((img: { assetId: string; tags?: string[] }, i: number) => {
      console.log(`  scene ${i}: ${img.assetId}, tags=[${img.tags?.join(', ')}]`);
    });
  }

  console.log('=== VIDEO RECORDS ===');
  console.log('tiktokSeed:', manifest?.videos?.tiktokSeed?.assetId ?? 'null');
  console.log('heroExplainer:', manifest?.videos?.heroExplainer?.assetId ?? 'null');
  console.log('threshold:', manifest?.videos?.thresholdAnnouncement?.assetId ?? 'null');
  console.log('countdown:', manifest?.videos?.countdown?.length ?? 0);
  console.log('broll:', manifest?.videos?.broll?.length ?? 0);
}

main().catch(console.error);
