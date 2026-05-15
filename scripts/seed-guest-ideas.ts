/**
 * One-time seed script: adds dummy guest ideas to a campaign for UI testing.
 * Usage: npx tsx scripts/seed-guest-ideas.ts <slug>
 *
 * Example: npx tsx scripts/seed-guest-ideas.ts wellness-and-nature-cruise
 */

import 'dotenv/config';
import crypto from 'crypto';
import { getCampaignBlueprint, saveCampaignBlueprint } from '../lib/campaigns/campaign-store';
import type { GuestIdea } from '../lib/campaigns/types';

const slug = process.argv[2];
if (!slug) {
    console.error('Usage: npx tsx scripts/seed-guest-ideas.ts <slug>');
    process.exit(1);
}

const dummyIdeas: Omit<GuestIdea, 'id' | 'submittedAt'>[] = [
    { text: 'Sunrise yoga session on the top deck', rawInput: 'Can we do yoga on the deck at sunrise?', guestName: 'Maya R.', likes: 4, dislikes: 0, likedBy: [], dislikedBy: [] },
    { text: 'Guided snorkel at the reef stops', rawInput: 'I want to snorkel at the reef!', guestName: 'Nate O.', likes: 3, dislikes: 1, likedBy: [], dislikedBy: [] },
    { text: 'Forest bathing walk at a jungle port', rawInput: 'Forest bathing walk somewhere tropical', guestName: 'Sam K.', likes: 2, dislikes: 0, likedBy: [], dislikedBy: [] },
    { text: 'Evening herbal tea social on the lido deck', rawInput: 'Evening tea social on deck sounds amazing', guestName: 'Priya M.', likes: 5, dislikes: 0, likedBy: [], dislikedBy: [] },
    { text: 'ATV ride through dense jungle trails', rawInput: 'I think we should try Ride ATVs through dense jungle trails', guestName: 'Nate O.', likes: 1, dislikes: 2, likedBy: [], dislikedBy: [] },
];

async function seed() {
    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        console.error(`Campaign "${slug}" not found.`);
        process.exit(1);
    }

    const existing = campaign.guestIdeas ?? [];
    const toAdd: GuestIdea[] = dummyIdeas.map((d) => ({
        ...d,
        id: crypto.randomUUID(),
        submittedAt: new Date().toISOString(),
    }));

    await saveCampaignBlueprint({
        ...campaign,
        guestIdeas: [...existing, ...toAdd],
        updatedAt: new Date().toISOString(),
    });

    console.log(`Seeded ${toAdd.length} ideas into "${slug}". Total: ${existing.length + toAdd.length}`);
}

seed().catch((err) => { console.error(err); process.exit(1); });
