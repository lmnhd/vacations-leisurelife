import crypto from 'crypto';
import { getCampaignBlueprint, saveCampaignBlueprint } from './campaign-store';
import type { GuestIdea } from './types';
import { callLLM, ModelName } from '@/lib/ai/llm-gateway';

function hashVoterId(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
}

/**
 * Calls the LLM to extract a clean 5-10 word activity idea from a raw guest message.
 * Returns null if the message doesn't contain an extractable idea.
 */
export async function extractIdeaText(rawInput: string): Promise<string | null> {
    const prompt = `A guest posted this message in an #ideas channel for a group cruise chat:

"${rawInput}"

Extract a clean, action-forward activity idea in 5-10 words (e.g. "Guided snorkel at reef stops" or "Sunrise yoga on the top deck"). If the message contains no extractable idea, reply with null.

Reply with ONLY the extracted idea text or the word null. No quotes, no punctuation at the end.`;

    try {
        const response = await callLLM(ModelName.CLAUDE_4_SONNET, prompt, {
            temperature: 0.2,
            maxTokens: 40,
        });
        const text = response.content.trim();
        if (!text || text.toLowerCase() === 'null') return null;
        return text.slice(0, 120);
    } catch {
        return null;
    }
}

/** Jaccard similarity on word tokens — returns 0–1. */
function wordSimilarity(a: string, b: string): number {
    const tokenize = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean));
    const setA = tokenize(a);
    const setB = tokenize(b);
    const intersection = [...setA].filter((w) => setB.has(w)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
}

/**
 * Extracts an idea from a guest's raw message and appends it to the campaign's guestIdeas list.
 * Skips if the extracted text is too similar (>60% Jaccard) to an existing idea.
 * No-ops silently on extraction failure or if the campaign is not found.
 */
export async function extractAndSaveIdea(
    slug: string,
    rawInput: string,
    guestName: string,
): Promise<void> {
    const text = await extractIdeaText(rawInput);
    if (!text) return;

    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) return;

    const existing = campaign.guestIdeas ?? [];
    const isDuplicate = existing.some((i) => wordSimilarity(i.text, text) > 0.6);
    if (isDuplicate) return;

    const idea: GuestIdea = {
        id: crypto.randomUUID(),
        text,
        rawInput,
        guestName,
        submittedAt: new Date().toISOString(),
        likes: 0,
        dislikes: 0,
        likedBy: [],
        dislikedBy: [],
    };

    await saveCampaignBlueprint({
        ...campaign,
        guestIdeas: [...(campaign.guestIdeas ?? []), idea],
        updatedAt: new Date().toISOString(),
    });
}

/**
 * Toggles a like or dislike on an idea. Switching sides removes the opposite vote first.
 * Voting the same type twice removes the vote (toggle off).
 * Returns the updated idea, or null if not found.
 */
export async function voteOnIdea(
    slug: string,
    ideaId: string,
    voterToken: string,
    voteType: 'like' | 'dislike',
): Promise<GuestIdea | null> {
    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) return null;

    const ideas = campaign.guestIdeas ?? [];
    const idx = ideas.findIndex((i) => i.id === ideaId);
    if (idx === -1) return null;

    const voterId = hashVoterId(voterToken);
    const idea = { ...ideas[idx] };
    const likedBy = [...idea.likedBy];
    const dislikedBy = [...idea.dislikedBy];

    if (voteType === 'like') {
        const alreadyLiked = likedBy.includes(voterId);
        const likedByFiltered = likedBy.filter((v) => v !== voterId);
        const dislikedByFiltered = dislikedBy.filter((v) => v !== voterId);
        if (alreadyLiked) {
            idea.likedBy = likedByFiltered;
        } else {
            idea.likedBy = [...likedByFiltered, voterId];
            idea.dislikedBy = dislikedByFiltered;
        }
    } else {
        const alreadyDisliked = dislikedBy.includes(voterId);
        const dislikedByFiltered = dislikedBy.filter((v) => v !== voterId);
        const likedByFiltered = likedBy.filter((v) => v !== voterId);
        if (alreadyDisliked) {
            idea.dislikedBy = dislikedByFiltered;
        } else {
            idea.dislikedBy = [...dislikedByFiltered, voterId];
            idea.likedBy = likedByFiltered;
        }
    }

    idea.likes = idea.likedBy.length;
    idea.dislikes = idea.dislikedBy.length;

    const updatedIdeas = [...ideas];
    updatedIdeas[idx] = idea;

    await saveCampaignBlueprint({
        ...campaign,
        guestIdeas: updatedIdeas,
        updatedAt: new Date().toISOString(),
    });

    return idea;
}
