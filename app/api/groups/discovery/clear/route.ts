import { NextResponse } from 'next/server';
import { deleteAllCampaigns, scanAllCampaigns, saveCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { applyCampaignArchive } from '@/lib/campaigns/discovery-iteration';
import { unlinkSync, existsSync } from 'fs';
import path from 'path';

const RESEARCH_CACHE_FILE = path.join(process.cwd(), '.github', 'data', 'discovery-research-cache.json');

function clearResearchCache(): void {
    if (existsSync(RESEARCH_CACHE_FILE)) {
        unlinkSync(RESEARCH_CACHE_FILE);
        console.log('[clear] Research cache cleared.');
    }
}

/**
 * DELETE /api/groups/discovery/clear
 * DESTRUCTIVE — permanently deletes every campaign (ALL rows per campaign, not just
 * METADATA) from DynamoDB and clears the research cache. Cannot be undone.
 *
 * Prefer the non-destructive POST (archive-all) when the goal is only to stop the
 * model from re-suggesting existing ideas; archived records are kept and reversible.
 */
export async function DELETE(): Promise<NextResponse> {
    const deleted = await deleteAllCampaigns();
    clearResearchCache();
    return NextResponse.json({ success: true, deleted });
}

/**
 * POST /api/groups/discovery/clear
 * NON-DESTRUCTIVE — archives every campaign (including already-retired ones) so the
 * model "forgets" them for dedup purposes, and clears the research cache. Records
 * stay in the DB and are reversible (unarchive, or auto-cleared when a campaign
 * advances past DRAFT). This is the "wipe model memory, reinsert on run" path.
 */
export async function POST(): Promise<NextResponse> {
    const campaigns = await scanAllCampaigns();
    const toArchive = campaigns.filter((c) => !c.archived);
    await Promise.all(
        toArchive.map((c) =>
            saveCampaignBlueprint({ ...applyCampaignArchive(c), updatedAt: new Date().toISOString() }),
        ),
    );
    clearResearchCache();
    return NextResponse.json({ success: true, archived: toArchive.length, total: campaigns.length });
}
