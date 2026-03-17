import type {
    CampaignAestheticBrief,
    AestheticIssueCode,
    AestheticAppliedOperation,
    AestheticModificationOperation,
    AestheticOperationKind,
} from '../schema';
import { fixCountdownSeries } from './countdown-series';

// ────────────────────────────────────────────────────────────────────────────
// Fixer Result — shared shape for all deterministic handlers
// ────────────────────────────────────────────────────────────────────────────

export interface FixerResult {
    brief: CampaignAestheticBrief;
    applied: boolean;
    touchedPaths: string[];
    appliedOperations: AestheticAppliedOperation[];
    followUps: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Allowed target paths — domain-safe traversal only
// ────────────────────────────────────────────────────────────────────────────

const ALLOWED_OPERATION_PATHS = new Set([
    'videoConcepts.countdownSeries',
    'videoConcepts.heroExplainer',
    'videoConcepts.tiktokSeed',
    'videoConcepts.thresholdAnnouncement',
    'videoConcepts.merchReveal',
    'visual.compositionNotes',
    'visual.avoidList',
    'copy.privacyLine',
    'copy.filmingGuidance',
    'productionNotes',
    'revisionNotes',
]);

export function isAllowedTargetPath(path: string): boolean {
    if (ALLOWED_OPERATION_PATHS.has(path)) return true;
    // Allow any field under these safe prefixes
    const SAFE_PREFIXES = ['videoConcepts.', 'visual.avoidList', 'copy.'];
    return SAFE_PREFIXES.some(prefix => path.startsWith(prefix));
}

// ────────────────────────────────────────────────────────────────────────────
// Generic operation runners
// ────────────────────────────────────────────────────────────────────────────

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

function runSetBoolean(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    if (!isAllowedTargetPath(op.targetPath)) {
        return noOpResult(brief, op.kind, op.targetPath, `Path "${op.targetPath}" is not an allowed target.`);
    }
    const value = op.params?.['value'];
    if (typeof value !== 'boolean') {
        return noOpResult(brief, op.kind, op.targetPath, `set_boolean requires params.value to be a boolean.`);
    }
    const current = getNestedValue(brief as unknown as Record<string, unknown>, op.targetPath);
    if (current === value) {
        return noOpResult(brief, op.kind, op.targetPath, `Field already set to ${String(value)} — no change.`);
    }
    const updatedBrief = setNestedValue(brief as unknown as Record<string, unknown>, op.targetPath, value) as unknown as CampaignAestheticBrief;
    return appliedResult(updatedBrief, op.kind, op.targetPath, `Set ${op.targetPath} = ${String(value)}.`, [op.targetPath]);
}

function runSetEnum(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    if (!isAllowedTargetPath(op.targetPath)) {
        return noOpResult(brief, op.kind, op.targetPath, `Path "${op.targetPath}" is not an allowed target.`);
    }
    const value = op.params?.['value'];
    if (typeof value !== 'string') {
        return noOpResult(brief, op.kind, op.targetPath, `set_enum requires params.value to be a string.`);
    }
    const updatedBrief = setNestedValue(brief as unknown as Record<string, unknown>, op.targetPath, value) as unknown as CampaignAestheticBrief;
    return appliedResult(updatedBrief, op.kind, op.targetPath, `Set ${op.targetPath} = "${value}".`, [op.targetPath]);
}

function runAppendSentence(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    if (!isAllowedTargetPath(op.targetPath)) {
        return noOpResult(brief, op.kind, op.targetPath, `Path "${op.targetPath}" is not an allowed target.`);
    }
    const sentence = op.params?.['sentence'];
    if (typeof sentence !== 'string') {
        return noOpResult(brief, op.kind, op.targetPath, `append_sentence_if_missing requires params.sentence.`);
    }
    const current = getNestedValue(brief as unknown as Record<string, unknown>, op.targetPath);
    const currentStr = typeof current === 'string' ? current : '';
    if (currentStr.includes(sentence)) {
        return noOpResult(brief, op.kind, op.targetPath, `Sentence already present — idempotent no-op.`);
    }
    const updated = currentStr ? `${currentStr} ${sentence}` : sentence;
    const updatedBrief = setNestedValue(brief as unknown as Record<string, unknown>, op.targetPath, updated) as unknown as CampaignAestheticBrief;
    return appliedResult(updatedBrief, op.kind, op.targetPath, `Appended sentence to ${op.targetPath}.`, [op.targetPath]);
}

function runPrependSentence(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    if (!isAllowedTargetPath(op.targetPath)) {
        return noOpResult(brief, op.kind, op.targetPath, `Path "${op.targetPath}" is not an allowed target.`);
    }
    const sentence = op.params?.['sentence'];
    if (typeof sentence !== 'string') {
        return noOpResult(brief, op.kind, op.targetPath, `prepend_sentence_if_missing requires params.sentence.`);
    }
    const current = getNestedValue(brief as unknown as Record<string, unknown>, op.targetPath);
    const currentStr = typeof current === 'string' ? current : '';
    if (currentStr.includes(sentence)) {
        return noOpResult(brief, op.kind, op.targetPath, `Sentence already present — idempotent no-op.`);
    }
    const updated = currentStr ? `${sentence} ${currentStr}` : sentence;
    const updatedBrief = setNestedValue(brief as unknown as Record<string, unknown>, op.targetPath, updated) as unknown as CampaignAestheticBrief;
    return appliedResult(updatedBrief, op.kind, op.targetPath, `Prepended sentence to ${op.targetPath}.`, [op.targetPath]);
}

const EXACT_TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|AM|PM)?\b/g;
const TIME_REPLACEMENT_MAP: Array<[RegExp, string]> = [
    [/\b([0-9]|1[0-2]):\d{2}\s*am\b/gi, 'morning'],
    [/\b([0-9]|1[0-2]):\d{2}\s*pm\b/gi, 'afternoon'],
    [/\b([01]?[0-9]|2[0-3]):\d{2}\b/g, 'a set time'],
];

function runNormalizeTimeStrings(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    if (!isAllowedTargetPath(op.targetPath)) {
        return noOpResult(brief, op.kind, op.targetPath, `Path "${op.targetPath}" is not an allowed target.`);
    }
    const current = getNestedValue(brief as unknown as Record<string, unknown>, op.targetPath);
    if (typeof current !== 'string') {
        return noOpResult(brief, op.kind, op.targetPath, `normalize_time_strings requires a string target field.`);
    }
    if (!EXACT_TIME_RE.test(current)) {
        EXACT_TIME_RE.lastIndex = 0;
        return noOpResult(brief, op.kind, op.targetPath, `No exact time strings found — idempotent no-op.`);
    }
    EXACT_TIME_RE.lastIndex = 0;
    let result = current;
    for (const [re, replacement] of TIME_REPLACEMENT_MAP) {
        result = result.replace(re, replacement);
    }
    const updatedBrief = setNestedValue(brief as unknown as Record<string, unknown>, op.targetPath, result) as unknown as CampaignAestheticBrief;
    return appliedResult(updatedBrief, op.kind, op.targetPath, `Replaced exact time strings in ${op.targetPath} with broad time-of-day phrases.`, [op.targetPath]);
}

const QUEUE_PATTERNS = [
    { re: /\b(check|view|open)\s+(your\s+)?(phone|app|device|screen)\b/gi, replacement: 'check the announcement' },
    { re: /\blaunch\s+(the\s+)?(app|website)\b/gi, replacement: 'visit the link' },
    { re: /\bclick\s+(the\s+)?link\s+in\s+(your|the)\s+bio\b/gi, replacement: 'find the link below' },
];

function runQueueDeviceHandling(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    if (!isAllowedTargetPath(op.targetPath)) {
        return noOpResult(brief, op.kind, op.targetPath, `Path "${op.targetPath}" is not an allowed target.`);
    }
    const current = getNestedValue(brief as unknown as Record<string, unknown>, op.targetPath);
    if (typeof current !== 'string') {
        return noOpResult(brief, op.kind, op.targetPath, `queue_device_handling requires a string target field.`);
    }
    let result = current;
    let changed = false;
    for (const { re, replacement } of QUEUE_PATTERNS) {
        const next = result.replace(re, replacement);
        if (next !== result) changed = true;
        result = next;
    }
    if (!changed) {
        return noOpResult(brief, op.kind, op.targetPath, `No queue/device phrases found — idempotent no-op.`);
    }
    const updatedBrief = setNestedValue(brief as unknown as Record<string, unknown>, op.targetPath, result) as unknown as CampaignAestheticBrief;
    return appliedResult(updatedBrief, op.kind, op.targetPath, `Replaced active device-use queue phrases in ${op.targetPath} with verbal-only phrasing.`, [op.targetPath]);
}

const BRANDED_VENUE_MAP: Record<string, string> = {
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

function runReplaceNamedVenues(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    if (!isAllowedTargetPath(op.targetPath)) {
        return noOpResult(brief, op.kind, op.targetPath, `Path "${op.targetPath}" is not an allowed target.`);
    }
    const current = getNestedValue(brief as unknown as Record<string, unknown>, op.targetPath);
    if (typeof current !== 'string') {
        return noOpResult(brief, op.kind, op.targetPath, `replace_named_venues_with_generic requires a string field.`);
    }
    let result = current;
    let changed = false;
    for (const [brand, generic] of Object.entries(BRANDED_VENUE_MAP)) {
        const re = new RegExp(`\\b${brand}\\b`, 'gi');
        const next = result.replace(re, generic);
        if (next !== result) changed = true;
        result = next;
    }
    if (!changed) {
        return noOpResult(brief, op.kind, op.targetPath, `No branded venue names found — idempotent no-op.`);
    }
    const updatedBrief = setNestedValue(brief as unknown as Record<string, unknown>, op.targetPath, result) as unknown as CampaignAestheticBrief;
    return appliedResult(updatedBrief, op.kind, op.targetPath, `Replaced branded venue names with generic labels in ${op.targetPath}.`, [op.targetPath]);
}

const PRIVACY_SENTENCE = 'Photos and videos taken during the event are subject to participant consent. Please respect others\' privacy.';
const FILMING_GATE_SENTENCE = 'All filming and photography requires prior written approval from the event organizer. Synthetic or stock footage may be substituted where permissions are not obtained.';
const RAIL_SAFETY_SENTENCE = 'Passengers must remain behind deck railings at all times and must not lean over or sit on railings.';
const MERCH_DISCLAIMER = 'Optional — no branded identifiers or personal information required on any merchandise items.';
const SCARCITY_REPLACEMENTS: Array<[RegExp, string]> = [
    [/\b(only\s+)?\d+\s*cabin(s)?\s*(left|remain(ing)?)\b/gi, 'cabin options available'],
    [/\blimited\s+availability\b/gi, 'check current availability'],
    [/\bselling\s+out\s*fast\b/gi, 'popular sailing'],
    [/\blast\s+(few\s+)?cabin(s)?\b/gi, 'remaining cabin options'],
    [/\bhurry\b/gi, 'plan ahead'],
    [/\bdon't\s+miss\s+out\b/gi, 'explore your options'],
    [/\bT-\d+\b/g, 'upcoming sailing'],
];

function runInjectPrivacyLine(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    return runAppendSentence(brief, { ...op, kind: 'append_sentence_if_missing', params: { sentence: PRIVACY_SENTENCE } });
}

function runInjectFilmingPermissionGate(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    return runAppendSentence(brief, { ...op, kind: 'append_sentence_if_missing', params: { sentence: FILMING_GATE_SENTENCE } });
}

function runInjectRailSafetyLanguage(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    return runAppendSentence(brief, { ...op, kind: 'append_sentence_if_missing', params: { sentence: RAIL_SAFETY_SENTENCE } });
}

function runReplacePhrasePatterns(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    if (!isAllowedTargetPath(op.targetPath)) {
        return noOpResult(brief, op.kind, op.targetPath, `Path "${op.targetPath}" is not an allowed target.`);
    }
    const patterns = op.params?.['patterns'] as string[] | undefined;
    const replacements = op.params?.['replacements'] as string[] | undefined;
    if (!patterns || !replacements || patterns.length !== replacements.length) {
        return noOpResult(brief, op.kind, op.targetPath, `replace_phrase_patterns requires matching patterns[] and replacements[] arrays.`);
    }
    const current = getNestedValue(brief as unknown as Record<string, unknown>, op.targetPath);
    if (typeof current !== 'string') {
        return noOpResult(brief, op.kind, op.targetPath, `replace_phrase_patterns requires a string target field.`);
    }
    let result = current;
    let changed = false;
    for (let i = 0; i < patterns.length; i++) {
        const re = new RegExp(patterns[i], 'gi');
        const next = result.replace(re, replacements[i]);
        if (next !== result) changed = true;
        result = next;
    }
    if (!changed) {
        return noOpResult(brief, op.kind, op.targetPath, `No matching phrases found — idempotent no-op.`);
    }
    const updatedBrief = setNestedValue(brief as unknown as Record<string, unknown>, op.targetPath, result) as unknown as CampaignAestheticBrief;
    return appliedResult(updatedBrief, op.kind, op.targetPath, `Replaced phrase patterns in ${op.targetPath}.`, [op.targetPath]);
}

// ── Result helpers ────────────────────────────────────────────────────────

function noOpResult(brief: CampaignAestheticBrief, kind: AestheticOperationKind, targetPath: string, summary: string): FixerResult {
    return {
        brief,
        applied: false,
        touchedPaths: [],
        appliedOperations: [{ kind, targetPath, status: 'no_op', summary }],
        followUps: [],
    };
}

function appliedResult(brief: CampaignAestheticBrief, kind: AestheticOperationKind, targetPath: string, summary: string, touchedPaths: string[]): FixerResult {
    return {
        brief,
        applied: true,
        touchedPaths,
        appliedOperations: [{ kind, targetPath, status: 'applied', summary }],
        followUps: [],
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Issue code → operations mapping
// ────────────────────────────────────────────────────────────────────────────

export const ISSUE_CODE_OPERATIONS: Record<AestheticIssueCode, AestheticModificationOperation[]> = {
    countdown_series_hard_scarcity: [
        { kind: 'replace_countdown_series', targetPath: 'videoConcepts.countdownSeries', params: { strategy: 'open_window_triplet' } },
    ],
    exact_time_strings: [
        { kind: 'normalize_time_strings', targetPath: 'copy.privacyLine' },
    ],
    queue_device_handling: [
        { kind: 'replace_phrase_patterns', targetPath: 'copy.privacyLine', params: { patterns: [], replacements: [] } },
    ],
    non_generic_venue_naming: [
        { kind: 'replace_named_venues_with_generic', targetPath: 'visual.compositionNotes' },
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
        { kind: 'set_enum', targetPath: 'videoConcepts.countdownSeries', params: {} },
    ],
    rail_safety_missing: [
        { kind: 'inject_rail_safety_language', targetPath: 'visual.compositionNotes' },
    ],
    merch_identifier_pressure: [
        { kind: 'append_sentence_if_missing', targetPath: 'visual.compositionNotes', params: { sentence: MERCH_DISCLAIMER } },
    ],
    privacy_line_missing: [
        { kind: 'inject_privacy_line', targetPath: 'visual.compositionNotes' },
    ],
    filming_permissions_missing: [
        { kind: 'inject_filming_permission_gate', targetPath: 'visual.compositionNotes' },
    ],
    compliance_risk_scarcity_copy: [
        { kind: 'replace_phrase_patterns', targetPath: 'videoConcepts.countdownSeries', params: {
            patterns: SCARCITY_REPLACEMENTS.map(([re]) => re.source),
            replacements: SCARCITY_REPLACEMENTS.map(([, r]) => r),
        }},
    ],
};

// ────────────────────────────────────────────────────────────────────────────
// Operation dispatcher
// ────────────────────────────────────────────────────────────────────────────

export function runOperation(brief: CampaignAestheticBrief, op: AestheticModificationOperation): FixerResult {
    switch (op.kind) {
        case 'replace_countdown_series':
            return fixCountdownSeries(brief);
        case 'set_boolean':
            return runSetBoolean(brief, op);
        case 'set_enum':
            return runSetEnum(brief, op);
        case 'append_sentence_if_missing':
            return runAppendSentence(brief, op);
        case 'prepend_sentence_if_missing':
            return runPrependSentence(brief, op);
        case 'normalize_time_strings':
            return runNormalizeTimeStrings(brief, op);
        case 'replace_named_venues_with_generic':
            return runReplaceNamedVenues(brief, op);
        case 'replace_phrase_patterns':
            return runReplacePhrasePatterns(brief, op);
        case 'inject_privacy_line':
            return runInjectPrivacyLine(brief, op);
        case 'inject_filming_permission_gate':
            return runInjectFilmingPermissionGate(brief, op);
        case 'inject_rail_safety_language':
            return runInjectRailSafetyLanguage(brief, op);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Deadlock suggestion helper
// ────────────────────────────────────────────────────────────────────────────

const ISSUE_DETECTION_PATTERNS: Array<{ issueCode: AestheticIssueCode; patterns: RegExp[] }> = [
    { issueCode: 'countdown_series_hard_scarcity', patterns: [/countdown/i, /T-\d+/i, /cabin(s)?\s*(left|remain)/i, /scarcity/i] },
    { issueCode: 'exact_time_strings', patterns: [/\d{1,2}:\d{2}/] },
    { issueCode: 'queue_device_handling', patterns: [/check.*?(app|phone|device)/i, /launch.*(app|website)/i] },
    { issueCode: 'non_generic_venue_naming', patterns: Object.keys(BRANDED_VENUE_MAP).map(b => new RegExp(`\\b${b}\\b`, 'i')) },
    { issueCode: 'avatar_required_video', patterns: [/avatar\s+required/i, /heygen.*required/i] },
    { issueCode: 'disallowed_video_tool', patterns: [/\bheygen\b/i] },
    { issueCode: 'rail_safety_missing', patterns: [/\brail(ing)?\b/i, /\bdeck\s+edge\b/i] },
    { issueCode: 'privacy_line_missing', patterns: [/\bphotos?\b/i, /\bfilming\b/i, /\brecord(ing)?\b/i] },
    { issueCode: 'compliance_risk_scarcity_copy', patterns: [/\bonly\s+\d+\b/i, /\blimited\s+spots?\b/i, /\bselling\s+out\b/i] },
];

export function suggestDeterministicIssueCodes(
    redTeamIssues: string[],
    requiredFixes: string,
): AestheticIssueCode[] {
    const combined = [...redTeamIssues, requiredFixes].join(' ').toLowerCase();
    const suggestions = new Set<AestheticIssueCode>();

    for (const { issueCode, patterns } of ISSUE_DETECTION_PATTERNS) {
        if (patterns.some(re => re.test(combined))) {
            suggestions.add(issueCode);
        }
    }

    return Array.from(suggestions);
}
