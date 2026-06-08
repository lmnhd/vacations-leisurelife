import sharp from 'sharp';
import { Campaign } from '../types';
import { AssetCuration, AssetRecord, CampaignAestheticBrief, GeneratorService, ShipReferenceCandidate } from '../schema';
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
import { PRIMARY_IMAGE_BACKEND_ID } from './generators/image-backend-meta';
import {
    getShipFamilyKeywords,
    getSiblingShipNames,
    metadataSupportsShipLandscapeFeature,
} from './ship-environment-profile';
import {
    findMentionedKnownShips,
    normalizeShipNameText,
    normalizeSpecificShipName,
} from '../ship-names';

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

const SHIP_REFERENCE_SEARCH_RESULTS_PER_QUERY = Number(
    process.env.SHIP_REFERENCE_SEARCH_RESULTS_PER_QUERY ?? '48'
);
const ENABLE_REFERENCE_VISION_EVALUATION = process.env.ENABLE_REFERENCE_VISION_EVALUATION !== 'false';
const MAX_REFERENCE_VISION_EVAL_PER_CATEGORY = Math.max(
    1,
    Number(process.env.MAX_REFERENCE_VISION_EVAL_PER_CATEGORY ?? '4')
);

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
    return normalizeShipNameText(value);
}

function buildShipIdentityTag(shipName: string): string {
    return `ship:${normalizeSpecificShipName(shipName) ?? normalizeText(shipName).replace(/\s+/g, '-')}`;
}

function getSpecificShipConflict(campaign: Campaign): { target: string; matched: string } | null {
    const target = normalizeSpecificShipName(campaign.shipTarget);
    const matched = normalizeSpecificShipName(campaign.matchedShipName);
    if (target && matched && target !== matched) {
        return { target, matched };
    }
    return null;
}

export function assertShipReferenceIdentityIsConsistent(campaign: Campaign): void {
    const conflict = getSpecificShipConflict(campaign);
    if (!conflict) {
        return;
    }

    throw new Error(
        `Ship reference discovery blocked: campaign shipTarget is "${campaign.shipTarget}" but matchedShipName is "${campaign.matchedShipName}". ` +
        'Resolve the ship metadata conflict before generating references so stale ship photos cannot seed media.'
    );
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

export function resolveShipReferenceShipName(campaign: Campaign): string {
    assertShipReferenceIdentityIsConsistent(campaign);

    const matchedShipName = campaign.matchedShipName?.trim();
    if (matchedShipName) {
        return matchedShipName;
    }
    const shipTarget = campaign.shipTarget?.trim();
    if (shipTarget) {
        return shipTarget;
    }
    throw new Error(`Campaign ${campaign.id} does not have a matched ship or ship target for reference discovery`);
}

function getResolvedShipName(campaign: Campaign): string {
    return resolveShipReferenceShipName(campaign);
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
    
    const queries: Array<{ category: string; query: string }> = [
        { category: 'exterior', query: `${sharedPrefix} cruise ship exterior professional photo` },
        { category: 'exterior', query: `${sharedPrefix} ship sailing open ocean` },
        { category: 'pool_deck', query: `${sharedPrefix} pool deck cruise ship photo` },
        { category: 'pool_deck', query: `${sharedPrefix} lido deck swimming pool` },
        { category: 'dining', query: `${sharedPrefix} dining room cruise ship photo` },
        { category: 'dining', query: `${sharedPrefix} specialty restaurant interior` },
        { category: 'stateroom', query: `${sharedPrefix} stateroom cabin cruise ship photo` },
        { category: 'stateroom', query: `${sharedPrefix} suite with balcony interior` },
        { category: 'atrium', query: `${sharedPrefix} atrium interior cruise ship photo` },
        { category: 'atrium', query: `${sharedPrefix} central promenade hall` },
        { category: 'destination_view', query: `${sharedPrefix} deck ocean view cruise ship photo` },
        { category: 'destination_view', query: `${sharedPrefix} cruise balcony ocean sunset` },
    ];

    if (campaign.targetDestination) {
        const dest = campaign.targetDestination;
        queries.push(
            { category: 'offboard_excursion', query: `${dest} cruise excursion beautiful travel photo` },
            { category: 'offboard_excursion', query: `${dest} famous landmark travel photography` },
            { category: 'offboard_excursion', query: `${dest} sunny tourist destination scenery` }
        );
    }

    return queries;
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

    if (category === 'offboard_excursion') {
        // Excursions don't need to match the ship name
        score += 100; // Base baseline score
        if (campaign.targetDestination && metadataHaystack.includes(normalizeText(campaign.targetDestination))) {
            score += 150; // Huge boost if destination actually matches
        }
    } else {
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
    category: string,
    title: string,
    contextUrl: string,
): boolean {
    const metadataHaystack = `${normalizeText(title)} ${normalizeText(contextUrl)}`;
    const shipName = getResolvedShipName(campaign);
    const resolvedSpecificShip = normalizeSpecificShipName(shipName);
    const mentionedKnownShips = findMentionedKnownShips(metadataHaystack);

    if (HARD_REJECT_REFERENCE_TERMS.some((term) => metadataHaystack.includes(term))) {
        return true;
    }

    if (
        resolvedSpecificShip
        && mentionedKnownShips.some((mentionedShip) => mentionedShip !== resolvedSpecificShip)
    ) {
        return true;
    }

    if (
        category !== 'offboard_excursion'
        && resolvedSpecificShip
        && mentionedKnownShips.length > 0
        && !mentionedKnownShips.includes(resolvedSpecificShip)
    ) {
        return true;
    }

    if (
        LANDSCAPE_MISMATCH_TERMS.some((term) => metadataHaystack.includes(term))
        && !metadataSupportsShipLandscapeFeature(shipName, metadataHaystack)
    ) {
        return true;
    }

    return false;
}

function shouldRejectKnownBadImageUrl(imageUrl: string): boolean {
    const normalizedUrl = imageUrl.toLowerCase();

    // Google Images can surface Instagram crawler endpoints that return HTML, not image bytes.
    if (normalizedUrl.includes('lookaside.instagram.com/seo/google_widget/crawler/')) {
        return true;
    }

    // TikTok image API endpoints require cookie auth and always 403 from a server-side fetch.
    if (normalizedUrl.includes('tiktok.com/api/img/')) {
        return true;
    }

    // Pinterest and Facebook use CDN token-signing that expires or is referrer-locked.
    if (normalizedUrl.includes('pinimg.com') && normalizedUrl.includes('?')) {
        return true;
    }
    if (normalizedUrl.includes('fbcdn.net')) {
        return true;
    }

    // Facebook lookaside / photo.php endpoints return an HTML redirect page
    // (200 OK, text/html) rather than image bytes. Google Images surfaces these
    // both as page URLs (facebook.com/photo, from_lookaside=1) and as the
    // crawler media host `lookaside.fbsbx.com`, which likewise serves HTML or
    // 0-byte responses to server-side fetches. Rehosting them produces poisoned
    // references (HTML under a `.jpg` key, or a blank external record) that fail
    // every downstream fetch.
    if (
        normalizedUrl.includes('lookaside.facebook.com')
        || normalizedUrl.includes('lookaside.fbsbx.com')
        || normalizedUrl.includes('fbsbx.com')
        || normalizedUrl.includes('facebook.com/photo')
        || normalizedUrl.includes('from_lookaside=1')
    ) {
        return true;
    }

    return false;
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
        generationLocked: false,
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
            response: await searchGoogleImages(queryConfig.query, SHIP_REFERENCE_SEARCH_RESULTS_PER_QUERY, 'any'),
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

            if (shouldRejectKnownBadImageUrl(result.imageUrl)) {
                continue;
            }

            if (shouldHardRejectReferenceCandidate(campaign, queryConfig.category, result.title, result.contextUrl)) {
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

    if (ENABLE_REFERENCE_VISION_EVALUATION) {
        const visionSettled = await Promise.allSettled(
            Array.from(categoryCandidateGroups.entries()).map(async ([category, batch]) => {
                const rankedBatch = [...batch]
                    .sort((leftCandidate, rightCandidate) => computeFinalRankScore(rightCandidate) - computeFinalRankScore(leftCandidate))
                    .slice(0, MAX_REFERENCE_VISION_EVAL_PER_CATEGORY);

                return {
                    category,
                    batch: rankedBatch,
                    survivors: await applyVisionEvaluationToCategory(rankedBatch, shipNameForVision),
                };
            })
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
    } else {
        console.log('[ShipReferenceService] Vision evaluation disabled for ship reference discovery; using heuristic ranking only.', {
            campaignId: campaign.id,
            categories: categoryCandidateGroups.size,
        });
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
    const genericCruiseCandidates = rankedCandidates.filter(
        (candidate) => classifyReferenceMatchLevel(campaign, candidate.title, candidate.contextUrl) === 'generic_cruise'
    );
    const candidatePasses = exactShipCandidates.length > 0
        ? [exactShipCandidates, sameClassCandidates, genericCruiseCandidates]
        : [sameClassCandidates, genericCruiseCandidates];

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

/**
 * Detect a real image format from a buffer's magic bytes. Third-party sources
 * (and Google Image redirects) frequently return HTML error/redirect pages with
 * a 200 status, so the HTTP content-type header alone cannot be trusted before
 * we persist bytes to storage. Returns null when the buffer is not a known image.
 */
/**
 * Thrown when a fetched reference body is confirmed to be non-image bytes (e.g.
 * an HTML redirect page). Unlike a transient network failure, this candidate is
 * permanently unusable, so the importer skips it entirely rather than falling
 * back to an external record that would still point at the bad URL.
 */
class NonImageReferenceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NonImageReferenceError';
    }
}

function detectImageMimeFromBytes(buf: Buffer): string | null {
    if (buf.length < 12) return null;
    // JPEG: FF D8 FF
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
    // PNG: 89 50 4E 47
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
    // GIF: GIF8
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
    // WebP: RIFF????WEBP
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
    return null;
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
    const shipName = getResolvedShipName(campaign);
    const matchLevel = classifyReferenceMatchLevel(campaign, candidate.title, candidate.contextUrl);

    return {
        assetId,
        assetType: 'ship_reference_image',
        url: candidate.imageUrl,
        generator: 'serpapi',
        promptUsed: candidate.title,
        sourceImageUrl: candidate.imageUrl,
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
        tags: ['ship-reference', candidate.category, 'reference', buildReferenceMatchTag(matchLevel), buildShipIdentityTag(shipName)],
        createdAt: new Date().toISOString(),
        reviewStatus,
        version: 1,
        active: true,
        ...(buildCurationFromCandidateAI(candidate) ? { curation: buildCurationFromCandidateAI(candidate) } : {}),
    };
}

// Phase 8 (IMAGE_GEN_REVAMP_5-26): downscale-on-import.
// Reference images come from third parties and can exceed both the Anthropic
// vision API limit (5 MB) and the DynamoDB storage fallback (350 KB). We
// resize on import so the bytes we persist are guaranteed fetchable, vision-
// safe, and quick to load at generation time. Long-edge 1920px, JPEG q80 is
// the Phase 8 target — comfortably under 5 MB for ordinary photos and large
// enough that Nano-Banana's downstream 1280px reference resize still has
// detail to work with.
const REFERENCE_STORE_MAX_DIMENSION = 1920;
const REFERENCE_STORE_JPEG_QUALITY = 80;
const REFERENCE_PNG_PASSTHROUGH_LIMIT_BYTES = 2 * 1024 * 1024; // 2 MB

async function normalizeReferenceImageForStorage(
    sourceBuffer: Buffer,
    sourceMimeType: string,
): Promise<{ buffer: Buffer; mimeType: string; width?: number; height?: number }> {
    if (!sourceMimeType.startsWith('image/')) {
        return { buffer: sourceBuffer, mimeType: sourceMimeType };
    }

    try {
        const pipeline = sharp(sourceBuffer).rotate();
        const metadata = await pipeline.metadata();
        const width = metadata.width ?? 0;
        const height = metadata.height ?? 0;
        const longEdge = Math.max(width, height);
        const needsResize = longEdge > REFERENCE_STORE_MAX_DIMENSION;

        // Preserve PNG alpha when the source is small enough to keep as-is.
        const isSmallPng = sourceMimeType === 'image/png'
            && metadata.hasAlpha === true
            && !needsResize
            && sourceBuffer.length <= REFERENCE_PNG_PASSTHROUGH_LIMIT_BYTES;
        if (isSmallPng) {
            return { buffer: sourceBuffer, mimeType: 'image/png', width, height };
        }

        const resized = needsResize
            ? pipeline.resize({
                width: REFERENCE_STORE_MAX_DIMENSION,
                height: REFERENCE_STORE_MAX_DIMENSION,
                fit: 'inside',
                withoutEnlargement: true,
            })
            : pipeline;

        const finalBuffer = await resized
            .jpeg({ quality: REFERENCE_STORE_JPEG_QUALITY, mozjpeg: true })
            .toBuffer();
        const finalMeta = await sharp(finalBuffer).metadata();
        return {
            buffer: finalBuffer,
            mimeType: 'image/jpeg',
            width: finalMeta.width,
            height: finalMeta.height,
        };
    } catch (error) {
        console.warn('[ShipReferenceService] sharp normalize failed — storing original bytes', {
            sourceMimeType,
            sourceBytes: sourceBuffer.length,
            error: error instanceof Error ? error.message : String(error),
        });
        return { buffer: sourceBuffer, mimeType: sourceMimeType };
    }
}

async function importCandidateAsAsset(
    slug: string,
    campaign: Campaign,
    candidate: ShipReferenceCandidate,
    assetType: 'ship_reference_image' | 'hero_image',
    assetId: string,
    reviewStatus: AssetRecord['reviewStatus'],
): Promise<AssetRecord> {
    try {
        const response = await fetch(candidate.imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch ship reference image (${response.status}): ${candidate.imageUrl}`);
        }

        const rawMimeType = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
        const rawBuffer = Buffer.from(await response.arrayBuffer());

        // Validate that the bytes are actually an image before we persist them.
        // Sources like Facebook lookaside/photo.php return a 200 OK HTML redirect
        // page instead of image bytes; storing those poisons R2 with HTML under a
        // `.jpg` key that fails every downstream fetch with a content-type error.
        // We trust magic bytes over the (often wrong) content-type header.
        const detectedMime = detectImageMimeFromBytes(rawBuffer);
        if (!detectedMime) {
            throw new NonImageReferenceError(
                `Fetched reference is not an image (content-type "${rawMimeType}", ${rawBuffer.length} bytes): ${candidate.imageUrl}`
            );
        }

        // Phase 8: normalize (downscale + recompress) BEFORE storage. Prevents
        // the 5 MB Anthropic limit and the 350 KB DynamoDB fallback from
        // pushing us to the external-record fallback for large references.
        const normalized = await normalizeReferenceImageForStorage(rawBuffer, detectedMime);
        const mimeType = normalized.mimeType;
        const buffer = normalized.buffer;
        const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
        const fileName = assetType === 'ship_reference_image'
            ? `images/references/${assetId}.${extension}`
            : `images/hero/${assetId}.${extension}`;
        const url = await storeAsset(slug, assetId, fileName, buffer, mimeType);

        const shipName = getResolvedShipName(campaign);
        const matchLevel = classifyReferenceMatchLevel(campaign, candidate.title, candidate.contextUrl);
        const record: AssetRecord = {
            assetId,
            assetType,
            url,
            generator: 'serpapi',
            promptUsed: candidate.title,
            sourceImageUrl: candidate.imageUrl,
            sourcePageUrl: candidate.contextUrl,
            sourceThumbnailUrl: candidate.thumbnailUrl,
            sourceQuery: candidate.query,
            selectionScore: candidate.selectionScore,
            dimensions: {
                width: normalized.width ?? candidate.width,
                height: normalized.height ?? candidate.height,
            },
            fileSizeBytes: buffer.length,
            mimeType,
            tags: [
                'ship-reference',
                candidate.category,
                assetType === 'hero_image' ? 'hero' : 'reference',
                buildReferenceMatchTag(matchLevel),
                buildShipIdentityTag(shipName),
            ],
            createdAt: new Date().toISOString(),
            reviewStatus,
            version: 1,
            active: true,
            ...(buildCurationFromCandidateAI(candidate) ? { curation: buildCurationFromCandidateAI(candidate) } : {}),
        };

        await saveAssetRecord(slug, record);
        return record;
    } catch (error) {
        // Confirmed non-image bytes (e.g. an HTML redirect page): the candidate is
        // permanently unusable. Skip it rather than persisting an external record
        // that would still point at the bad URL and render as a blank tile.
        if (error instanceof NonImageReferenceError) {
            console.warn('[ShipReferenceService] Skipping non-image reference candidate', {
                assetId,
                imageUrl: candidate.imageUrl,
                contextUrl: candidate.contextUrl,
                error: error.message,
            });
            throw error;
        }

        // Transient failure (network error, sharp hiccup, storage blip): preserve
        // the external candidate so a later fetch can still succeed.
        console.warn('[ShipReferenceService] Rehosting failed; preserving external reference candidate', {
            assetId,
            imageUrl: candidate.imageUrl,
            contextUrl: candidate.contextUrl,
            error: error instanceof Error ? error.message : String(error),
        });

        const externalRecord = buildExternalReferenceAssetRecord(campaign, candidate, assetId, reviewStatus);
        await saveAssetRecord(slug, externalRecord);
        return externalRecord;
    }
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
            return importCandidateAsAsset(slug, campaign, candidate, 'ship_reference_image', assetId, 'needs_review');
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

/**
 * Phase 8 (IMAGE_GEN_REVAMP_5-26): pick the URL we can actually fetch at
 * generation time.
 *
 * Before Phase 8, this function preferred record.sourceImageUrl (the
 * original third-party URL) over record.url (our rehosted R2/storage URL).
 * That single line caused every successfully-rehosted reference to STILL be
 * fetched from its flaky third-party source — geo-blocked CDNs, anti-
 * hotlinking, expired URLs — and the scene generator silently degraded to
 * text-only output when those fetches failed.
 *
 * Phase 8 reverses the preference: use our storage URL unless it's an
 * "r2://pending:" placeholder, in which case rehosting did not produce
 * usable bytes and we fall back to the third-party URL.
 */
export function selectFetchableReferenceUrl(record: AssetRecord): string {
    if (record.url && !record.url.startsWith('r2://pending:')) {
        return record.url;
    }
    return record.sourceImageUrl || record.url;
}

export function assetRecordToShipReferenceCandidate(record: AssetRecord): ShipReferenceCandidate | null {
    if (record.assetType !== 'ship_reference_image') {
        return null;
    }

    const category = record.tags.find((tag) =>
        tag !== 'ship-reference'
        && tag !== 'reference'
        && !tag.startsWith('match:')
        && !tag.startsWith('ship:')
    ) ?? 'exterior';
    const fetchableUrl = selectFetchableReferenceUrl(record);

    return {
        title: record.promptUsed || record.assetId,
        imageUrl: fetchableUrl,
        thumbnailUrl: record.sourceThumbnailUrl || fetchableUrl,
        contextUrl: record.sourcePageUrl || record.url,
        width: record.dimensions?.width ?? 0,
        height: record.dimensions?.height ?? 0,
        category,
        query: record.sourceQuery || '',
        selectionScore: record.selectionScore ?? 0,
    };
}

export function filterShipReferenceRecordsForCampaign(
    campaign: Campaign,
    records: readonly AssetRecord[],
): AssetRecord[] {
    const shipName = getResolvedShipName(campaign);
    const resolvedSpecificShip = normalizeSpecificShipName(shipName);
    const expectedShipTag = buildShipIdentityTag(shipName);

    return records.filter((record) => {
        if (record.assetType !== 'ship_reference_image' || record.active === false) {
            return false;
        }

        if (record.tags.includes(expectedShipTag)) {
            return true;
        }

        const metadata = [
            record.promptUsed,
            record.sourcePageUrl,
            record.sourceImageUrl,
            record.sourceQuery,
        ].filter(Boolean).join(' ');
        const mentionedShips = findMentionedKnownShips(metadata);

        if (resolvedSpecificShip && mentionedShips.some((ship) => ship !== resolvedSpecificShip)) {
            return false;
        }

        const candidate = assetRecordToShipReferenceCandidate(record);
        if (!candidate) {
            return false;
        }

        if (candidate.category === 'offboard_excursion') {
            return mentionedShips.length === 0 || !resolvedSpecificShip || mentionedShips.includes(resolvedSpecificShip);
        }

        return classifyReferenceMatchLevel(campaign, candidate.title, candidate.contextUrl) !== 'generic_cruise';
    });
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

// MULTI_MODEL_IMAGES (Phase F): hero import is variant-aware. Per accepted hero
// the PRIMARY (Gemini) variant drives near-duplicate detection + the logical
// hero ordinal/cap; all model-versions of that hero share `variantGroupId =
// img_hero_NNN` and are persisted alongside. With one active backend this is a
// single-member group ⇒ identical to the legacy single-model output.
export async function importHeroAssetsFromReferences(
    slug: string,
    campaign: Campaign,
    brief: CampaignAestheticBrief,
    candidates: ReadonlyArray<ShipReferenceCandidate>,
    maxHeroCount: number = 5,
    models?: GeneratorService[],
): Promise<AssetRecord[]> {
    const selectedCandidates = selectHeroCandidates(candidates, Math.min(candidates.length, maxHeroCount + 4));
    const shipName = getResolvedShipName(campaign);
    const records: AssetRecord[] = [];
    const acceptedHeroBuffers: Buffer[] = [];
    const heroErrors: string[] = [];
    let acceptedHeroCount = 0;

    // Pick the canonical (primary) variant from a group for dedup/ordinal logic.
    const pickPrimary = (images: { generator: GeneratorService; buffer: Buffer }[]) =>
        images.find((img) => img.generator === PRIMARY_IMAGE_BACKEND_ID) ?? images[0];

    for (let index = 0; index < selectedCandidates.length; index += 1) {
        if (acceptedHeroCount >= maxHeroCount) {
            break;
        }

        const candidate = selectedCandidates[index];
        try {
            const { images: heroVariants, warnings } = await generateReferenceGroundedHeroImages(
                brief, shipName, candidate, acceptedHeroCount, models,
            );
            heroErrors.push(...warnings);
            const primary = pickPrimary(heroVariants);
            if (!primary) {
                continue;
            }
            // Dedup on the primary variant only — the OpenAI version of the same
            // hero is expected to differ and must not be independently rejected.
            if (await isNearDuplicateHero(primary.buffer, acceptedHeroBuffers)) {
                continue;
            }

            const heroOrdinal = String(acceptedHeroCount + 1).padStart(3, '0');
            const variantGroupId = `img_hero_${heroOrdinal}`;
            for (const variant of heroVariants) {
                const assetId = `${variantGroupId}__${variant.generator}`;
                const fileName = `images/hero/hero_${heroOrdinal}_embellished__${variant.generator}.png`;
                const url = await storeAsset(slug, assetId, fileName, variant.buffer, 'image/png');
                const record: AssetRecord = {
                    assetId,
                    assetType: 'hero_image',
                    url,
                    generator: variant.generator,
                    variantGroupId,
                    promptUsed: variant.prompt,
                    sourcePageUrl: candidate.contextUrl,
                    sourceThumbnailUrl: candidate.thumbnailUrl,
                    sourceQuery: candidate.query,
                    selectionScore: scoreHeroCandidate(candidate),
                    dimensions: {
                        width: candidate.width,
                        height: candidate.height,
                    },
                    fileSizeBytes: variant.buffer.length,
                    mimeType: 'image/png',
                    tags: ['ship-reference', candidate.category, 'hero', 'embellished'],
                    createdAt: new Date().toISOString(),
                    reviewStatus: 'needs_review',
                    version: 1,
                    active: true,
                };
                await saveAssetRecord(slug, record);
                records.push(record);
            }
            acceptedHeroBuffers.push(primary.buffer);
            acceptedHeroCount += 1;
        } catch (error) {
            heroErrors.push(error instanceof Error ? error.message : String(error));
        }
    }

    if (records.length > 0) {
        return records;
    }

    const { images: fallbackHeroes, warnings: fallbackWarnings } = await generateHeroImages(
        brief, shipName, maxHeroCount, models,
    );
    heroErrors.push(...fallbackWarnings);

    // Group fallback variants by their variantGroupId so dedup runs on the
    // primary member and all members of an accepted hero are stored together.
    const fallbackGroups = new Map<string, typeof fallbackHeroes>();
    for (const hero of fallbackHeroes) {
        const batch = fallbackGroups.get(hero.variantGroupId) ?? [];
        batch.push(hero);
        fallbackGroups.set(hero.variantGroupId, batch);
    }

    for (const [, groupVariants] of fallbackGroups) {
        if (acceptedHeroCount >= maxHeroCount) {
            break;
        }
        const primary = pickPrimary(groupVariants);
        if (!primary || await isNearDuplicateHero(primary.buffer, acceptedHeroBuffers)) {
            continue;
        }

        const heroOrdinal = String(acceptedHeroCount + 1).padStart(3, '0');
        const variantGroupId = `img_hero_${heroOrdinal}`;
        for (const variant of groupVariants) {
            const assetId = `${variantGroupId}__${variant.generator}`;
            const fileName = `images/hero/hero_${heroOrdinal}_fallback__${variant.generator}.png`;
            const url = await storeAsset(slug, assetId, fileName, variant.buffer, 'image/png');
            const record: AssetRecord = {
                assetId,
                assetType: 'hero_image',
                url,
                generator: variant.generator,
                variantGroupId,
                promptUsed: variant.prompt,
                fileSizeBytes: variant.buffer.length,
                mimeType: 'image/png',
                tags: ['hero', 'fallback'],
                createdAt: new Date().toISOString(),
                reviewStatus: 'needs_review',
                version: 1,
                active: true,
            };
            await saveAssetRecord(slug, record);
            records.push(record);
        }
        acceptedHeroBuffers.push(primary.buffer);
        acceptedHeroCount += 1;
    }

    if (records.length === 0 && heroErrors.length > 0) {
        throw new Error(`Failed to generate hero images: ${heroErrors.join(' | ')}`);
    }

    return records;
}
