import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { getReadiness } from '../lib/campaigns/brief-engine/orchestrator';
import { getCampaignMediaManifest } from '../lib/campaigns/media/media-orchestrator';

async function main() {
  const slug = 'board-games-at-sea';

  // Brief readiness
  const readiness = await getReadiness(slug);
  console.log('=== BRIEF READINESS ===');
  console.log(JSON.stringify({
    readiness: readiness.readiness,
    blockerCount: readiness.blockerCount,
    warningCount: readiness.warningCount,
    humanReviewStatus: readiness.brief?.humanReviewStatus,
    generatedAt: readiness.brief?.generatedAt,
  }, null, 2));

  // Media manifest
  const manifest = await getCampaignMediaManifest(slug);
  console.log('\n=== MEDIA MANIFEST ===');
  console.log(JSON.stringify({
    completionStatus: manifest?.completionStatus,
    totalAssets: manifest?.totalAssets,
    images: {
      heroes: manifest?.images?.heroes?.length ?? 0,
      concepts: manifest?.images?.concepts?.length ?? 0,
      scenes: manifest?.images?.scenes?.length ?? 0,
      shipReferences: manifest?.images?.shipReferences?.length ?? 0,
      designedAdArtifacts: manifest?.images?.designedAdArtifacts?.length ?? 0,
      documentaryDetails: manifest?.images?.documentaryDetails?.length ?? 0,
    },
    videos: manifest?.videos?.length ?? 0,
    audio: manifest?.audio?.length ?? 0,
  }, null, 2));
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
