/**
 * Niche-to-Cruise-Line Affinity Resolver
 *
 * Loads the niche-line-affinity.json knowledgebase and exposes a single
 * scoring function used by cb-inventory-matcher.ts to boost or penalize
 * inventory candidates based on how well a cruise line fits a campaign's theme.
 */

import type { Campaign } from './types';
import affinityData from './niche-line-affinity.json';

const AVOID_LINE_PENALTY = -25;

type VendorNormEntry = { canonical: string; prefixes: string[] };
type PreferredLineEntry = { line: string; affinityScore: number; rationale: string };
type NicheAffinityEntry = {
    id: string;
    labels: string[];
    preferredLines: PreferredLineEntry[];
    avoidLines: string[];
};

const vendorNormEntries = affinityData.vendorNormalization as VendorNormEntry[];
const nicheAffinities = affinityData.nicheAffinities as NicheAffinityEntry[];

// ─── Vendor Normalization ─────────────────────────────────────────────────────

/**
 * Maps a raw CB vendor string (potentially truncated with "…") to its
 * canonical name used in niche-line-affinity.json.
 *
 * Example: "Royal Caribbean …" → "Royal Caribbean International"
 */
export function normalizeVendorName(rawVendor: string): string {
    if (!rawVendor) return '';
    const cleaned = rawVendor.replace(/[…\.]+$/, '').trim().toLowerCase();

    for (const entry of vendorNormEntries) {
        for (const prefix of entry.prefixes) {
            if (cleaned.startsWith(prefix.toLowerCase())) {
                return entry.canonical;
            }
        }
    }
    return rawVendor.trim();
}

// ─── Signal Extraction ────────────────────────────────────────────────────────

/**
 * Extracts a combined lowercase text blob from the campaign's niche signals:
 * name, description, aesthetic, targetingKeywords, and highlightEvents.
 */
function extractCampaignSignalText(campaign: Campaign): string {
    const parts: string[] = [
        campaign.name ?? '',
        campaign.description ?? '',
        campaign.aesthetic ?? '',
        ...(campaign.targetingKeywords ?? []),
        ...(campaign.highlightEvents ?? []),
    ];
    return parts.join(' ').toLowerCase();
}

// ─── Affinity Scoring ─────────────────────────────────────────────────────────

/**
 * Returns a niche affinity score for the given raw vendor string against
 * a campaign's theme/niche signals.
 *
 * Positive score  → line fits the niche well (boost)
 * Negative score  → line is a poor fit (penalty)
 * Zero            → no niche match detected, neutral
 */
export function getNicheAffinityScore(campaign: Campaign, rawVendor: string): number {
    const canonicalVendor = normalizeVendorName(rawVendor);
    if (!canonicalVendor) return 0;

    const signalText = extractCampaignSignalText(campaign);
    if (!signalText.trim()) return 0;

    let totalScore = 0;

    for (const niche of nicheAffinities) {
        const hasNicheMatch = niche.labels.some((label) => signalText.includes(label.toLowerCase()));
        if (!hasNicheMatch) continue;

        const preferredEntry = niche.preferredLines.find(
            (entry) => entry.line === canonicalVendor,
        );
        if (preferredEntry) {
            totalScore += preferredEntry.affinityScore;
            continue;
        }

        if (niche.avoidLines.includes(canonicalVendor)) {
            totalScore += AVOID_LINE_PENALTY;
        }
    }

    return totalScore;
}

/**
 * Returns a human-readable summary of which niches matched and why,
 * used for debug logging in the matcher.
 */
export function describeNicheAffinityMatch(campaign: Campaign, rawVendor: string): string {
    const canonicalVendor = normalizeVendorName(rawVendor);
    if (!canonicalVendor) return 'no vendor';

    const signalText = extractCampaignSignalText(campaign);
    const matchedNiches: string[] = [];

    for (const niche of nicheAffinities) {
        const hasNicheMatch = niche.labels.some((label) => signalText.includes(label.toLowerCase()));
        if (!hasNicheMatch) continue;

        const preferredEntry = niche.preferredLines.find((e) => e.line === canonicalVendor);
        if (preferredEntry) {
            matchedNiches.push(`${niche.id}(+${preferredEntry.affinityScore})`);
        } else if (niche.avoidLines.includes(canonicalVendor)) {
            matchedNiches.push(`${niche.id}(${AVOID_LINE_PENALTY})`);
        }
    }

    return matchedNiches.length > 0
        ? `${canonicalVendor}: ${matchedNiches.join(', ')}`
        : `${canonicalVendor}: no niche match`;
}
