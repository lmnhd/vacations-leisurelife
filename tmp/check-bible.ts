import { loadEnvConfig } from '@next/env';
import { getAestheticBrief } from '../lib/campaigns/campaign-store';

loadEnvConfig(process.cwd());

async function main() {
  const brief = await getAestheticBrief('board-games-at-sea');
  console.log('Production bible:', brief?.productionBible ? 'EXISTS' : 'MISSING');
  console.log('Scene library count:', brief?.productionBible?.sceneLibrary?.length ?? 0);
  console.log('Storyboards count:', brief?.productionBible?.storyboards?.length ?? 0);
  console.log('Storyboard IDs:', JSON.stringify(brief?.productionBible?.storyboards?.map((s: { deliverableId: string }) => s.deliverableId) ?? []));
}

main().catch(console.error);
