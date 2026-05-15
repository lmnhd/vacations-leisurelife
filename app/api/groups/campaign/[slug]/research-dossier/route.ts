import { NextRequest, NextResponse } from 'next/server';
import {
    generateCampaignResearchDossier,
    getCampaignResearchDossier,
} from '@/lib/campaigns/campaign-research';

// GET /api/groups/campaign/[slug]/research-dossier
// Returns the persisted research dossier, or null if it has not been generated yet.
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    if (!slug) {
        return NextResponse.json({ success: false, error: 'Campaign slug is required.' }, { status: 400 });
    }

    try {
        const dossier = await getCampaignResearchDossier(slug);
        return NextResponse.json({ success: true, slug, dossier });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = message.startsWith('Campaign not found') ? 404 : 500;
        console.error('[campaign-research:GET]', error);
        return NextResponse.json({ success: false, error: message }, { status });
    }
}

// POST /api/groups/campaign/[slug]/research-dossier
// Generates the Phase 1.5 secondary research dossier for the selected campaign
// and persists it on the campaign METADATA record. Pass `{ force: true }` in
// the JSON body to regenerate even when a dossier is already present.
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    if (!slug) {
        return NextResponse.json({ success: false, error: 'Campaign slug is required.' }, { status: 400 });
    }

    let force = false;
    try {
        const body = (await req.json()) as { force?: boolean } | null;
        force = Boolean(body?.force);
    } catch {
        force = false;
    }

    try {
        const result = await generateCampaignResearchDossier(slug, { force });
        return NextResponse.json({ success: true, slug, ...result });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = message.startsWith('Campaign not found')
            ? 404
            : message.startsWith('Cannot generate research dossier')
                ? 409
                : 500;
        console.error('[campaign-research:POST]', error);
        return NextResponse.json({ success: false, error: message }, { status });
    }
}
