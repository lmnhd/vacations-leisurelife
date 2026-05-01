import { getCampaignBlueprint, saveCampaignBlueprint } from '../lib/campaigns/campaign-store';

async function main() {
  const campaign = await getCampaignBlueprint('board-games-at-sea');
  if (!campaign) {
    console.error('Campaign not found');
    process.exit(1);
  }

  // Strengthen anchor signals with concrete visual/tactile specifics
  campaign.allowedThemeSignals = [
    'colorful wooden meeples scattered across a teak table beside a coffee cup',
    'leather dice tray on a bar rail with amber backlighting',
    'illustrated game box spines lined up on a café shelf near porthole windows',
    'linen playmat rolled halfway out on a deck chair armrest',
    'ceramic tile coasters with hexagonal patterns stacked near a board',
    'worn card sleeves fanned open showing painted fantasy artwork',
  ];

  campaign.cruiseNativeMoments = [
    'a half-finished Azul mosaic game on a round teak table with morning light through a lounge window, coffee cups and pastries beside the board',
    'two guests leaning over a dice tray on a bar rail at sunset, ship railing and ocean blur behind them',
    'a colorful game box propped open on a pool chair armrest, dice drying on a striped towel, ship deck planks visible',
    'a linen playmat unrolled on a café table with a pitcher of iced tea, card sleeves mid-shuffle, no host required',
    'a small group around a corner table in the atrium, game components spread across a navy tablecloth, chandelier light catching plastic gems',
  ];

  campaign.optionalGatheringMoments = [
    'a café table with a rotating library of open games, chips and drinks already poured, guests pulling up chairs as they pass by',
    'an aft deck railing at golden hour with a travel-sized game laid out on a folded jacket, two people laughing over dice rolls',
    'a quiet lounge corner with a single two-player game set up on a side table, a "join if you like" card standing in a card holder',
    'a breakfast table with a puzzle-piece-shaped cereal bowl and a small strategy game being played between coffee refills',
  ];

  campaign.targetingKeywords = [
    'wooden meeples on ship deck',
    'dice tray sunset ocean',
    'tabletop game cruise lounge',
    'card sleeves fantasy art café',
    'Azul tiles morning light porthole',
  ];

  campaign.nicheExpressionMode =
    'Gaming happens where cruising already happens — at café tables, on deck chairs, in lounge corners. The props are visible: colorful boxes on shelves, dice trays on bar rails, half-finished games left on tables with a "join us" card. A guest who ignores all of it still sees a normal cruise. A guest who cares notices the community immediately.';

  campaign.highlightEvents = [
    'open-library evening in the lounge: three tables with different games in progress, walk-up welcome, no host needed',
    'sail-away dice challenge on the aft deck: quick ten-minute games against the sunset railing',
    'midnight strategy session in the café: one long game, hot chocolate, quiet ship hum through the windows',
    'port-day travel game demo: a small box opened on a excursion-bus seat, teaching a two-player game during the ride',
  ];

  campaign.aesthetic =
    'warm analog textures against cool ocean light: wood grain, linen, ceramic, painted cardboard, leather trays, amber bar glow, morning porthole sun, deck-plank shadows, teal water blur behind every scene';

  campaign.updatedAt = new Date().toISOString();

  await saveCampaignBlueprint(campaign);
  console.log('Campaign patched successfully');
  console.log(JSON.stringify(campaign, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
