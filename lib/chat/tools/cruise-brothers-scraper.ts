import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const CACHE_FILE_PATH = path.join(process.cwd(), '.github', 'data', 'cb-deals-cache.json');

// ─── Schemas ──────────────────────────────────────────────────────────────────

const PromoDealSchema = z.object({
    title: z.string(),
    description: z.string(),
    validUntil: z.string(),
    isFeatured: z.boolean(),
    category: z.string(),
    sourceUrl: z.string(),
});

const PriceAdvantageDealSchema = z.object({
    groupId: z.string(),
    shipName: z.string(),
    vendor: z.string(),
    sailDate: z.string(),
    startingPrice: z.string(),
    priceAdvantage: z.string(),
    sourceUrl: z.string(),
});

const DealsCacheSchema = z.object({
    generatedAtIso: z.string(),
    promos: z.array(PromoDealSchema),
    priceAdvantages: z.array(PriceAdvantageDealSchema),
});

type DealMatch = {
    type: 'promo' | 'price_advantage';
    title: string;
    details: string;
    validUntil: string;
    score: number;
};

// ─── Search ───────────────────────────────────────────────────────────────────

function normalizeQueryTerms(query: string): string[] {
    return query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3);
}

function scorePromo(queryTerms: string[], promo: z.infer<typeof PromoDealSchema>): number {
    const searchText = [promo.title, promo.description, promo.category].join(' ').toLowerCase();
    return queryTerms.reduce((score, term) => (searchText.includes(term) ? score + 1 : score), 0);
}

function scorePriceAdvantage(
    queryTerms: string[],
    advantage: z.infer<typeof PriceAdvantageDealSchema>
): number {
    const searchText = [advantage.shipName, advantage.vendor, advantage.sailDate]
        .join(' ')
        .toLowerCase();
    return queryTerms.reduce((score, term) => (searchText.includes(term) ? score + 1 : score), 0);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function runCruiseBrothersScraper(input: {
    query: string;
    cruiseLine: string | null;
    destination: string | null;
}): Promise<{
    dealsSummary: string;
    deals: DealMatch[];
}> {
    let rawCacheFile: string;
    try {
        rawCacheFile = await readFile(CACHE_FILE_PATH, 'utf-8');
    } catch {
        throw new Error(
            `CB deals cache not found at ${CACHE_FILE_PATH}. ` +
            'Run: npx ts-node scripts/scrape-cb-deals.ts'
        );
    }

    const cache = DealsCacheSchema.parse(JSON.parse(rawCacheFile));

    const combinedQuery = [input.query, input.cruiseLine, input.destination]
        .filter(Boolean)
        .join(' ');
    const queryTerms = normalizeQueryTerms(combinedQuery);

    if (queryTerms.length === 0) {
        throw new Error('Cruise Brothers scraper query must include at least one 3+ character term.');
    }

    const scoredPromos: DealMatch[] = cache.promos
        .map((promo) => ({
            type: 'promo' as const,
            title: promo.title,
            details: promo.description.slice(0, 200),
            validUntil: promo.validUntil,
            score: scorePromo(queryTerms, promo),
        }))
        .filter((match) => match.score > 0);

    const scoredAdvantages: DealMatch[] = cache.priceAdvantages
        .map((advantage) => ({
            type: 'price_advantage' as const,
            title: `${advantage.shipName} — ${advantage.vendor}`,
            details: `Sail: ${advantage.sailDate} | From: ${advantage.startingPrice} | Advantage: ${advantage.priceAdvantage}`,
            validUntil: advantage.sailDate,
            score: scorePriceAdvantage(queryTerms, advantage),
        }))
        .filter((match) => match.score > 0);

    const allMatches = [...scoredPromos, ...scoredAdvantages]
        .sort((left, right) => right.score - left.score)
        .slice(0, 5);

    const dealsSummary = allMatches.length > 0
        ? allMatches
            .map((deal, index) =>
                `${index + 1}. **${deal.title}** (${deal.type === 'promo' ? 'Promotion' : 'Price Advantage'})\n   ${deal.details}\n   Valid: ${deal.validUntil}`
            )
            .join('\n')
        : `No current deals match "${input.query}". Cache last updated: ${cache.generatedAtIso}`;

    return {
        dealsSummary,
        deals: allMatches,
    };
}
