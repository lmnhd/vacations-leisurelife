import assert from 'node:assert/strict';
import type { Campaign } from '../types';
import { buildShipContext, getCanonicalShipName } from '../aesthetic-engine';

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
    return {
        PK: 'CAMPAIGN#ship-context',
        SK: 'METADATA',
        id: 'ship-context',
        name: 'Ship Context Test',
        description: 'Test campaign',
        targetDates: '2026-11-07',
        targetDestination: 'Eastern Caribbean',
        shipTarget: 'Celebrity Edge',
        minCabinsRequired: 8,
        status: 'GATHERING_INTEREST',
        createdAt: '2026-04-30T00:00:00.000Z',
        updatedAt: '2026-04-30T00:00:00.000Z',
        ...overrides,
    } as Campaign;
}

function main(): void {
    const matchedCampaign = makeCampaign({
        shipTarget: 'Celebrity Edge',
        matchedShipName: 'Norwegian Gem',
    });

    assert.equal(getCanonicalShipName(matchedCampaign), 'Norwegian Gem');

    const shipContext = buildShipContext(matchedCampaign);
    assert.match(shipContext, /^Norwegian Gem/);
    assert.match(shipContext, /Blueprint target: Celebrity Edge/);
    assert.match(shipContext, /Inventory metadata conflict: Norwegian Gem/);

    const targetOnlyCampaign = makeCampaign({
        shipTarget: 'Celebrity Edge',
        matchedShipName: undefined,
    });

    assert.equal(getCanonicalShipName(targetOnlyCampaign), 'Celebrity Edge');
    assert.equal(buildShipContext(targetOnlyCampaign), 'Celebrity Edge');

    console.log('ship context precedence tests passed');
}

main();
