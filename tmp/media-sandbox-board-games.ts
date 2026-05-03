import { loadEnvConfig } from '@next/env';
import { writeFile } from 'fs/promises';
import path from 'path';
import { getAestheticBrief } from '../lib/campaigns/campaign-store';
import { getMediaManifest } from '../lib/campaigns/media/media-store';
import { generateStaticPackageStoryboardVideo } from '../lib/campaigns/media/generators/tiktok-seed-generator';

loadEnvConfig(process.cwd());

const CAMPAIGN_SLUG = 'board-games-at-sea';
const OUTPUT_FILE = path.join(process.cwd(), 'tmp', `${CAMPAIGN_SLUG}-sandbox-tiktok.mp4`);

function extractSceneIdFromAsset(asset: { assetId: string; tags?: string[] }): string | null {
  if (Array.isArray(asset.tags)) {
    const sceneTag = asset.tags.find((tag) => tag !== 'scene' && tag !== 'scene_image');
    if (sceneTag) {
      return sceneTag;
    }
  }

  const sceneMatch = asset.assetId.match(/^img_scene_(.+?)(?:_\d+)?$/);
  if (sceneMatch) {
    return sceneMatch[1];
  }

  return null;
}

function buildSceneImageMap(manifest: { images?: { sceneImages?: Array<{ assetId: string; url: string; tags?: string[] }> } }): Map<string, string> {
  const sceneImageMap = new Map<string, string>();
  const sceneImages = manifest.images?.sceneImages ?? [];

  for (const asset of sceneImages) {
    const sceneId = extractSceneIdFromAsset(asset);
    if (sceneId) {
      if (!sceneImageMap.has(sceneId)) {
        sceneImageMap.set(sceneId, asset.url);
      }
    }
  }

  return sceneImageMap;
}

async function main() {
  const brief = await getAestheticBrief(CAMPAIGN_SLUG);
  if (!brief) {
    throw new Error(`Aesthetic brief not found for campaign: ${CAMPAIGN_SLUG}`);
  }

  const manifest = await getMediaManifest(CAMPAIGN_SLUG);
  if (!manifest) {
    throw new Error(`Media manifest not found for campaign: ${CAMPAIGN_SLUG}`);
  }

  const storyboard = brief.productionBible?.storyboards?.find((sb) => sb.deliverableId === 'tiktok_seed');
  if (!storyboard) {
    throw new Error(`No tiktok_seed storyboard found in campaign production bible for ${CAMPAIGN_SLUG}`);
  }

  const sceneImageMap = buildSceneImageMap(manifest);
  const missingSceneIds = storyboard.shotSequence
    .map((shot) => shot.sceneId)
    .filter((sceneId) => !sceneImageMap.has(sceneId));

  if (missingSceneIds.length > 0) {
    console.warn('Missing scene images for the following sceneIds:', missingSceneIds);
    console.warn('Available scene image keys:', Array.from(sceneImageMap.keys()).sort().join(', '));
    throw new Error('Sandbox cannot run because the production-bible scene imagery is missing from the media manifest.');
  }

  console.log('Using storyboard:', storyboard.deliverableId);
  console.log('Scene image map keys:', Array.from(sceneImageMap.keys()));

  let result = await generateStaticPackageStoryboardVideo(brief, storyboard, sceneImageMap);
  const assetId = `vid_${storyboard.deliverableId}_${Date.now().toString(36)}`;
  const deliverableId = storyboard.deliverableId;

  await writeFile(OUTPUT_FILE, result.buffer);

  console.log('Sandbox video rendered successfully:');
  console.log(`  file: ${OUTPUT_FILE}`);
  console.log(`  durationSeconds: ${result.durationSeconds}`);
  console.log(`  assetId: ${assetId}`);
  console.log(`  deliverableId: ${deliverableId}`);
  console.log(`  script length: ${result.script.length}`);
  console.log(`  motionPrompt length: ${result.motionPrompt.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
