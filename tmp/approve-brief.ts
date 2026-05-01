import { approveForMedia } from '../lib/campaigns/brief-engine/orchestrator';

async function main() {
  try {
    const result = await approveForMedia('board-games-at-sea');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
