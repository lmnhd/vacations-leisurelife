import type {
    CampaignAestheticBrief,
    AestheticIssueCode,
    AestheticAppliedOperation,
    AestheticModificationOperation,
    AestheticOperationKind,
} from '../schema';
import { fixCountdownSeries } from './countdown-series';
import {
    fixCameraMoveFeasibility,
    fixCabinTypePlausibility,
    fixGangwayExchangeProhibited,
    fixStoryboardDurationAlignment,
    fixProductionSafetyOpsMissing,
} from './production-bible';

// ── Fixer Result ─────────────────────────────────────────────────────────────

export interface FixerResult {
    brief: CampaignAestheticBrief;
    applied: boolean;
    touchedPaths: string[];
    appliedOperations: AestheticAppliedOperation[];
    followUps: string[];
}

// ── Path guard — throws on any disallowed target ──────────────────────────────

export class FixerPathError extends Error {
    constructor(path: string) {
        super(`Operation target path "${path}" is not a valid brief field. Only explicitly whitelisted schema paths may be modified.`);
        this.name = 'FixerPathError';
    }
}

// Exhaustive whitelist of real CampaignAestheticBrief leaf paths.
// Unlisted paths throw FixerPathError before any mutation is attempted.
export const ALLOWED_OPERATION_PATHS = new Set([
    // coundown / video concepts
    'videoConcepts.countdownSeries',
    'videoConcepts.heroExplainer.scriptOrNarration',
    'videoConcepts.heroExplainer.visualDirectionNotes',
    'videoConcepts.heroExplainer.backgroundDescription',
    'videoConcepts.heroExplainer.musicMood',
    'videoConcepts.heroExplainer.avatarRequired',
    'videoConcepts.heroExplainer.tool',
    'videoConcepts.tiktokSeed.scriptOrNarration',
    'videoConcepts.tiktokSeed.visualDirectionNotes',
    'videoConcepts.tiktokSeed.backgroundDescription',
    'videoConcepts.tiktokSeed.musicMood',
    'videoConcepts.tiktokSeed.avatarRequired',
    'videoConcepts.tiktokSeed.tool',
    'videoConcepts.thresholdAnnouncement.scriptOrNarration',
    'videoConcepts.thresholdAnnouncement.visualDirectionNotes',
    'videoConcepts.thresholdAnnouncement.backgroundDescription',
    'videoConcepts.thresholdAnnouncement.musicMood',
    'videoConcepts.thresholdAnnouncement.avatarRequired',
    'videoConcepts.thresholdAnnouncement.tool',
    'videoConcepts.merchReveal.scriptOrNarration',
    'videoConcepts.merchReveal.visualDirectionNotes',
    'videoConcepts.merchReveal.backgroundDescription',
    'videoConcepts.merchReveal.musicMood',
    'videoConcepts.merchReveal.avatarRequired',
    'videoConcepts.merchReveal.tool',
    // visual
    'visual.compositionNotes',
    'visual.imageryMood',
    'visual.avoidList',
    // messaging
    'messaging.heroSlogan',
    'messaging.subSlogan',
    'messaging.elevatorPitch',
    'messaging.voicePersona',
    // audio
    'audio.ambientNarrationScript',
    'audio.hypeClipScript',
    'audio.musicMood',
    'audio.voiceProfile',
    // merch
    'merch.conceptStatement',
    'merch.tagline',
    // top-level
    'revisionNotes',
    // productionBible
    'productionBible.storyboards',
    'productionBible.sceneLibrary',
    'productionBible.globalDirectionNotes',
    'productionBible.avoidDirectives',
]);

export function isAllowedTargetPath(path: string): boolean {
    return ALLOWED_OPERATION_PATHS.has(path);
}

function assertAllowedPath(path: string): void {
    if (!isAllowedTargetPath(path)) throw new FixerPathError(path);
}

// ── Deep traversal utils ──────────────────────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
        if (acc && typeof acc === 'object' && !Array.isArray(acc)) {
            return (acc as Record<string, unknown>)[key];
        }
        return undefined;
    }, obj);
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
    const keys = path.split('.');
    const result = { ...obj };
    let current: Record<string, unknown> = result;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        current[key] = { ...(current[key] as Record<string, unknown>) };
        current = current[key] as Record<string, unknown>;
    }
    current[keys[keys.length - 1]] = value;
    return result;
}

// ── Operation runners ────────────────────────────────────────────────────────

function runSetBoolean(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    assertAllowedPath(op.targetPath);
    const value = op.params?.['value'];
    if (typeof value !== 'boolean') {
        return noOpResult(brief, op.kind, op.targetPath, 'set_boolean requires params.value to be a boolean.');
    }
    const current = getNestedValue(brief as unknown as Record<string, unknown>, op.targetPath);
    if (current === value) {
        return noOpResult(brief, op.kind, op.targetPath, `Already set to ${String(value)} — idempotent no-op.`);
    }
    const updated = setNestedValue(brief as unknown as Record<string, unknown>, op.targetPath, value) as unknown as CampaignAestheticBrief;
    return appliedResult(updated, op.kind, op.targetPath, `Set ${op.targetPath} = ${String(value)}.`, [op.targetPath]);
}

function runSetEnum(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    assertAllowedPath(op.targetPath);
    const value = op.params?.['value'];
    if (typeof value !== 'string') {
        return noOpResult(brief, op.kind, op.targetPath, 'set_enum requires params.value to be a string.');
    }
    const current = getNestedValue(brief as unknown as Record<string, unknown>, op.targetPath);
    if (current === value) {
        return noOpResult(brief, op.kind, op.targetPath, `Already set to "${value}" — idempotent no-op.`);
    }
    const updated = setNestedValue(brief as unknown as Record<string, unknown>, op.targetPath, value) as unknown as CampaignAestheticBrief;
    return appliedResult(updated, op.kind, op.targetPath, `Set ${op.targetPath} = "${value}".`, [op.targetPath]);
}

function runAppendSentence(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    assertAllowedPath(op.targetPath);
    const sentence = op.params?.['sentence'];
    if (typeof sentence !== 'string') {
        return noOpResult(brief, op.kind, op.targetPath, 'append_sentence_if_missing requires params.sentence.');
    }
    const current = getNestedValue(brief as unknown as Record<string, unknown>, op.targetPath);
    const currentStr = typeof current === 'string' ? current : '';
    if (currentStr.includes(sentence)) {
        return noOpResult(brief, op.kind, op.targetPath, 'Sentence already present — idempotent no-op.');
    }
    const updated = setNestedValue(
        brief as unknown as Record<string, unknown>,
        op.targetPath,
        currentStr ? `${currentStr} ${sentence}` : sentence,
    ) as unknown as CampaignAestheticBrief;
    return appliedResult(updated, op.kind, op.targetPath, `Appended sentence to ${op.targetPath}.`, [op.targetPath]);
}

function runPrependSentence(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    assertAllowedPath(op.targetPath);
    const sentence = op.params?.['sentence'];
    if (typeof sentence !== 'string') {
        return noOpResult(brief, op.kind, op.targetPath, 'prepend_sentence_if_missing requires params.sentence.');
    }
    const current = getNestedValue(brief as unknown as Record<string, unknown>, op.targetPath);
    const currentStr = typeof current === 'string' ? current : '';
    if (currentStr.includes(sentence)) {
        return noOpResult(brief, op.kind, op.targetPath, 'Sentence already present — idempotent no-op.');
    }
    const updated = setNestedValue(
        brief as unknown as Record<string, unknown>,
        op.targetPath,
        currentStr ? `${sentence} ${currentStr}` : sentence,
    ) as unknown as CampaignAestheticBrief;
    return appliedResult(updated, op.kind, op.targetPath, `Prepended sentence to ${op.targetPath}.`, [op.targetPath]);
}

const EXACT_TIME_RE = /\b(?:(?:0?[1-9]|1[0-2]):[0-5]\d\s*(?:am|pm)|(?:[01]?\d|2[0-3]):[0-5]\d)\b/gi;
const TIME_REPLACEMENT_PAIRS: Array<[RegExp, string]> = [
    [/\b([0-9]|1[0-2]):\d{2}\s*am\b/gi, 'morning'],
    [/\b([0-9]|1[0-2]):\d{2}\s*pm\b/gi, 'afternoon'],
    [/\b([01]?[0-9]|2[0-3]):\d{2}\b/g, 'a set time'],
];

function runNormalizeTimeStrings(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    assertAllowedPath(op.targetPath);
    const current = getNestedValue(brief as unknown as Record<string, unknown>, op.targetPath);
    if (typeof current !== 'string') {
        return noOpResult(brief, op.kind, op.targetPath, 'normalize_time_strings requires a string field.');
    }
    if (!EXACT_TIME_RE.test(current)) {
        EXACT_TIME_RE.lastIndex = 0;
        return noOpResult(brief, op.kind, op.targetPath, 'No exact time strings found — idempotent no-op.');
    }
    EXACT_TIME_RE.lastIndex = 0;
    let result = current;
    for (const [re, replacement] of TIME_REPLACEMENT_PAIRS) {
        result = result.replace(re, replacement);
    }
    const updated = setNestedValue(brief as unknown as Record<string, unknown>, op.targetPath, result) as unknown as CampaignAestheticBrief;
    return appliedResult(updated, op.kind, op.targetPath, `Replaced exact time strings in ${op.targetPath} with time-of-day phrases.`, [op.targetPath]);
}

const BRANDED_VENUE_MAP: Record<string, string> = {
    'windjammer café open-air terrace/window side': 'Windjammer Café window-side seating',
    'windjammer cafe open-air terrace/window side': 'Windjammer Café window-side seating',
    'windjammer café open-air terrace': 'Windjammer Café window-side seating',
    'windjammer cafe open-air terrace': 'Windjammer Café window-side seating',
    'starbucks': 'a coffee bar',
    'mcdonalds': 'a quick-service venue',
    "mcdonald's": 'a quick-service venue',
    'sephora': 'a beauty boutique',
    'nordstrom': 'a retail store',
    'target': 'a general retailer',
    'walmart': 'a general retailer',
    'carnival': 'the ship',
    'royal caribbean': 'the ship',
    'celebrity cruises': 'the ship',
};

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildVenuePattern(term: string): RegExp {
    const escaped = escapeRegExp(term);
    return /^[\w']+$/i.test(term)
        ? new RegExp(`\\b${escaped}\\b`, 'gi')
        : new RegExp(escaped, 'gi');
}

function replaceNamedVenuesInValue(value: unknown): { value: unknown; changed: boolean } {
    if (typeof value === 'string') {
        let result = value;
        let changed = false;
        for (const [brand, generic] of Object.entries(BRANDED_VENUE_MAP)) {
            const re = buildVenuePattern(brand);
            const next = result.replace(re, generic);
            if (next !== result) changed = true;
            result = next;
        }
        return { value: result, changed };
    }

    if (Array.isArray(value)) {
        let changed = false;
        const next = value.map((item) => {
            const replaced = replaceNamedVenuesInValue(item);
            if (replaced.changed) changed = true;
            return replaced.value;
        });
        return { value: next, changed };
    }

    if (value && typeof value === 'object') {
        let changed = false;
        const nextEntries = Object.entries(value as Record<string, unknown>).map(([key, child]) => {
            const replaced = replaceNamedVenuesInValue(child);
            if (replaced.changed) changed = true;
            return [key, replaced.value] as const;
        });
        return { value: Object.fromEntries(nextEntries), changed };
    }

    return { value, changed: false };
}

function runReplaceNamedVenues(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    assertAllowedPath(op.targetPath);
    const current = getNestedValue(brief as unknown as Record<string, unknown>, op.targetPath);
    const replaced = replaceNamedVenuesInValue(current);
    if (!replaced.changed) {
        return noOpResult(brief, op.kind, op.targetPath, 'No branded venue names found — idempotent no-op.');
    }
    const updated = setNestedValue(brief as unknown as Record<string, unknown>, op.targetPath, replaced.value) as unknown as CampaignAestheticBrief;
    return appliedResult(updated, op.kind, op.targetPath, `Replaced branded venue names in ${op.targetPath}.`, [op.targetPath]);
}

function runReplacePhrasePatterns(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    assertAllowedPath(op.targetPath);
    const patterns = op.params?.['patterns'] as string[] | undefined;
    const replacements = op.params?.['replacements'] as string[] | undefined;
    if (!patterns || !replacements || patterns.length !== replacements.length) {
        return noOpResult(brief, op.kind, op.targetPath, 'replace_phrase_patterns requires matching patterns[] and replacements[] arrays.');
    }
    const current = getNestedValue(brief as unknown as Record<string, unknown>, op.targetPath);
    if (typeof current !== 'string') {
        return noOpResult(brief, op.kind, op.targetPath, 'replace_phrase_patterns requires a string field.');
    }
    let result = current;
    let changed = false;
    for (let i = 0; i < patterns.length; i++) {
        const next = result.replace(new RegExp(patterns[i], 'gi'), replacements[i]);
        if (next !== result) changed = true;
        result = next;
    }
    if (!changed) {
        return noOpResult(brief, op.kind, op.targetPath, 'No matching phrases found — idempotent no-op.');
    }
    const updated = setNestedValue(brief as unknown as Record<string, unknown>, op.targetPath, result) as unknown as CampaignAestheticBrief;
    return appliedResult(updated, op.kind, op.targetPath, `Replaced phrase patterns in ${op.targetPath}.`, [op.targetPath]);
}

const PRIVACY_SENTENCE = "Photos and videos taken during the event are subject to participant consent. Please respect others' privacy.";
const FILMING_SENTENCE = 'All filming and photography requires prior written approval from the event organizer. Synthetic or stock footage may be substituted where permissions are not obtained.';
const RAIL_SAFETY_SENTENCE = 'Passengers must remain behind deck railings at all times and must not lean over or sit on railings.';
const MERCH_DISCLAIMER = 'Optional — no branded identifiers or personal information required on any merchandise items.';

function runInjectPrivacyLine(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    return runAppendSentence(brief, { ...op, kind: 'append_sentence_if_missing', params: { sentence: PRIVACY_SENTENCE } });
}
function runInjectFilmingPermissionGate(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    return runAppendSentence(brief, { ...op, kind: 'append_sentence_if_missing', params: { sentence: FILMING_SENTENCE } });
}
function runInjectRailSafetyLanguage(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    return runAppendSentence(brief, { ...op, kind: 'append_sentence_if_missing', params: { sentence: RAIL_SAFETY_SENTENCE } });
}

// ── Result helpers ────────────────────────────────────────────────────────────

export function noOpResult(brief: CampaignAestheticBrief, kind: AestheticOperationKind, targetPath: string, summary: string): FixerResult {
    return { brief, applied: false, touchedPaths: [], appliedOperations: [{ kind, targetPath, status: 'no_op', summary }], followUps: [] };
}
export function appliedResult(brief: CampaignAestheticBrief, kind: AestheticOperationKind, targetPath: string, summary: string, touchedPaths: string[]): FixerResult {
    return { brief, applied: true, touchedPaths, appliedOperations: [{ kind, targetPath, status: 'applied', summary }], followUps: [] };
}

// ── Pattern string constants for multi-field operations ───────────────────────

const SCARCITY_PATTERNS = [
    '\\b(only\\s+)?\\d+\\s*cabin(s)?\\s*(left|remain(ing)?)\\b',
    '\\blimited\\s+availability\\b',
    '\\bselling\\s+out\\s*fast\\b',
    '\\blast\\s+(few\\s+)?cabin(s)?\\b',
    '\\bhurry\\b',
    "\\bdon't\\s+miss\\s+out\\b",
    '\\bT-\\d+\\b',
];
const SCARCITY_REPLACEMENTS = [
    'cabin options available',
    'check current availability',
    'popular sailing',
    'remaining cabin options',
    'plan ahead',
    'explore your options',
    'upcoming sailing',
];

const QUEUE_PATTERNS = [
    '\\b(check|view|open)\\s+(your\\s+)?(phone|app|device|screen)\\b',
    '\\blaunch\\s+(the\\s+)?(app|website)\\b',
    '\\bclick\\s+(the\\s+)?link\\s+in\\s+(your|the)\\s+bio\\b',
];
const QUEUE_REPLACEMENTS = ['check the announcement', 'visit the link', 'find the link below'];

const VIDEO_SCRIPT_PATHS = [
    'videoConcepts.heroExplainer.scriptOrNarration',
    'videoConcepts.tiktokSeed.scriptOrNarration',
    'videoConcepts.thresholdAnnouncement.scriptOrNarration',
    'videoConcepts.merchReveal.scriptOrNarration',
];
const VIDEO_VISUAL_PATHS = [
    'videoConcepts.heroExplainer.visualDirectionNotes',
    'videoConcepts.tiktokSeed.visualDirectionNotes',
    'videoConcepts.thresholdAnnouncement.visualDirectionNotes',
    'videoConcepts.merchReveal.visualDirectionNotes',
];

// ── Issue code → operations mapping ──────────────────────────────────────────

export const ISSUE_CODE_OPERATIONS: Record<AestheticIssueCode, AestheticModificationOperation[]> = {
    countdown_series_hard_scarcity: [
        { kind: 'replace_countdown_series', targetPath: 'videoConcepts.countdownSeries' },
    ],
    exact_time_strings: [
        ...[ ...VIDEO_SCRIPT_PATHS, 'audio.ambientNarrationScript', 'audio.hypeClipScript' ]
            .map(p => ({ kind: 'normalize_time_strings' as const, targetPath: p })),
    ],
    queue_device_handling: [
        ...[ ...VIDEO_SCRIPT_PATHS, 'audio.ambientNarrationScript', 'audio.hypeClipScript' ]
            .map(p => ({ kind: 'replace_phrase_patterns' as const, targetPath: p, params: { patterns: QUEUE_PATTERNS, replacements: QUEUE_REPLACEMENTS } })),
    ],
    non_generic_venue_naming: [
        ...[ ...VIDEO_SCRIPT_PATHS, ...VIDEO_VISUAL_PATHS, 'visual.compositionNotes', 'messaging.elevatorPitch', 'productionBible.sceneLibrary', 'productionBible.globalDirectionNotes' ]
            .map(p => ({ kind: 'replace_named_venues_with_generic' as const, targetPath: p })),
    ],
    avatar_required_video: [
        { kind: 'set_boolean', targetPath: 'videoConcepts.heroExplainer.avatarRequired', params: { value: false } },
        { kind: 'set_boolean', targetPath: 'videoConcepts.tiktokSeed.avatarRequired', params: { value: false } },
        { kind: 'set_boolean', targetPath: 'videoConcepts.thresholdAnnouncement.avatarRequired', params: { value: false } },
        { kind: 'set_boolean', targetPath: 'videoConcepts.merchReveal.avatarRequired', params: { value: false } },
    ],
    disallowed_video_tool: [
        { kind: 'set_enum', targetPath: 'videoConcepts.heroExplainer.tool', params: { value: 'runwayml' } },
        { kind: 'set_enum', targetPath: 'videoConcepts.tiktokSeed.tool', params: { value: 'runwayml' } },
        { kind: 'set_enum', targetPath: 'videoConcepts.thresholdAnnouncement.tool', params: { value: 'runwayml' } },
        { kind: 'set_enum', targetPath: 'videoConcepts.merchReveal.tool', params: { value: 'runwayml' } },
    ],
    rail_safety_missing: [
        { kind: 'inject_rail_safety_language', targetPath: 'visual.compositionNotes' },
    ],
    merch_identifier_pressure: [
        { kind: 'append_sentence_if_missing', targetPath: 'merch.conceptStatement', params: { sentence: MERCH_DISCLAIMER } },
    ],
    privacy_line_missing: [
        { kind: 'inject_privacy_line', targetPath: 'visual.compositionNotes' },
    ],
    filming_permissions_missing: [
        { kind: 'inject_filming_permission_gate', targetPath: 'visual.compositionNotes' },
    ],
    compliance_risk_scarcity_copy: [
        ...[ ...VIDEO_SCRIPT_PATHS, ...VIDEO_VISUAL_PATHS, 'audio.hypeClipScript' ]
            .map(p => ({ kind: 'replace_phrase_patterns' as const, targetPath: p, params: { patterns: SCARCITY_PATTERNS, replacements: SCARCITY_REPLACEMENTS } })),
    ],
    camera_move_feasibility: [
        { kind: 'normalize_camera_movements' as const, targetPath: 'productionBible.storyboards' },
    ],
    cabin_type_plausibility: [
        { kind: 'normalize_cabin_type' as const, targetPath: 'productionBible.sceneLibrary' },
    ],
    gangway_exchange_prohibited: [
        { kind: 'remove_or_relocate_scene_beat' as const, targetPath: 'productionBible.storyboards' },
    ],
    storyboard_duration_alignment: [
        { kind: 'align_storyboard_durations' as const, targetPath: 'productionBible.storyboards' },
    ],
    production_safety_ops_missing: [
        { kind: 'inject_production_safety_ops' as const, targetPath: 'productionBible.globalDirectionNotes' },
    ],
};

// ── Operation dispatcher ──────────────────────────────────────────────────────

export function runOperation(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    switch (op.kind) {
        case 'replace_countdown_series':    return fixCountdownSeries(brief);
        case 'set_boolean':                 return runSetBoolean(brief, op);
        case 'set_enum':                    return runSetEnum(brief, op);
        case 'append_sentence_if_missing':  return runAppendSentence(brief, op);
        case 'prepend_sentence_if_missing': return runPrependSentence(brief, op);
        case 'normalize_time_strings':      return runNormalizeTimeStrings(brief, op);
        case 'replace_named_venues_with_generic': return runReplaceNamedVenues(brief, op);
        case 'replace_phrase_patterns':     return runReplacePhrasePatterns(brief, op);
        case 'inject_privacy_line':         return runInjectPrivacyLine(brief, op);
        case 'inject_filming_permission_gate': return runInjectFilmingPermissionGate(brief, op);
        case 'inject_rail_safety_language': return runInjectRailSafetyLanguage(brief, op);
        case 'normalize_camera_movements':   return fixCameraMoveFeasibility(brief);
        case 'normalize_cabin_type':         return fixCabinTypePlausibility(brief);
        case 'remove_or_relocate_scene_beat': return fixGangwayExchangeProhibited(brief);
        case 'align_storyboard_durations':   return fixStoryboardDurationAlignment(brief);
        case 'inject_production_safety_ops': return fixProductionSafetyOpsMissing(brief);
        case 'replace_scene_location':       return noOpResult(brief, op.kind, op.targetPath, 'replace_scene_location requires explicit params — use issue code cabin_type_plausibility for automated fix.');
    }
}

// ── Deadlock suggestion helper ────────────────────────────────────────────────

const ISSUE_DETECTION_PATTERNS: Array<{ issueCode: AestheticIssueCode; patterns: RegExp[] }> = [
    { issueCode: 'countdown_series_hard_scarcity', patterns: [/countdown/i, /T-\d+/i, /cabin(s)?\s*(left|remain)/i, /scarcity/i] },
    { issueCode: 'exact_time_strings',             patterns: [/\b(?:(?:0?[1-9]|1[0-2]):[0-5]\d\s*(?:am|pm)|(?:[01]?\d|2[0-3]):[0-5]\d)\b/i] },
    { issueCode: 'queue_device_handling',          patterns: [/check.*?(app|phone|device)/i, /launch.*(app|website)/i] },
    { issueCode: 'non_generic_venue_naming',       patterns: [...Object.keys(BRANDED_VENUE_MAP).map(buildVenuePattern), /windjammer\s+caf[eé][^,.]{0,60}(open.?air terrace|window.?side)/i] },
    { issueCode: 'avatar_required_video',          patterns: [/avatar\s+required/i, /heygen.*required/i] },
    { issueCode: 'disallowed_video_tool',          patterns: [/\bheygen\b/i] },
    { issueCode: 'rail_safety_missing',            patterns: [/\blean(ing)?\s+over\s+(the\s+)?rail(ing)?\b/i, /\brail-side\b/i, /\bdeck\s+edge\b/i, /\bover\s+the\s+railing\b/i] },
    { issueCode: 'privacy_line_missing',           patterns: [/\b(?:photos?|photography|photo\s+ops?)\b/i, /\b(?:filming|videography|record(?:ing|ed)?)\b/i] },
    { issueCode: 'compliance_risk_scarcity_copy',  patterns: [/\bonly\s+\d+\b/i, /\blimited\s+spots?\b/i, /\bselling\s+out\b/i] },
    { issueCode: 'camera_move_feasibility',         patterns: [/\bcrane\b/i, /\bdolly\b/i, /\btrack(ing)?\s+shot\b/i, /\bslider\b/i, /\bcable\s+cam\b/i] },
    { issueCode: 'cabin_type_plausibility',         patterns: [/interior\s+stateroom[^.]{0,80}(window|ocean|sea\s+view)/i, /(window|ocean|sea\s+view)[^.]{0,80}interior\s+stateroom/i, /inside\s+cabin[^.]{0,80}(window|ocean|sea\s+view)/i, /oceanview.*contradiction/i] },
    { issueCode: 'gangway_exchange_prohibited',     patterns: [/\bgangway\b/i, /exchange.*gangway/i, /gangway.*exchange/i, /handoff.*gangway/i] },
    { issueCode: 'storyboard_duration_alignment',   patterns: [/duration\s+mismatch/i, /totalDurationSeconds\s+mismatch/i, /storyboard\s+total/i, /\d+s\s+(vs|versus|but)\s+\d+/i] },
    { issueCode: 'production_safety_ops_missing',   patterns: [/spotter/i, /keep.?right/i, /off.?peak/i, /two.?person\s+crew/i, /crew\s+max/i, /stand.?down/i, /passenger\s+flow/i] },
];

export function suggestDeterministicIssueCodes(
    redTeamIssues: string[],
    requiredFixes: string,
): AestheticIssueCode[] {
    const combined = [...redTeamIssues, requiredFixes].join(' ').toLowerCase();
    const suggestions = new Set<AestheticIssueCode>();
    for (const { issueCode, patterns } of ISSUE_DETECTION_PATTERNS) {
        if (patterns.some(re => re.test(combined))) suggestions.add(issueCode);
    }
    return Array.from(suggestions);
}
