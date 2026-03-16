import { Campaign } from '../types';
import { AssetCuration, AssetRecord, CampaignAestheticBrief, ShipReferenceCandidate } from '../schema';
import { applyVisionEvaluationToCategory } from './vision-evaluator';
import { searchGoogleImages } from '@/lib/services/media/google-images';
import { saveAssetRecord } from './media-store';
import { getAssetsByType } from './media-store';
import { storeAsset } from './storage-client';
import {
    createImageFingerprint,
    generateHeroImages,
    generateReferenceGroundedHeroImages,
    measureImageFingerprintDistance,
} from './generators/stability-generator';
import { getMediaImageGeneratorService } from './media-pipeline-config';
import {
    getShipFamilyKeywords,
    getSiblingShipNames,
    metadataSupportsShipLandscapeFeature,
} from './ship-environment-profile';

type ReferenceMatchLevel = 'exact_ship' | 'same_class' | 'generic_cruise';

const HERO_SIMILARITY_STOP_WORDS = new Set([
    'the', 'and', 'with', 'from', 'cruise', 'ship', 'photo', 'professional', 'view', 'deck', 'ocean', 'sea',
    'sunset', 'sunrise', 'exterior', 'interior', 'room', 'area', 'line', 'voyage', 'travel', 'outdoor',
]);

const HARD_REJECT_REFERENCE_TERMS = [
    'hotel', 'resort', 'villa', 'backyard', 'patio',
    'real estate', 'apartment', 'airbnb', 'wedding venue', 'event venue', 'banquet hall',
    'render', 'illustration', 'vector', 'floor plan', 'site plan', 'brochure', 'stock photo',
];

const LANDSCAPE_MISMATCH_TERMS = [
    'garden', 'lawn', 'grass', 'hedge', 'hedges', 'flower bed', 'flower beds', 'courtyard',
];

const MARITIME_SIGNAL_TERMS = [
    'cruise', 'ship', 'deck', 'stateroom', 'cabin', 'atrium', 'pool', 'ocean', 'sea',
    'voyage', 'port', 'promenade', 'balcony', 'lido', 'bow', 'stern', 'bridge',
];

const CRUISE_LINE_QUERY_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
    { pattern: /royal caribbean(?: international)?/i, label: 'Royal Caribbean' },
    { pattern: /virgin voyages/i, label: 'Virgin Voyages' },
    { pattern: /celebrity cruises?/i, label: 'Celebrity Cruises' },
    { pattern: /norwegian cruise line|\bncl\b/i, label: 'Norwegian Cruise Line' },
    { pattern: /carnival cruise line|\bcarnival\b/i, label: 'Carnival Cruise Line' },
    { pattern: /princess cruises?/i, label: 'Princess Cruises' },
];

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

function getShipIdentityTokens(campaign: Campaign): { lineToken: string; shipTokens: string[]; fullShipName: string } {
    const fullShipName = normalizeText(getResolvedShipName(campaign)).replace(/\s+/g, ' ').trim();
    const rawTokens = fullShipName.split(/\s+/).filter((token) => token.length > 2);
    const lineToken = rawTokens[0] ?? '';
    const shipTokens = rawTokens.slice(1);

    return {
        lineToken,
        shipTokens,
        fullShipName,
    };
}

function classifyReferenceMatchLevel(
    campaign: Campaign,
    title: string,
    contextUrl: string,
): ReferenceMatchLevel {
    const metadataHaystack = `${normalizeText(title)} ${normalizeText(contextUrl)}`.replace(/\s+/g, ' ').trim();
    const { lineToken, shipTokens, fullShipName } = getShipIdentityTokens(campaign);
    const shipName = getResolvedShipName(campaign);
    const familyKeywords = getShipFamilyKeywords(shipName);
    const siblingShipNames = getSiblingShipNames(shipName);
    const hasMaritimeSignal = MARITIME_SIGNAL_TERMS.some((term) => metadataHaystack.includes(term));
    const hasFullShipName = fullShipName.length > 0 && metadataHaystack.includes(fullShipName);
    const hasAllShipTokens = shipTokens.length > 0 && shipTokens.every((token) => metadataHaystack.includes(token));
    const hasLineToken = lineToken.length > 0 && metadataHaystack.includes(lineToken);
    const hasFamilyKeyword = familyKeywords.some((keyword) => metadataHaystack.includes(keyword));
    const mentionsSiblingShip = siblingShipNames.some((siblingShip) => metadataHaystack.includes(siblingShip));
    const hasAllowedLandscapeCue = metadataSupportsShipLandscapeFeature(shipName, metadataHaystack);

    if ((hasFullShipName || hasAllShipTokens) && hasMaritimeSignal) {
        return 'exact_ship';
    }

    if (hasLineToken && hasMaritimeSignal && (hasFamilyKeyword || mentionsSiblingShip || hasAllowedLandscapeCue)) {
        return 'same_class';
    }

    return 'generic_cruise';
}

function getResolvedShipName(campaign: Campaign): string {
    const shipTarget = campaign.shipTarget?.trim();
    if (shipTarget) {
        return shipTarget;
    }
    const matchedShipName = campaign.matchedShipName?.trim();
    if (matchedShipName) {
        return matchedShipName;
    }
    throw new Error(`Campaign ${campaign.id} does not have a ship target for reference discovery`);
}

function getCruiseLineQueryFragment(campaign: Campaign): string {
    const source = [campaign.shipTarget, campaign.matchedShipName].filter(Boolean).join(' ');

    for (const { pattern, label } of CRUISE_LINE_QUERY_PATTERNS) {
        if (pattern.test(source)) {
            return label;
        }
    }

    return '';
}

function buildReferenceQueries(campaign: Campaign): ReadonlyArray<{ category: string; query: string }> {
    const shipName = getResolvedShipName(campaign);
    const cruiseLineFragment = getCruiseLineQueryFragment(campaign);
    const sharedPrefix = [shipName, cruiseLineFragment].filter(Boolean).join(' ').trim();

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
    const cruiseTokens = normalizeText(getCruiseLineQueryFragment(campaign))
        .split(/\s+/)
        .filter((token) => token.length > 2);
    const metadataHaystack = `${normalizeText(title)} ${normalizeText(contextUrl)}`;
    const queryHaystack = normalizeText(query);
    const matchLevel = classifyReferenceMatchLevel(campaign, title, contextUrl);
    let score = 0;

    if (matchLevel === 'exact_ship') {
        score += 140;
    } else if (matchLevel === 'same_class') {
        score += 25;
    } else {
        score -= 120;
    }

    if (metadataHaystack.includes(shipName)) {
        score += 80;
    }

    for (const token of cruiseTokens) {
        if (metadataHaystack.includes(token)) {
            score += 12;
        }
    }

    if (metadataHaystack.includes(category.replace(/_/g, ' ')) || queryHaystack.includes(category.replace(/_/g, ' '))) {
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
        if (metadataHaystack.includes(penalty)) {
            score -= 40;
        }
    }

    return score;
}

function shouldHardRejectReferenceCandidate(
    campaign: Campaign,
    title: string,
    contextUrl: string,
): boolean {
    const metadataHaystack = `${normalizeText(title)} ${normalizeText(contextUrl)}`;
    const shipName = getResolvedShipName(campaign);

    if (HARD_REJECT_REFERENCE_TERMS.some((term) => metadataHaystack.includes(term))) {
        return true;
    }

    if (
        LANDSCAPE_MISMATCH_TERMS.some((term) => metadataHaystack.includes(term))
        && !metadataSupportsShipLandscapeFeature(shipName, metadataHaystack)
    ) {
        return true;
    }

    return classifyReferenceMatchLevel(campaign, title, contextUrl) === 'generic_cruise';
}

function computeFinalRankScore(candidate: ShipReferenceCandidate): number {
    if (candidate.aiScore === undefined) {
        return candidate.selectionScore;
    }
    // Blend heuristic and AI score (aiScore *2 normalises 0-100 to a comparable range)
    return (candidate.selectionScore + candidate.aiScore * 2) / 2;
}

function buildCurationFromCandidateAI(candidate: ShipReferenceCandidate): AssetCuration | undefined {
    if (candidate.aiScore === undefined) {
        return undefined;
    }
    return {
        approvalState: 'pending_review',
        globalPriority: Math.min(100, Math.max(0, Math.round(candidate.aiScore))),
        contextPriorities: {},
        approvedContexts: [],
        blockedContexts: [],
        suitabilityTags: candidate.detectedTags ?? [],
        antiTags: candidate.antiTags ?? [],
        downstreamLocked: false,
        curatorNotes: candidate.aiReasoning ? `[AI] ${candidate.aiReasoning}` : undefined,
        updatedAt: new Date().toISOString(),
    };
}

function buildReferenceMatchTag(matchLevel: ReferenceMatchLevel): string {
    if (matchLevel === 'exact_ship') return 'match:exact_ship';
    if (matchLevel === 'same_class') return 'match:same_class';
    return 'match:generic_cruise';
}

export async function discoverShipReferenceCandidates(campaign: Campaign, maxPerCategory: number = 2): Promise<ShipReferenceCandidate[]> {
    return discoverShipReferenceCandidatesWithExclusions(campaign, maxPerCategory, {});
}

export async function discoverShipReferenceCandidatesWithExclusions(
    campaign: Campaign,
    maxPerCategory: number = 2,
    exclusions?: {
        imageUrls?: readonly string[];
        contextUrls?: readonly string[];
    },
): Promise<ShipReferenceCandidate[]> {
    const queryConfigs = buildReferenceQueries(campaign);
    const candidateMap = new Map<string, ShipReferenceCandidate>();
    const excludedImageUrls = new Set((exclusions?.imageUrls ?? []).filter(Boolean));
    const excludedContextUrls = new Set((exclusions?.contextUrls ?? []).filter(Boolean));

    const settledResponses = await Promise.allSettled(
        queryConfigs.map(async (queryConfig) => ({
            queryConfig,
            response: await searchGoogleImages(queryConfig.query, 6),
        }))
    );

    for (const settledResponse of settledResponses) {
        if (settledResponse.status !== 'fulfilled') {
            console.warn('Ship reference search failed for one category', {
                campaignId: campaign.id,
                error: settledResponse.reason instanceof Error ? settledResponse.reason.message : String(settledResponse.reason),
            });
            continue;
        }

        const { queryConfig, response } = settledResponse.value;
        for (const result of response.results) {
            if (excludedImageUrls.has(result.imageUrl) || excludedContextUrls.has(result.contextUrl)) {
                continue;
            }

            if (shouldHardRejectReferenceCandidate(campaign, result.title, result.contextUrl)) {
                continue;
            }

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

    // ── Per-category vision evaluation (Phase 3 / Phase 8) ────────────────────
    const shipNameForVision = getResolvedShipName(campaign);
    const categoryCandidateGroups = new Map<string, ShipReferenceCandidate[]>();
    for (const candidate of candidateMap.values()) {
        const batch = categoryCandidateGroups.get(candidate.category) ?? [];
        batch.push(candidate);
        categoryCandidateGroups.set(candidate.category, batch);
    }

    const visionSettled = await Promise.allSettled(
        Array.from(categoryCandidateGroups.entries()).map(async ([category, batch]) => ({
            category,
            batch,
            survivors: await applyVisionEvaluationToCategory(batch, shipNameForVision),
        }))
    );

    for (const settled of visionSettled) {
        if (settled.status !== 'fulfilled') {
            console.warn('[ShipReferenceService] Vision evaluation rejected for a category — heuristic ranking preserved', {
                campaignId: campaign.id,
                error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
            });
            continue;
        }
        const { batch, survivors } = settled.value;
        for (const candidate of batch) {
            candidateMap.delete(candidate.imageUrl);
        }
        for (const augmented of survivors) {
            candidateMap.set(augmented.imageUrl, augmented);
        }
    }

    const rankedCandidates = Array.from(candidateMap.values())
        .sort((leftCandidate, rightCandidate) => computeFinalRankScore(rightCandidate) - computeFinalRankScore(leftCandidate));

    const limitedCandidates: ShipReferenceCandidate[] = [];
    const categoryCounts = new Map<string, number>();
    const exactShipCandidates = rankedCandidates.filter(
        (candidate) => classifyReferenceMatchLevel(campaign, candidate.title, candidate.contextUrl) === 'exact_ship'
    );
    const sameClassCandidates = rankedCandidates.filter(
        (candidate) => classifyReferenceMatchLevel(campaign, candidate.title, candidate.contextUrl) === 'same_class'
    );
    const candidatePasses = exactShipCandidates.length > 0
        ? [exactShipCandidates, sameClassCandidates]
        : [sameClassCandidates];

    for (const candidatePass of candidatePasses) {
        for (const candidate of candidatePass) {
            const currentCount = categoryCounts.get(candidate.category) ?? 0;
            if (currentCount >= maxPerCategory) {
                continue;
            }

            categoryCounts.set(candidate.category, currentCount + 1);
            limitedCandidates.push(candidate);
        }
    }

    return limitedCandidates;
}

function inferReferenceMimeType(candidate: ShipReferenceCandidate): string {
    const lowerUrl = candidate.imageUrl.toLowerCase();
    if (lowerUrl.includes('.png')) {
        return 'image/png';
    }
    if (lowerUrl.includes('.webp')) {
        return 'image/webp';
    }
    return 'image/jpeg';
}

function buildExternalReferenceAssetRecord(
    campaign: Campaign,
    candidate: ShipReferenceCandidate,
    assetId: string,
    reviewStatus: AssetRecord['reviewStatus'],
): AssetRecord {
    const matchLevel = classifyReferenceMatchLevel(campaign, candidate.title, candidate.contextUrl);

    return {
        assetId,
        assetType: 'ship_reference_image',
        url: candidate.imageUrl,
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
        fileSizeBytes: 0,
        mimeType: inferReferenceMimeType(candidate),
        tags: ['ship-reference', candidate.category, 'reference', buildReferenceMatchTag(matchLevel)],
        createdAt: new Date().toISOString(),
        reviewStatus,
        version: 1,
        active: true,
        ...(buildCurationFromCandidateAI(candidate) ? { curation: buildCurationFromCandidateAI(candidate) } : {}),
    };
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
        ...(buildCurationFromCandidateAI(candidate) ? { curation: buildCurationFromCandidateAI(candidate) } : {}),
    };

    await saveAssetRecord(slug, record);
    return record;
}

export async function importShipReferenceAssets(slug: string, campaign: Campaign, candidates: ReadonlyArray<ShipReferenceCandidate>): Promise<AssetRecord[]> {
    const existingRecords = await getAssetsByType(slug, 'ship_reference_image');
    const nextIndex = existingRecords.reduce((maxIndex, record) => {
        const match = record.assetId.match(/^img_ship_reference_(\d+)$/);
        const parsedIndex = match ? Number(match[1]) : 0;
        return Math.max(maxIndex, parsedIndex);
    }, 0);

    const importResults = await Promise.allSettled(
        candidates.map((candidate, index) => {
            const assetId = `img_ship_reference_${String(nextIndex + index + 1).padStart(3, '0')}`;
            return importCandidateAsAsset(slug, candidate, 'ship_reference_image', assetId, 'needs_review');
        })
    );

    const records: AssetRecord[] = [];
    for (const result of importResults) {
        if (result.status === 'fulfilled') {
            records.push(result.value);
        } else {
            console.warn('[ShipReferenceService] Failed to import candidate — skipping', {
                error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            });
        }
    }
    return records;
}

export function assetRecordToShipReferenceCandidate(record: AssetRecord): ShipReferenceCandidate | null {
    if (record.assetType !== 'ship_reference_image') {
        return null;
    }

    const category = record.tags.find((tag) => tag !== 'ship-reference' && tag !== 'reference') ?? 'exterior';

    return {
        title: record.promptUsed || record.assetId,
        imageUrl: record.url,
        thumbnailUrl: record.sourceThumbnailUrl || record.url,
        contextUrl: record.sourcePageUrl || record.url,
        width: record.dimensions?.width ?? 0,
        height: record.dimensions?.height ?? 0,
        category,
        query: record.sourceQuery || '',
        selectionScore: record.selectionScore ?? 0,
    };
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
    const heroErrors: string[] = [];
    for (let index = 0; index < selectedCandidates.length; index += 1) {
        if (records.length >= maxHeroCount) {
            break;
        }

        const candidate = selectedCandidates[index];
        try {
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
        } catch (error) {
            heroErrors.push(error instanceof Error ? error.message : String(error));
        }
    }

    if (records.length > 0) {
        return records;
    }

    const fallbackHeroes = await generateHeroImages(brief, shipName, maxHeroCount);
    for (const hero of fallbackHeroes) {
        if (await isNearDuplicateHero(hero.buffer, acceptedHeroBuffers)) {
            continue;
        }

        const heroOrdinal = String(records.length + 1).padStart(3, '0');
        const assetId = `img_hero_${heroOrdinal}`;
        const fileName = `images/hero/hero_${heroOrdinal}_fallback.png`;
        const url = await storeAsset(slug, assetId, fileName, hero.buffer, 'image/png');
        const record: AssetRecord = {
            assetId,
            assetType: 'hero_image',
            url,
            generator: getMediaImageGeneratorService(),
            promptUsed: hero.prompt,
            fileSizeBytes: hero.buffer.length,
            mimeType: 'image/png',
            tags: ['hero', 'fallback'],
            createdAt: new Date().toISOString(),
            reviewStatus: 'needs_review',
            version: 1,
            active: true,
        };
        await saveAssetRecord(slug, record);
        acceptedHeroBuffers.push(hero.buffer);
        records.push(record);

        if (records.length >= maxHeroCount) {
            break;
        }
    }

    if (records.length === 0 && heroErrors.length > 0) {
        throw new Error(`Failed to generate hero images: ${heroErrors.join(' | ')}`);
    }

    return records;
}
