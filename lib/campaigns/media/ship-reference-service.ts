import { Campaign } from '../types';
import { AssetRecord, CampaignAestheticBrief, ShipReferenceCandidate } from '../schema';
import { searchGoogleImages } from '@/lib/services/media/google-images';
import { saveAssetRecord } from './media-store';
import { storeAsset } from './storage-client';
import {
    createImageFingerprint,
    generateReferenceGroundedHeroImages,
    measureImageFingerprintDistance,
} from './generators/stability-generator';
import { getMediaImageGeneratorService } from './media-pipeline-config';

const HERO_SIMILARITY_STOP_WORDS = new Set([
    'the', 'and', 'with', 'from', 'cruise', 'ship', 'photo', 'professional', 'view', 'deck', 'ocean', 'sea',
    'sunset', 'sunrise', 'exterior', 'interior', 'room', 'area', 'line', 'voyage', 'travel', 'outdoor',
]);

function tokenizeHeroSimilarityText(value: string): string[] {
    return normalizeText(value)
        .split(/\s+/)
        .filter((token) => token.length > 2)
        .filter((token) => !HERO_SIMILARITY_STOP_WORDS.has(token));
}

function computeTokenOverlap(leftTokens: readonly string[], rightTokens: readonly string[]): number {
    const leftSet = new Set(leftTokens);
    const rightSet = new Set(rightTokens);

    if (leftSet.size === 0 || rightSet.size === 0) {
        return 0;
    }

    let sharedCount = 0;
    for (const token of leftSet) {
        if (rightSet.has(token)) {
            sharedCount += 1;
        }
    }

    return sharedCount / Math.min(leftSet.size, rightSet.size);
}

function extractComparablePath(url: string): string {
    try {
        const parsed = new URL(url);
        return normalizeText(parsed.hostname + parsed.pathname);
    } catch {
        return normalizeText(url);
    }
}

function areHeroCandidatesTooSimilar(leftCandidate: ShipReferenceCandidate, rightCandidate: ShipReferenceCandidate): boolean {
    const leftTokens = tokenizeHeroSimilarityText(`${leftCandidate.title} ${leftCandidate.contextUrl}`);
    const rightTokens = tokenizeHeroSimilarityText(`${rightCandidate.title} ${rightCandidate.contextUrl}`);
    const tokenOverlap = computeTokenOverlap(leftTokens, rightTokens);

    const leftPath = extractComparablePath(leftCandidate.contextUrl);
    const rightPath = extractComparablePath(rightCandidate.contextUrl);
    const sameSourcePage = leftPath.length > 0 && leftPath === rightPath;
    const sameCategory = leftCandidate.category === rightCandidate.category;

    return sameSourcePage || (sameCategory && tokenOverlap >= 0.6) || tokenOverlap >= 0.8;
}

async function isNearDuplicateHero(candidateBuffer: Buffer, acceptedBuffers: readonly Buffer[]): Promise<boolean> {
    if (acceptedBuffers.length === 0) {
        return false;
    }

    const candidateFingerprint = await createImageFingerprint(candidateBuffer);
    for (const acceptedBuffer of acceptedBuffers) {
        const acceptedFingerprint = await createImageFingerprint(acceptedBuffer);
        const distance = measureImageFingerprintDistance(candidateFingerprint, acceptedFingerprint);
        if (distance <= 0.075) {
            return true;
        }
    }

    return false;
}

function normalizeText(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
}

function getResolvedShipName(campaign: Campaign): string {
    const matchedShipName = campaign.matchedShipName?.trim();
    if (matchedShipName) {
        return matchedShipName;
    }
    const shipTarget = campaign.shipTarget?.trim();
    if (shipTarget) {
        return shipTarget;
    }
    throw new Error(`Campaign ${campaign.id} does not have a ship target for reference discovery`);
}

function getCruiseLineTokens(campaign: Campaign): string[] {
    const source = [campaign.shipTarget, campaign.matchedShipName].filter(Boolean).join(' ');
    return normalizeText(source)
        .split(/\s+/)
        .filter((token) => token.length > 2)
        .filter((token) => !['ship', 'cruise', 'line', 'class'].includes(token));
}

function buildReferenceQueries(campaign: Campaign): ReadonlyArray<{ category: string; query: string }> {
    const shipName = getResolvedShipName(campaign);
    const cruiseLineFragment = getCruiseLineTokens(campaign).join(' ');
    const sharedPrefix = `${shipName} ${cruiseLineFragment}`.trim();

    return [
        { category: 'exterior', query: `${sharedPrefix} cruise ship exterior professional photo` },
        { category: 'pool_deck', query: `${sharedPrefix} pool deck cruise ship photo` },
        { category: 'dining', query: `${sharedPrefix} dining room cruise ship photo` },
        { category: 'stateroom', query: `${sharedPrefix} stateroom cabin cruise ship photo` },
        { category: 'atrium', query: `${sharedPrefix} atrium interior cruise ship photo` },
        { category: 'destination_view', query: `${sharedPrefix} deck ocean view cruise ship photo` },
    ];
}

function scoreReferenceCandidate(campaign: Campaign, category: string, query: string, title: string, contextUrl: string, width: number, height: number): number {
    const shipName = normalizeText(getResolvedShipName(campaign));
    const cruiseTokens = getCruiseLineTokens(campaign);
    const haystack = `${normalizeText(title)} ${normalizeText(contextUrl)} ${normalizeText(query)}`;
    let score = 0;

    if (haystack.includes(shipName)) {
        score += 80;
    }

    for (const token of cruiseTokens) {
        if (haystack.includes(token)) {
            score += 12;
        }
    }

    if (haystack.includes(category.replace(/_/g, ' '))) {
        score += 20;
    }

    if (width >= 1400) {
        score += 15;
    }

    if (height >= 900) {
        score += 10;
    }

    const penalties = ['deck plan', 'floor plan', 'map', 'brochure', 'logo', 'icon', 'render', 'illustration'];
    for (const penalty of penalties) {
        if (haystack.includes(penalty)) {
            score -= 40;
        }
    }

    return score;
}

export async function discoverShipReferenceCandidates(campaign: Campaign, maxPerCategory: number = 2): Promise<ShipReferenceCandidate[]> {
    const queryConfigs = buildReferenceQueries(campaign);
    const candidateMap = new Map<string, ShipReferenceCandidate>();

    for (const queryConfig of queryConfigs) {
        const response = await searchGoogleImages(queryConfig.query, 10);
        for (const result of response.results) {
            const selectionScore = scoreReferenceCandidate(
                campaign,
                queryConfig.category,
                queryConfig.query,
                result.title,
                result.contextUrl,
                result.width,
                result.height,
            );

            if (selectionScore < 50) {
                continue;
            }

            const existing = candidateMap.get(result.imageUrl);
            if (existing && existing.selectionScore >= selectionScore) {
                continue;
            }

            candidateMap.set(result.imageUrl, {
                title: result.title,
                imageUrl: result.imageUrl,
                thumbnailUrl: result.thumbnailUrl,
                contextUrl: result.contextUrl,
                width: result.width,
                height: result.height,
                category: queryConfig.category,
                query: queryConfig.query,
                selectionScore,
            });
        }
    }

    const rankedCandidates = Array.from(candidateMap.values())
        .sort((leftCandidate, rightCandidate) => rightCandidate.selectionScore - leftCandidate.selectionScore);

    const limitedCandidates: ShipReferenceCandidate[] = [];
    const categoryCounts = new Map<string, number>();
    for (const candidate of rankedCandidates) {
        const currentCount = categoryCounts.get(candidate.category) ?? 0;
        if (currentCount >= maxPerCategory) {
            continue;
        }
        categoryCounts.set(candidate.category, currentCount + 1);
        limitedCandidates.push(candidate);
    }

    return limitedCandidates;
}

async function importCandidateAsAsset(slug: string, candidate: ShipReferenceCandidate, assetType: 'ship_reference_image' | 'hero_image', assetId: string, reviewStatus: AssetRecord['reviewStatus']): Promise<AssetRecord> {
    const response = await fetch(candidate.imageUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch ship reference image (${response.status}): ${candidate.imageUrl}`);
    }

    const mimeType = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
    const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const buffer = Buffer.from(await response.arrayBuffer());
    const fileName = assetType === 'ship_reference_image'
        ? `images/references/${assetId}.${extension}`
        : `images/hero/${assetId}.${extension}`;
    const url = await storeAsset(slug, assetId, fileName, buffer, mimeType);

    const record: AssetRecord = {
        assetId,
        assetType,
        url,
        generator: 'serpapi',
        promptUsed: candidate.title,
        sourcePageUrl: candidate.contextUrl,
        sourceThumbnailUrl: candidate.thumbnailUrl,
        sourceQuery: candidate.query,
        selectionScore: candidate.selectionScore,
        dimensions: {
            width: candidate.width,
            height: candidate.height,
        },
        fileSizeBytes: buffer.length,
        mimeType,
        tags: ['ship-reference', candidate.category, assetType === 'hero_image' ? 'hero' : 'reference'],
        createdAt: new Date().toISOString(),
        reviewStatus,
        version: 1,
        active: true,
    };

    await saveAssetRecord(slug, record);
    return record;
}

export async function importShipReferenceAssets(slug: string, candidates: ReadonlyArray<ShipReferenceCandidate>): Promise<AssetRecord[]> {
    const records: AssetRecord[] = [];
    for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const assetId = `img_ship_reference_${String(index + 1).padStart(3, '0')}`;
        records.push(await importCandidateAsAsset(slug, candidate, 'ship_reference_image', assetId, 'auto_approved'));
    }
    return records;
}

function scoreHeroCandidate(candidate: ShipReferenceCandidate): number {
    const categoryBonusMap: Record<string, number> = {
        exterior: 42,
        destination_view: 34,
        pool_deck: 10,
        atrium: -28,
        dining: -34,
        stateroom: -40,
    };
    const title = normalizeText(candidate.title);
    let score = candidate.selectionScore + (categoryBonusMap[candidate.category] ?? 0);

    if (title.includes('review')) {
        score -= 10;
    }
    if (title.includes('cabin')) {
        score -= 8;
    }
    const busyInteriorTerms = [
        'atrium', 'restaurant', 'dining', 'buffet', 'bar', 'lounge', 'casino', 'interior', 'lobby', 'theater'
    ];
    for (const term of busyInteriorTerms) {
        if (title.includes(term)) {
            score -= 18;
        }
    }

    const sparseHeroTerms = [
        'exterior', 'deck', 'ocean view', 'sea view', 'outdoor', 'sunset', 'sunrise', 'horizon', 'bow', 'stern'
    ];
    for (const term of sparseHeroTerms) {
        if (title.includes(term)) {
            score += 10;
        }
    }

    if (candidate.width >= 1800) {
        score += 8;
    }
    if (candidate.height >= 1000) {
        score += 6;
    }

    return score;
}

function selectHeroCandidates(candidates: ReadonlyArray<ShipReferenceCandidate>, maxHeroCount: number): ShipReferenceCandidate[] {
    const rankedCandidates = [...candidates]
        .sort((leftCandidate, rightCandidate) => scoreHeroCandidate(rightCandidate) - scoreHeroCandidate(leftCandidate));

    const selected: ShipReferenceCandidate[] = [];
    const categoryCounts = new Map<string, number>();
    let exteriorFamilyCount = 0;

    for (const candidate of rankedCandidates) {
        if (selected.length >= maxHeroCount) {
            break;
        }

        const categoryCount = categoryCounts.get(candidate.category) ?? 0;
        const categoryCap = candidate.category === 'exterior' || candidate.category === 'destination_view' ? 2 : 1;
        if (categoryCount >= categoryCap) {
            continue;
        }

        const isExteriorFamily = candidate.category === 'exterior' || candidate.category === 'destination_view';
        if (isExteriorFamily && exteriorFamilyCount >= 3) {
            continue;
        }

        if (selected.some((selectedCandidate) => areHeroCandidatesTooSimilar(selectedCandidate, candidate))) {
            continue;
        }

        selected.push(candidate);
        categoryCounts.set(candidate.category, categoryCount + 1);
        if (isExteriorFamily) {
            exteriorFamilyCount += 1;
        }
    }

    for (const candidate of rankedCandidates) {
        if (selected.length >= maxHeroCount) {
            break;
        }
        if (selected.includes(candidate)) {
            continue;
        }

        const categoryCount = categoryCounts.get(candidate.category) ?? 0;
        const categoryCap = candidate.category === 'exterior' || candidate.category === 'destination_view' ? 2 : 1;
        if (categoryCount >= categoryCap) {
            continue;
        }

        const isExteriorFamily = candidate.category === 'exterior' || candidate.category === 'destination_view';
        if (isExteriorFamily && exteriorFamilyCount >= 3) {
            continue;
        }

        selected.push(candidate);
        categoryCounts.set(candidate.category, categoryCount + 1);
        if (isExteriorFamily) {
            exteriorFamilyCount += 1;
        }
    }

    return selected;
}

export async function importHeroAssetsFromReferences(
    slug: string,
    campaign: Campaign,
    brief: CampaignAestheticBrief,
    candidates: ReadonlyArray<ShipReferenceCandidate>,
    maxHeroCount: number = 5
): Promise<AssetRecord[]> {
    const selectedCandidates = selectHeroCandidates(candidates, Math.min(candidates.length, maxHeroCount + 4));
    const shipName = getResolvedShipName(campaign);
    const records: AssetRecord[] = [];
    const acceptedHeroBuffers: Buffer[] = [];
    for (let index = 0; index < selectedCandidates.length; index += 1) {
        if (records.length >= maxHeroCount) {
            break;
        }

        const candidate = selectedCandidates[index];
        const generatedHeroImages = await generateReferenceGroundedHeroImages(brief, shipName, candidate, records.length, 1);
        const generatedHero = generatedHeroImages[0];
        if (await isNearDuplicateHero(generatedHero.buffer, acceptedHeroBuffers)) {
            continue;
        }

        const heroOrdinal = String(records.length + 1).padStart(3, '0');
        const assetId = `img_hero_${heroOrdinal}`;
        const fileName = `images/hero/hero_${heroOrdinal}_embellished.png`;
        const url = await storeAsset(slug, assetId, fileName, generatedHero.buffer, 'image/png');
        const record: AssetRecord = {
            assetId,
            assetType: 'hero_image',
            url,
            generator: getMediaImageGeneratorService(),
            promptUsed: generatedHero.prompt,
            sourcePageUrl: candidate.contextUrl,
            sourceThumbnailUrl: candidate.thumbnailUrl,
            sourceQuery: candidate.query,
            selectionScore: scoreHeroCandidate(candidate),
            dimensions: {
                width: candidate.width,
                height: candidate.height,
            },
            fileSizeBytes: generatedHero.buffer.length,
            mimeType: 'image/png',
            tags: ['ship-reference', candidate.category, 'hero', 'embellished'],
            createdAt: new Date().toISOString(),
            reviewStatus: 'needs_review',
            version: 1,
            active: true,
        };
        await saveAssetRecord(slug, record);
        acceptedHeroBuffers.push(generatedHero.buffer);
        records.push(record);
    }
    return records;
}
