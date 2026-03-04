import { NextResponse } from 'next/server';
import { deleteAllCampaigns } from '@/lib/campaigns/campaign-store';
import { unlinkSync, existsSync } from 'fs';
import path from 'path';

/**
 * DELETE /api/groups/discovery/clear
 * Wipes all campaign METADATA records from DynamoDB and clears the research cache.
 * Used by the test page to reset stale Phase A results before a fresh inventory-aligned run.
 */
export async function DELETE(): Promise<NextResponse> {
    const deleted = await deleteAllCampaigns();

    // Also clear the research cache so Phase A fully re-runs with up-to-date CB inventory
    const cacheFile = path.join(process.cwd(), '.github', 'data', 'discovery-research-cache.json');
    if (existsSync(cacheFile)) {
        unlinkSync(cacheFile);
        console.log('[clear] Research cache cleared.');
    }

    return NextResponse.json({ success: true, deleted });
}
