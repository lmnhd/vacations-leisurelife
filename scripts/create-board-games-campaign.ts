import { saveCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { mapDiscoveryBlueprintToCampaign } from '@/lib/campaigns/discovery-schema';
import type { DiscoveryBlueprint } from '@/lib/campaigns/discovery-schema';
import { runDiscoveryRedTeamReview } from '@/lib/campaigns/discovery-red-team';

async function main() {
    // Pick a ship from the CB cache — Explorer of the Seas has great indoor spaces
    const shipTarget = 'Explorer of the Seas';
    const targetDestination = '7 Night Greek Isles Cruise';
    const targetDates = '2026-09-12'; // approximate, will be matched in Phase B

    const blueprint: DiscoveryBlueprint = {
        id: 'board-games-at-sea',
        name: 'Board Games at Sea',
        description: 'A cruise for tabletop enthusiasts who want to roll dice between ports. Sea days become campaign sessions, and the ship itself is the board.',
        aesthetic: 'Analog Warmth / Playful Collective',
        targetDates,
        targetDestination,
        shipTarget,
        highlightEvents: [
            'Open board game library in the card room every sea day afternoon',
            'Casual "learn-a-game" sessions at the pool deck lounge',
            'Late-night strategy tournaments with soft ship lighting',
            'Port-day quick-play meetups before excursion departures',
        ],
        targetingKeywords: [
            'board games cruise',
            'tabletop vacation',
            'strategy games at sea',
            'analog game community',
            'dice and decks cruise',
        ],
        minCabinsRequired: 8,
        startingPrice: 1299,
        priceSource: 'AI Estimate',
        researchRationale: 'Tabletop gaming has seen explosive post-pandemic growth. r/boardgames (5M+ members) and r/tabletop (1.2M+) show consistent interest in IRL meetups. BoardGameGeek convention attendance has doubled since 2022. The demographic skews 28-45, dual-income-no-kids or young families — exactly the cruise booking sweet spot. Unlike RPG or LARP niches, board gaming is inherently social, drop-in/drop-out, and cruise-compatible.',
        successLogic: 'Board game enthusiasts already travel for conventions (Gen Con, Essen, PAX Unplugged). A cruise offers the same social payoff with zero setup/teardown and built-in meals. The audience has disposable income, values curated experiences, and prefers analog social interaction over digital. The cruise format naturally provides the long sea-day sessions that board gamers crave, while the port stops offer a break from the table.',
        audienceSignals: [
            'r/boardgames has 5.2M members with regular "looking for group" IRL meetup threads',
            'BoardGameGeek community has grown 40% since 2022 with convention attendance doubling',
            'Dice Tower YouTube channel averages 400K views per video, indicating strong sustained interest',
            'Tabletop Simulator peak concurrent users on weekends exceeds 25K, showing demand for digital-to-IRL migration',
        ],
        vacationFitRationale: 'This is first and foremost a Greek Isles cruise with exceptional indoor common spaces, fine dining, and scenic port stops. The board game element is ambient — a shared social layer that makes sea days more engaging. Guests can ignore the gaming entirely and still have a premium cruise vacation. The games are optional, the ship is real, and the itinerary sells itself.',
        cruiseNativeMoments: [
            'A quiet card room with natural light and a half-finished game of Azul on the table',
            'Laughter from a group teaching Codenames on deck chairs at golden hour',
            'A couple playing a two-player strategy game with coffee at the indoor café',
            'A small crowd gathering around a dramatic Catan finish in the observation lounge',
            'Late-night dice rolling at the bar with soft ship lighting and ocean visible through windows',
        ],
        nicheExpressionMode: 'The board game theme expresses itself as ambient social chemistry rather than scheduled events. Games appear organically in lounges, cafés, and deck spaces. The vibe is "people who bring games on vacation" rather than "cruise designed around games." Props like dice, card sleeves, and small boxes should feel like personal belongings, not event decorations.',
        implausibleLiteralizations: [
            'A dedicated "game room" with tournament brackets and judges',
            'Mandatory game nights with assigned seating',
            'Costume play or character-themed dress codes',
            'Workshop-style game design sessions or lectures',
            'Professional game-mastered RPG campaigns with scheduled 4-hour blocks',
        ],
        allowedThemeSignals: [
            'Colorful board game boxes casually stacked on a café table',
            'Dice resting next to a cocktail on a teak rail',
            'Small groups leaning over a game in comfortable ship chairs',
            'Card sleeves and score pads visible but not central',
            'Board game box art visible as shelf decoration in a lounge',
        ],
        discouragedThemeSignals: [
            'Tournament banners, brackets, or competitive signage',
            'Game store convention aesthetic (booths, vendor halls, prize tables)',
            'Heavy RPG or LARP props (costumes, character sheets, elaborate setups)',
            'Scheduled event programming with strict timing',
            'Children-centric game themes (Candy Land, Chutes and Ladders as primary aesthetic)',
        ],
        communityFitRationale: 'Board gamers are inherently social but self-selecting. They enjoy teaching games, observing others play, and joining mid-session. A cruise ship provides the perfect "third space" for this — lounges, cafés, and deck areas where spontaneous games can start and stop without pressure. The community is welcoming to newcomers and values the shared ritual of setup, play, and post-game analysis.',
        optionalGatheringMoments: [
            'A "bring a favorite game" casual swap in the observation lounge on day 2',
            'Impromptu teach-and-play sessions when someone spots an interesting box',
            'Post-dinner wind-down games in the card room with coffee and dessert',
            'Sea-day afternoon "long strategy game" blocks for 3-4 hour epics',
            'Port-return evening "quick filler games" to reconnect before dinner',
        ],
        optionalityStyle: 'Everything is opt-in. There are no scheduled sessions, no sign-ups, and no mandatory participation. A guest can play zero games and still have a full cruise experience. The games are simply present in common spaces, available for anyone who wants to join. Introverts can observe from a nearby chair. Casual players can join a 20-minute filler. Hardcore gamers can bring their own Gloomhaven campaign.',
        solitudeRisks: [
            'If the campaign emphasizes "competitive tournament" framing, it alienates casual players',
            'If the aesthetic becomes too "geeky" or niche-coded, it scares off partners and friends who do not game',
            'If the ship choice lacks good indoor common spaces, sea days feel hollow without gaming infrastructure',
            'If pricing positions it as a "specialty cruise" premium, it narrows the audience too much',
            'If the community framing feels too male-dominated or cliquish, it loses the inclusive appeal',
        ],
    };

    const campaign = mapDiscoveryBlueprintToCampaign(blueprint);

    // Run lightweight Red Team review before saving
    const review = await runDiscoveryRedTeamReview(campaign);
    campaign.discoveryRedTeamReview = review;

    await saveCampaignBlueprint(campaign);

    console.log('Campaign saved:', campaign.id);
    console.log('Red Team verdict:', review.verdict);
    console.log('Issues:', review.issues?.length ?? 0);
    console.log('Required fixes:', review.requiredFixes?.length ?? 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
