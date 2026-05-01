import assert from 'node:assert/strict';
import type { Campaign } from '../types';
import { buildShipCopyAlignmentReview } from '../ship-copy-alignment';

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
    return {
        PK: 'CAMPAIGN#ship-copy',
        SK: 'METADATA',
        id: 'ship-copy',
        name: 'Ship Copy Test',
        description: 'Test campaign',
        targetDates: '2026-11-07',
        targetDestination: 'Eastern Caribbean',
        shipTarget: 'Brilliance of the Seas',
        minCabinsRequired: 8,
        status: 'GATHERING_INTEREST',
        createdAt: '2026-04-30T00:00:00.000Z',
        updatedAt: '2026-04-30T00:00:00.000Z',
        ...overrides,
    } as Campaign;
}

function main(): void {
    const royalCampaign = makeCampaign({
        shipTarget: 'Brilliance of the Seas',
        matchedShipName: 'Brilliance of the Seas',
        description: 'Sailing past the Virgin Islands with a warm social vibe.',
    });

    const review = buildShipCopyAlignmentReview(royalCampaign);
    const hasVirginConflict = review.issues.some((issue) =>
        /Virgin-specific venue language conflicts with the matched ship/i.test(issue.title),
    );
    assert.equal(hasVirginConflict, false);

    const virginCampaign = makeCampaign({
        shipTarget: 'Scarlet Lady',
        matchedShipName: 'Scarlet Lady',
        description: 'Adults only setting with social lounge spaces.',
    });
    const virginReview = buildShipCopyAlignmentReview(virginCampaign);
    const hasVirginFalsePositive = virginReview.issues.some((issue) =>
        /Virgin-specific venue language conflicts with the matched ship/i.test(issue.title),
    );
    assert.equal(hasVirginFalsePositive, false);

    console.log('ship copy alignment tests passed');
}

main();
