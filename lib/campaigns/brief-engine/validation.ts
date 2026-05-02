import type { CampaignAestheticBrief, ProductionBible } from '../schema';
import type { Campaign } from '../types';
import { getLaunchWindowAssessment, MINIMUM_CAMPAIGN_LEAD_DAYS } from '../launch-window';
import { detectCampaignAlignmentDrift } from '../design-system/alignment-validator';

// ────────────────────────────────────────────────────────────────────────────
// Consolidated validation — one pass, one result, one source of truth
// ────────────────────────────────────────────────────────────────────────────

const BANNED_WORKSHOP_PATTERNS = [/\bworkshop\b/i, /\bsalon\b/i, /hosted session/i, /event[- ]program/i, /managed program/i];
const BANNED_EXCLUSIVITY_PATTERNS = [/quiet-luxe/i, /elevated salon/i, /collector-grade/i, /rarefied/i];
const BANNED_CAMERA_MOVES = [/\bcrane\b/i, /\bdolly\b/i, /\btracking shot\b/i, /\bslider\b/i, /\bcable[- ]?cam\b/i];

// Generic cruise-brochure location defaults that carry no real scene moment
const GENERIC_SCENE_PATTERNS = [
    /^pool deck$/i,
    /^atrium$/i,
    /^dining room$/i,
    /^main dining$/i,
    /^buffet$/i,
    /^lido deck$/i,
    /^observation lounge$/i,
    /^spa$/i,
    /^sunset$/i,
    /^ocean view$/i,
    /^ship exterior$/i,
    /^promenade deck$/i,
];

const MIN_IMAGE_PROMPT_LENGTH = 60;

const REQUIRED_SAFETY_OPS = 'Passenger-area capture rules: max two-person crew, one off-frame spotter, off-peak capture only, maintain single-file keep-right flow, and stand down immediately if passenger traffic builds or flow is impeded.';

interface ValidationIssue {
    code: string;
    message: string;
    severity: 'blocker' | 'warning';
    autoFixable: boolean;
}

interface ValidationResult {
    passed: boolean;
    issues: ValidationIssue[];
    summary: string;
}

function textMatchesPatterns(text: string, patterns: RegExp[]): boolean {
    return patterns.some((p) => p.test(text));
}

function getExecutableProductionBibleTexts(bible: ProductionBible): string[] {
    const sceneTexts = bible.sceneLibrary.flatMap((scene) => [
        scene.location,
        scene.timeOfDay,
        scene.lighting,
        scene.cameraAngle,
        scene.subjectAction,
        scene.environmentDetails,
        scene.mood,
        scene.imagePrompt,
        scene.referenceCategory,
    ]);

    const storyboardTexts = bible.storyboards.flatMap((storyboard) => [
        storyboard.title,
        storyboard.narrationScript,
        storyboard.musicDirection,
        storyboard.editingStyle,
        ...storyboard.shotSequence.flatMap((shot) => [
            shot.cameraMovement,
            shot.subjectMotion,
            shot.environmentMotion,
            shot.transitionIn,
            shot.transitionOut,
            shot.emotionalBeat,
            shot.narrationSegment,
            shot.musicCue,
        ]),
    ]);

    return [...sceneTexts, ...storyboardTexts]
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}

function checkSceneLibraryMomentQuality(bible: ProductionBible): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    const emptyPromptScenes = bible.sceneLibrary.filter((scene) => !scene.imagePrompt || scene.imagePrompt.trim().length < MIN_IMAGE_PROMPT_LENGTH);
    if (emptyPromptScenes.length > 0) {
        issues.push({
            code: 'scene_image_prompt_empty',
            message: `${emptyPromptScenes.length} scene(s) have missing or too-short imagePrompt (min ${MIN_IMAGE_PROMPT_LENGTH} chars): ${emptyPromptScenes.map((s) => s.sceneId).join(', ')}. Regenerate the production bible.`,
            severity: 'blocker',
            autoFixable: false,
        });
    }

    const emptyActionScenes = bible.sceneLibrary.filter((scene) => !scene.subjectAction || scene.subjectAction.trim().length < 10);
    if (emptyActionScenes.length > 0) {
        issues.push({
            code: 'scene_missing_moment',
            message: `${emptyActionScenes.length} scene(s) have no subjectAction (moment description), making them location-only stills unsuitable for video: ${emptyActionScenes.map((s) => s.sceneId).join(', ')}.`,
            severity: 'warning',
            autoFixable: false,
        });
    }

    const genericLocationScenes = bible.sceneLibrary.filter((scene) =>
        GENERIC_SCENE_PATTERNS.some((pattern) => pattern.test(scene.location.trim()))
    );
    if (genericLocationScenes.length > 2) {
        issues.push({
            code: 'scene_generic_defaults',
            message: `${genericLocationScenes.length} scenes use generic cruise-brochure location names (pool deck, atrium, dining room, etc.) that signal no real moment. Regenerate with moment-first descriptions.`,
            severity: 'warning',
            autoFixable: false,
        });
    }

    return issues;
}

function checkProductionBibleFeasibility(bible: ProductionBible): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const executableTexts = getExecutableProductionBibleTexts(bible);
    const executableTextBlob = executableTexts.join(' ');

    if (executableTexts.some((text) => textMatchesPatterns(text, BANNED_CAMERA_MOVES))) {
        issues.push({ code: 'camera_move_feasibility', message: 'Forbidden camera moves (crane, dolly, tracking shot, slider, cable cam) found in production bible.', severity: 'blocker', autoFixable: true });
    }

    for (const sceneText of bible.sceneLibrary.map((scene) => `${scene.location} ${scene.environmentDetails} ${scene.imagePrompt}`)) {
        if (/interior\s+stateroom/i.test(sceneText) && /ocean[- ]?view|window/i.test(sceneText)) {
                issues.push({ code: 'cabin_type_plausibility', message: 'Interior stateroom paired with ocean-view or window language.', severity: 'blocker', autoFixable: true });
                break;
        }
    }

    if (/gangway\s+(exchange|handoff|choreograph)/i.test(executableTextBlob)) {
        issues.push({ code: 'gangway_exchange_prohibited', message: 'Gangway exchange choreography detected in production bible.', severity: 'blocker', autoFixable: true });
    }

    // TODO: Storyboard duration alignment
    for (const storyboard of bible.storyboards) {
        const shotDurationSum = storyboard.shotSequence.reduce((sum, shot) => sum + shot.durationSeconds, 0);
        if (shotDurationSum !== storyboard.totalDurationSeconds) {
            issues.push({
                code: 'storyboard_duration_alignment',
                message: `Storyboard "${storyboard.deliverableId}" shot durations sum to ${shotDurationSum}s but totalDurationSeconds is ${storyboard.totalDurationSeconds}s.`,
                severity: 'blocker',
                autoFixable: true,
            });
        }
    }

    // TODO: Safety-ops sentence
    if (!bible.globalDirectionNotes.includes(REQUIRED_SAFETY_OPS)) {
        issues.push({ code: 'production_safety_ops_missing', message: 'Required passenger-area capture rules sentence missing from globalDirectionNotes.', severity: 'blocker', autoFixable: true });
    }

    return issues;
}

function checkAvoidDirectiveCoverage(brief: CampaignAestheticBrief): ValidationIssue[] {
    if (!brief.productionBible) return [];

    const directives = brief.productionBible.avoidDirectives.join(' ').toLowerCase();
    const avoidedTerms = brief.visual.avoidList.map((i) => i.toLowerCase()).filter((i) => i.length >= 4);

    if (avoidedTerms.length > 0 && !avoidedTerms.some((term) => directives.includes(term))) {
        return [{ code: 'avoid_directives_too_weak', message: 'productionBible avoidDirectives do not reflect the brief avoidList.', severity: 'warning', autoFixable: false }];
    }
    return [];
}

export function validateBrief(brief: CampaignAestheticBrief, campaign: Campaign): ValidationResult {
    const issues: ValidationIssue[] = [];
    const briefText = JSON.stringify(brief);

    // ── Launch window ─────────────────────────────────────────────────────
    const launchWindow = getLaunchWindowAssessment({ matchedSailDate: campaign.matchedSailDate, targetDates: campaign.targetDates });
    if (launchWindow.meetsMinimumLeadTime === false) {
        issues.push({
            code: 'launch_window_violation',
            message: `Sailing is ${launchWindow.daysUntilSail} days away. Minimum required is ${MINIMUM_CAMPAIGN_LEAD_DAYS} days.`,
            severity: 'warning',
            autoFixable: false,
        });
    }

    // ── Workshop / exclusivity language ────────────────────────────────────
    if (textMatchesPatterns(briefText, BANNED_WORKSHOP_PATTERNS)) {
        issues.push({ code: 'workshop_language_survives', message: 'Workshop, salon, hosted-session, or event-program language appears in the brief.', severity: 'blocker', autoFixable: true });
    }
    if (textMatchesPatterns(briefText, BANNED_EXCLUSIVITY_PATTERNS)) {
        issues.push({ code: 'exclusive_lifestyle_language', message: 'Exclusive lifestyle-marketing language (quiet-luxe, elevated salon, collector-grade, rarefied) detected.', severity: 'blocker', autoFixable: true });
    }

    // ── Optionality ───────────────────────────────────────────────────────
    const optText = [brief.communityExpression.participationStyle, brief.communityExpression.copyFramingRule, ...brief.communityExpression.optionalGatherings].join(' ');
    if (!/\b(optional|drop[- ]in|drop[- ]out|join\s+or\s+skip|low[- ]pressure|welcome\s+to\s+(?:join|drop[- ]in))\b/i.test(optText)) {
        issues.push({ code: 'optionality_language_missing', message: 'communityExpression does not clearly signal optional, low-pressure participation.', severity: 'blocker', autoFixable: true });
    }

    // ── Hero slogan length ────────────────────────────────────────────────
    const heroWords = brief.messaging.heroSlogan.split(/\s+/).filter(Boolean).length;
    if (heroWords > 6) {
        issues.push({ code: 'hero_slogan_too_long', message: `Hero slogan is ${heroWords} words (max 6).`, severity: 'warning', autoFixable: true });
    }

    // ── Merch T-shirt first ───────────────────────────────────────────────
    if (!/t-?shirt/i.test(brief.merch.coreItem.productType)) {
        issues.push({ code: 'merch_not_tshirt_first', message: 'Merch core item is not T-shirt-first.', severity: 'blocker', autoFixable: true });
    }

    issues.push(...detectCampaignAlignmentDrift(brief, campaign));

    // ── Production artifacts ──────────────────────────────────────────────
    if (!brief.productionBible || !brief.landingStillBible) {
        issues.push({ code: 'production_artifacts_missing', message: 'Both productionBible and landingStillBible are required.', severity: 'blocker', autoFixable: false });
    } else {
        issues.push(...checkSceneLibraryMomentQuality(brief.productionBible));
        issues.push(...checkProductionBibleFeasibility(brief.productionBible));
        issues.push(...checkAvoidDirectiveCoverage(brief));
    }

    const blockerCount = issues.filter((i) => i.severity === 'blocker').length;
    const passed = blockerCount === 0;
    const summary = passed
        ? 'All structural checks passed. Brief is ready for media generation.'
        : `${blockerCount} blocker(s) found. ${issues.filter((i) => i.autoFixable).length} are auto-fixable.`;

    return { passed, issues, summary };
}

export type { ValidationIssue, ValidationResult };
