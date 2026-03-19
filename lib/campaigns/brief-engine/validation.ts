import type { CampaignAestheticBrief, ProductionBible } from '../schema';
import type { Campaign } from '../types';
import { getLaunchWindowAssessment, MINIMUM_CAMPAIGN_LEAD_DAYS } from '../launch-window';

// ────────────────────────────────────────────────────────────────────────────
// Consolidated validation — one pass, one result, one source of truth
// ────────────────────────────────────────────────────────────────────────────

const BANNED_WORKSHOP_PATTERNS = [/\bworkshop\b/i, /\bsalon\b/i, /hosted session/i, /event[- ]program/i, /managed program/i];
const BANNED_EXCLUSIVITY_PATTERNS = [/quiet-luxe/i, /elevated salon/i, /collector-grade/i, /rarefied/i];
const BANNED_CAMERA_MOVES = [/\bcrane\b/i, /\bdolly\b/i, /\btracking shot\b/i, /\bslider\b/i, /\bcable[- ]?cam\b/i];

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

function checkProductionBibleFeasibility(bible: ProductionBible): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const allText = JSON.stringify(bible);

    if (textMatchesPatterns(allText, BANNED_CAMERA_MOVES)) {
        issues.push({ code: 'camera_move_feasibility', message: 'Forbidden camera moves (crane, dolly, tracking shot, slider, cable cam) found in production bible.', severity: 'blocker', autoFixable: true });
    }

    // TODO: Interior-window cabin contradiction check
    if (/interior\s+stateroom/i.test(allText) && /ocean[- ]?view|window/i.test(allText)) {
        const sceneTexts = bible.sceneLibrary.map((s) => `${s.location} ${s.environmentDetails}`);
        for (const sceneText of sceneTexts) {
            if (/interior/i.test(sceneText) && /ocean[- ]?view|window/i.test(sceneText)) {
                issues.push({ code: 'cabin_type_plausibility', message: 'Interior stateroom paired with ocean-view or window language.', severity: 'blocker', autoFixable: true });
                break;
            }
        }
    }

    // TODO: Gangway exchange check
    if (/gangway\s+(exchange|handoff|choreograph)/i.test(allText)) {
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
            severity: 'blocker',
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
    if (!/optional|drop-in|drop out|drop-out|join or skip|low-pressure|welcome/i.test(optText)) {
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

    // ── Production artifacts ──────────────────────────────────────────────
    if (!brief.productionBible || !brief.landingStillBible) {
        issues.push({ code: 'production_artifacts_missing', message: 'Both productionBible and landingStillBible are required.', severity: 'blocker', autoFixable: false });
    } else {
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
