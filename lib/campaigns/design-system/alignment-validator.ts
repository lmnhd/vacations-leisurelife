import type { CampaignAestheticBrief } from '../schema';
import type { Campaign } from '../types';
import { buildCampaignIdentityBlueprint } from './identity-blueprint';

export interface AlignmentDriftIssue {
    code: string;
    message: string;
    severity: 'warning' | 'blocker';
    autoFixable: boolean;
}

function buildAlignmentText(brief: CampaignAestheticBrief): string {
    return [
        brief.visual.imageryMood,
        brief.visual.lightingStyle,
        brief.visual.compositionNotes,
        brief.messaging.heroSlogan,
        brief.messaging.subSlogan,
        brief.messaging.elevatorPitch,
        brief.messaging.voicePersona,
        brief.communityExpression.corePromise,
        brief.communityExpression.socialGravity,
        brief.communityExpression.visualTogethernessNotes,
        brief.socialConcepts.facebookAd.headline,
        brief.socialConcepts.facebookAd.primaryText,
        brief.socialConcepts.facebookAd.visualDescription,
        brief.socialConcepts.instagramFeed.singlePostConcept,
        brief.socialConcepts.instagramFeed.caption,
        brief.audio.musicMood,
    ].filter(Boolean).join(' ').toLowerCase();
}

function includesAny(text: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(text));
}

function phraseLikelyPresent(sourceText: string, phrase: string): boolean {
    const words = phrase
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 3);
    if (words.length === 0) return false;
    return words.filter((word) => sourceText.includes(word)).length >= Math.min(2, words.length);
}

const SERENE_PATTERNS = [
    /\bquiet\b/i,
    /\bserene\b/i,
    /\bpeaceful\b/i,
    /\bspa\b/i,
    /\bbalcony\b/i,
    /\bbreakfast\b/i,
    /\bcontemplative\b/i,
    /\bslow\b/i,
    /\bstill(?:ness)?\b/i,
];

const ENERGETIC_PATTERNS = [
    /\bafter[- ]hours\b/i,
    /\bdance\b/i,
    /\bcrowd\b/i,
    /\bparty\b/i,
    /\bdj\b/i,
    /\bbeat\b/i,
    /\bbass\b/i,
    /\bclub\b/i,
    /\bopen[- ]deck\b/i,
];

const LOUD_VISUAL_PATTERNS = [
    /\bneon\b/i,
    /\bchaos\b/i,
    /\bcrowd surge\b/i,
    /\bmosh\b/i,
    /\bwild\b/i,
];

export function detectCampaignAlignmentDrift(
    brief: CampaignAestheticBrief,
    campaign?: Campaign | null,
): AlignmentDriftIssue[] {
    const issues: AlignmentDriftIssue[] = [];
    const blueprint = brief.identityBlueprint ?? buildCampaignIdentityBlueprint(brief, campaign);
    const sourceText = buildAlignmentText(brief);

    if (!brief.identityBlueprint) {
        issues.push({
            code: 'identity_blueprint_missing',
            message: 'identityBlueprint is missing; designed media will fall back to looser campaign inference.',
            severity: 'warning',
            autoFixable: false,
        });
    }

    if (
        (blueprint.energyMode === 'after_hours_electric' || blueprint.energyMode === 'nostalgic_kinetic')
        && includesAny(sourceText, SERENE_PATTERNS)
    ) {
        issues.push({
            code: 'energy_mode_visual_mismatch',
            message: `Campaign is modeled as ${blueprint.energyMode}, but the brief language still reads calm or serene rather than socially charged.`,
            severity: 'warning',
            autoFixable: false,
        });
    }

    if (
        (blueprint.energyMode === 'after_hours_electric' || blueprint.energyMode === 'nostalgic_kinetic')
        && /\bbalcony\b|\bserene\b|\bpremium calm\b|\bspa\b/i.test(sourceText)
    ) {
        issues.push({
            code: 'forbidden_default_drift',
            message: 'Brief language is drifting into serenity or balcony-luxury defaults that the campaign identity blueprint explicitly forbids.',
            severity: 'warning',
            autoFixable: false,
        });
    }

    if (
        (blueprint.energyMode === 'refined_premium' || blueprint.energyMode === 'calm_contemplative')
        && includesAny(sourceText, ENERGETIC_PATTERNS)
        && includesAny(sourceText, LOUD_VISUAL_PATTERNS)
    ) {
        issues.push({
            code: 'premium_mode_noise_drift',
            message: `Campaign is modeled as ${blueprint.energyMode}, but the brief language pushes toward loud or crowd-heavy visual treatment.`,
            severity: 'warning',
            autoFixable: false,
        });
    }

    if (
        blueprint.socialScale === 'crowd_ok'
        && /\bsolo\b|\bquiet pair\b|\bjust the two of\b/i.test(sourceText)
        && !includesAny(sourceText, ENERGETIC_PATTERNS)
    ) {
        issues.push({
            code: 'social_scale_underpowered',
            message: 'The identity blueprint allows crowd-level energy, but the brief language still implies an overly private social world.',
            severity: 'warning',
            autoFixable: false,
        });
    }

    const violatedDefaults = blueprint.forbiddenDefaults.filter((defaultPhrase) => phraseLikelyPresent(sourceText, defaultPhrase));
    if (violatedDefaults.length > 0 && !issues.some((issue) => issue.code === 'forbidden_default_drift')) {
        issues.push({
            code: 'forbidden_default_drift',
            message: `Brief text still contains campaign-forbidden default framing: ${violatedDefaults.join(', ')}.`,
            severity: 'warning',
            autoFixable: false,
        });
    }

    return issues;
}
