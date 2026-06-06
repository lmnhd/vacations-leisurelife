import assert from 'node:assert/strict';
import {
    findStaleShipMentionsForCampaign,
    sanitizeAdCopySetShipCopyForCampaign,
    sanitizeShipCopyForCampaign,
} from '../ship-copy';
import type { Campaign } from '../types';
import type { AdCopySet } from '@/lib/ads/types';

const campaign = {
    id: 'grand-costumed-promenade-explorer',
    name: 'The Grand Costumed Promenade',
    description: '',
    targetDates: 'Jan 2027',
    shipTarget: 'Explorer of the Seas',
} as Campaign;

assert.equal(
    sanitizeShipCopyForCampaign(
        'A Caribbean sailing on Symphony of the Seas for guests who love full dress.',
        campaign,
    ),
    'A Caribbean sailing on Explorer of the Seas for guests who love full dress.',
);

assert.equal(
    sanitizeShipCopyForCampaign(
        'Explorer of the Seas keeps its own name.',
        campaign,
    ),
    'Explorer of the Seas keeps its own name.',
);

assert.deepEqual(
    findStaleShipMentionsForCampaign(
        'Symphony of the Seas and Wonder of the Seas are stale references here.',
        campaign,
    ),
    ['wonder of the seas', 'symphony of the seas'],
);

const copySet = sanitizeAdCopySetShipCopyForCampaign({
    creativeTerritory: 'A story on Symphony of the Seas.',
    compositionIntent: 'Show costumed travelers meeting aboard Symphony of the Seas.',
    formats: {
        story_reel: {
            compositionNote: 'Aboard Symphony of the Seas, the page feels social.',
            headline: 'Promenade',
            subhead: 'Aboard Symphony of the Seas',
            microcopy: 'Symphony circle',
            cta: 'Join List',
            imageSlotDirectives: {
                hero_image: {
                    assetType: 'hero',
                    narrativeRole: 'Symphony of the Seas social detail',
                    moodCue: 'warm light',
                    preferTags: ['symphony of the seas'],
                },
            },
        },
    },
} as AdCopySet, campaign);

const storyPack = copySet.formats.story_reel;
assert.ok(storyPack && !Array.isArray(storyPack));
assert.equal(storyPack.subhead, 'Aboard Explorer of the Seas');
assert.equal(storyPack.imageSlotDirectives.hero_image.narrativeRole, 'Explorer of the Seas social detail');

console.log('ship copy sanitizer test passed');
