import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getCampaignBlueprint, saveCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import type { GuestIdea } from '@/lib/campaigns/types';

export const dynamic = 'force-dynamic';

const SEED_IDEAS: Omit<GuestIdea, 'id' | 'submittedAt'>[] = [
    { text: 'Sunrise yoga session on the top deck', rawInput: 'Can we do yoga at sunrise on deck?', guestName: 'Maya R.', likes: 4, dislikes: 0, likedBy: [], dislikedBy: [] },
    { text: 'Guided snorkel at the reef stops', rawInput: 'I want to snorkel at the reef!', guestName: 'Nate O.', likes: 3, dislikes: 1, likedBy: [], dislikedBy: [] },
    { text: 'Forest bathing walk at a jungle port', rawInput: 'Forest bathing somewhere tropical', guestName: 'Sam K.', likes: 2, dislikes: 0, likedBy: [], dislikedBy: [] },
    { text: 'Evening herbal tea social on the lido deck', rawInput: 'Evening tea social on deck!', guestName: 'Priya M.', likes: 5, dislikes: 0, likedBy: [], dislikedBy: [] },
    { text: 'ATV ride through dense jungle trails', rawInput: 'I think we should try ATVs through jungle trails', guestName: 'Nate O.', likes: 1, dislikes: 2, likedBy: [], dislikedBy: [] },
];

export async function POST(req: NextRequest) {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not available in production.' }, { status: 403 });
    }

    const { slug } = await req.json().catch(() => ({})) as { slug?: string };
    if (!slug) {
        return NextResponse.json({ error: 'slug required' }, { status: 400 });
    }

    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        return NextResponse.json({ error: `Campaign "${slug}" not found.` }, { status: 404 });
    }

    const toAdd: GuestIdea[] = SEED_IDEAS.map((d) => ({
        ...d,
        id: crypto.randomUUID(),
        submittedAt: new Date().toISOString(),
    }));

    await saveCampaignBlueprint({
        ...campaign,
        guestIdeas: [...(campaign.guestIdeas ?? []), ...toAdd],
        updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, seeded: toAdd.length });
}
