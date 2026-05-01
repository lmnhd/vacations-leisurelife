import { getAestheticBrief } from '../lib/campaigns/campaign-store';

async function main() {
  const brief = await getAestheticBrief('board-games-at-sea');
  if (!brief) {
    console.error('Brief not found');
    process.exit(1);
  }
  console.log(JSON.stringify(brief, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
