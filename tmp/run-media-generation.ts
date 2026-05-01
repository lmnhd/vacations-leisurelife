import { loadEnvConfig } from '@next/env';
import { runMediaGeneration } from '../lib/campaigns/media/media-orchestrator';

loadEnvConfig(process.cwd());

async function main() {
  try {
    const result = await runMediaGeneration('board-games-at-sea', {});
    console.log(JSON.stringify({
      message: `Media generation ${result.manifest.completionStatus} for board-games-at-sea`,
      slug: result.slug,
      totalAssets: result.manifest.totalAssets,
      completionStatus: result.manifest.completionStatus,
      jobSummary: result.jobSummary,
    }, null, 2));
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
