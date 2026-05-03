import type { CampaignAestheticBrief, ProductionBible, SceneSpec } from '../schema';
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

    // subjectAction must describe an actual moment — "pool deck" is a location, not a moment.
    // Blocking because a location-only scene produces a static image that cannot drive video.
    const emptyActionScenes = bible.sceneLibrary.filter((scene) => !scene.subjectAction || scene.subjectAction.trim().length < 10);
    if (emptyActionScenes.length > 0) {
        issues.push({
            code: 'scene_missing_moment',
            message: `${emptyActionScenes.length} scene(s) have no subjectAction (moment description) and will produce location-only images unusable for video: ${emptyActionScenes.map((s) => s.sceneId).join(', ')}. Regenerate the production bible.`,
            severity: 'blocker',
            autoFixable: false,
        });
    }

    // Any bare generic location name signals the brief engine defaulted to a cruise-brochure cliché.
    // Even one is enough to flag — threshold > 0, not > 2.
    const genericLocationScenes = bible.sceneLibrary.filter((scene) =>
        GENERIC_SCENE_PATTERNS.some((pattern) => pattern.test(scene.location.trim()))
    );
    if (genericLocationScenes.length > 0) {
        issues.push({
            code: 'scene_generic_defaults',
            message: `${genericLocationScenes.length} scene(s) use bare generic cruise-brochure location names (pool deck, atrium, dining room, etc.) with no moment qualifier: ${genericLocationScenes.map((s) => s.sceneId).join(', ')}. Regenerate the production bible with moment-first descriptions.`,
            severity: 'warning',
            autoFixable: false,
        });
    }

    return issues;
}

const HUMAN_PRESENCE_CUES = [
    /\bblurred\b/i,
    /\bover.the.shoulder\b/i,
    /\bover shoulder\b/i,
    /\bhands? in frame\b/i,
    /\bpartial.body\b/i,
    /\bpartial body\b/i,
    /\banonymous\b/i,
    /\bsilhouette\b/i,
    /\bbackground figures?\b/i,
    /\bseated cluster\b/i,
    /\bsoft background\b/i,
    /\bfaces? (?:soft|blurred|turned|out of frame)\b/i,
];

const BOARD_GAME_OBJECT_CUES = [
    /\bmeeple\b/i,
    /\bmeeples\b/i,
    /\bdice\b/i,
    /\bcards?\b/i,
    /\bboard game\b/i,
    /\bgame box\b/i,
    /\bscore sheet\b/i,
    /\btabletop\b/i,
    /\bgame night\b/i,
    /\bgame pieces?\b/i,
    /\btiles?\b/i,
    /\bplay surface\b/i,
];

const BOARD_GAME_SOCIAL_CUES = [
    /\baround the table\b/i,
    /\bgame in progress\b/i,
    /\brules? (?:explained|teaching|lesson)\b/i,
    /\bover.the.shoulder\b/i,
    /\bover shoulder\b/i,
    /\bhands? in frame\b/i,
    /\bblurred\b/i,
    /\bbackground figures?\b/i,
    /\banonymous seated cluster\b/i,
    /\bsmall social cluster\b/i,
    /\blean(?:ing)? in\b/i,
    /\bshuffl(?:e|ing)\b/i,
    /\broll(?:ing)? dice\b/i,
    /\bplacing (?:a )?piece\b/i,
];

function isBoardGamesAtSeaCampaign(campaign: Campaign): boolean {
    return campaign.id === 'board-games-at-sea' || /board games at sea/i.test(campaign.name);
}

function sceneHasHumanPresenceCue(scene: SceneSpec): boolean {
    const combined = [scene.imagePrompt, scene.subjectAction, scene.cameraAngle, scene.environmentDetails].join(' ');
    return HUMAN_PRESENCE_CUES.some((p) => p.test(combined));
}

function sceneHasBoardGameObjectCue(scene: SceneSpec): boolean {
    const combined = [scene.imagePrompt, scene.subjectAction, scene.environmentDetails].join(' ');
    return BOARD_GAME_OBJECT_CUES.some((p) => p.test(combined));
}

function sceneHasBoardGameSocialCue(scene: SceneSpec): boolean {
    const combined = [scene.imagePrompt, scene.subjectAction, scene.cameraAngle, scene.environmentDetails].join(' ');
    return BOARD_GAME_SOCIAL_CUES.some((p) => p.test(combined));
}

function sceneHasBoardGameMood(scene: SceneSpec): boolean {
    const combined = [scene.imagePrompt, scene.subjectAction, scene.environmentDetails, scene.mood].join(' ');
    return /\bboard game\b/i.test(combined)
        || /\btabletop\b/i.test(combined)
        || /\bgame night\b/i.test(combined)
        || /\bplay\b/i.test(combined)
        || /\bmeeple\b/i.test(combined)
        || /\bdice\b/i.test(combined)
        || /\bcards?\b/i.test(combined)
        || sceneHasBoardGameObjectCue(scene)
        || sceneHasBoardGameSocialCue(scene);
}

function sceneHasNicheCue(scene: SceneSpec, allowedProps: readonly string[], nicheEnhancedMoments: readonly string[]): boolean {
    if (allowedProps.length === 0 && nicheEnhancedMoments.length === 0) return true;
    const combined = [scene.imagePrompt, scene.subjectAction, scene.environmentDetails].join(' ').toLowerCase();
    const vocabTerms = [...allowedProps, ...nicheEnhancedMoments].map((t) => t.toLowerCase());
    // A term matches if any individual word in it appears in the scene text
    return vocabTerms.some((term) =>
        term.split(/\s+/).filter((w) => w.length > 3).some((word) => combined.includes(word))
    );
}

function checkSceneNicheCoverage(
    bible: ProductionBible,
    allowedProps: readonly string[],
    nicheEnhancedMoments: readonly string[],
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Skip niche coverage check if no vocabulary is defined for the campaign
    if (allowedProps.length === 0 && nicheEnhancedMoments.length === 0) {
        return issues;
    }

    const nicheMissingScenes = bible.sceneLibrary.filter(
        (scene) => !sceneHasNicheCue(scene, allowedProps, nicheEnhancedMoments)
    );
    if (nicheMissingScenes.length > 0) {
        issues.push({
            code: 'scene_niche_cue_missing',
            message: `${nicheMissingScenes.length} scene(s) have no detectable niche cue in imagePrompt or subjectAction. Each scene must include at least one prop or moment from the campaign's allowed vocabulary: ${nicheMissingScenes.map((s) => s.sceneId).join(', ')}.`,
            severity: 'warning',
            autoFixable: false,
        });
    }

    const humanPresenceMissingScenes = bible.sceneLibrary.filter(
        (scene) => !sceneHasHumanPresenceCue(scene)
    );
    const humanPresenceThreshold = Math.ceil(bible.sceneLibrary.length * 0.8);
    const humanPresenceCount = bible.sceneLibrary.length - humanPresenceMissingScenes.length;
    if (humanPresenceCount < humanPresenceThreshold && bible.sceneLibrary.length >= 3) {
        issues.push({
            code: 'scene_human_presence_weak',
            message: `Only ${humanPresenceCount}/${bible.sceneLibrary.length} scenes use a low-risk human presence cue (blurred figures, over-the-shoulder, hands in frame, or anonymous cluster). At least ${humanPresenceThreshold} scenes should carry social texture. Scenes missing cues: ${humanPresenceMissingScenes.map((s) => s.sceneId).join(', ')}.`,
            severity: 'warning',
            autoFixable: false,
        });
    }

    return issues;
}

function checkBoardGameSceneCoverage(
    bible: ProductionBible,
    campaign: Campaign,
): ValidationIssue[] {
    if (!isBoardGamesAtSeaCampaign(campaign)) {
        return [];
    }

    const issues: ValidationIssue[] = [];
    const objectCueScenes = bible.sceneLibrary.filter((scene) => sceneHasBoardGameObjectCue(scene));
    const socialCueScenes = bible.sceneLibrary.filter((scene) => sceneHasBoardGameSocialCue(scene));
    const thematicScenes = bible.sceneLibrary.filter((scene) => sceneHasBoardGameMood(scene));
    const requiredObjectCount = Math.ceil(bible.sceneLibrary.length * 0.8);
    const requiredSocialCount = Math.ceil(bible.sceneLibrary.length * 0.7);
    const requiredThematicCount = Math.ceil(bible.sceneLibrary.length * 0.8);

    if (objectCueScenes.length < requiredObjectCount) {
        issues.push({
            code: 'board_game_object_density_weak',
            message: `Only ${objectCueScenes.length}/${bible.sceneLibrary.length} scenes include a recognizable board-game object cue. For board-games-at-sea, at least ${requiredObjectCount} scenes should show a visible game object or interaction. Scenes missing cues: ${bible.sceneLibrary.filter((scene) => !sceneHasBoardGameObjectCue(scene)).map((s) => s.sceneId).join(', ')}.`,
            severity: 'blocker',
            autoFixable: false,
        });
    }

    if (socialCueScenes.length < requiredSocialCount) {
        issues.push({
            code: 'board_game_social_texture_weak',
            message: `Only ${socialCueScenes.length}/${bible.sceneLibrary.length} scenes feel like a social board-game moment. For board-games-at-sea, at least ${requiredSocialCount} scenes should carry small-group/table/play texture. Scenes missing cues: ${bible.sceneLibrary.filter((scene) => !sceneHasBoardGameSocialCue(scene)).map((s) => s.sceneId).join(', ')}.`,
            severity: 'blocker',
            autoFixable: false,
        });
    }

    if (thematicScenes.length < requiredThematicCount) {
        issues.push({
            code: 'board_game_thematic_readability_weak',
            message: `Only ${thematicScenes.length}/${bible.sceneLibrary.length} scenes read as obviously board-game themed. For board-games-at-sea, at least ${requiredThematicCount} scenes should make the board-game identity legible in mood or action. Scenes missing cues: ${bible.sceneLibrary.filter((scene) => !sceneHasBoardGameMood(scene)).map((s) => s.sceneId).join(', ')}.`,
            severity: 'blocker',
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
        issues.push(...checkSceneNicheCoverage(
            brief.productionBible,
            brief.visual.plausibilityFramework.allowedProps,
            brief.visual.plausibilityFramework.nicheEnhancedMoments,
        ));
        issues.push(...checkBoardGameSceneCoverage(brief.productionBible, campaign));
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
