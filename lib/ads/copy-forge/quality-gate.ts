// lib/ads/copy-forge/quality-gate.ts
//
// Lightweight deterministic review pass that runs over an AdCopySet before
// any render is attempted. Catches the "technically valid but emotionally
// generic" failure mode that the schema cannot — anchor presence, role
// uniqueness, generic-cruise language, asset availability, etc.

import type {
    AdCopySet,
    AdFormat,
    CopyForgeInput,
    QualityCheckResult,
    QualityGateResult,
    SlotDescriptor,
    SlotPack,
} from '../types';

const GENERIC_CRUISE_PATTERNS: RegExp[] = [
    /\bset sail\b/i,
    /\bcruise of a lifetime\b/i,
    /\bunforgettable (?:voyage|journey|cruise|getaway)\b/i,
    /\bparadise awaits\b/i,
    /\byour (?:dream )?(?:vacation|getaway) (?:awaits|starts)\b/i,
    /\bbon voyage\b/i,
    /\bsmooth sailing\b/i,
    /\bocean of (?:possibilities|adventure)\b/i,
    /\ball[- ]inclusive escape\b/i,
];

const IMPERATIVE_LEAD_WORDS = new Set([
    'book', 'reserve', 'join', 'grab', 'claim', 'save', 'get', 'shop', 'see',
    'find', 'try', 'start', 'meet', 'come', 'sail', 'jump', 'add', 'lock',
    'pick', 'tap', 'rsvp', 'request', 'apply', 'hold', 'drop', 'take', 'go',
    'discover', 'explore', 'plan', 'pack', 'ride', 'board', 'invite', 'bring',
]);

function eachSlotPack(set: AdCopySet): SlotPack[] {
    const packs: SlotPack[] = [];
    for (const entry of Object.values(set.formats)) {
        if (!entry) continue;
        if (Array.isArray(entry)) packs.push(...entry);
        else packs.push(entry);
    }
    return packs;
}

function lowerJoin(values: string[]): string {
    return values.map((v) => v.toLowerCase()).join(' | ');
}

function nicheAnchorPool(input: CopyForgeInput): string[] {
    return [
        ...input.brief.nicheSignals,
        ...input.brief.propFamilies,
        ...input.brief.cruiseNativeMoments,
        ...(input.dossier?.specificExamples ?? []),
        ...(input.dossier?.allowedSignals ?? []),
    ]
        .map((s) => s.trim())
        .filter((s) => s.length >= 3);
}

function themeAnchorPool(input: CopyForgeInput): string[] {
    return [
        input.campaign.name,
        input.campaign.theme,
        input.brief.heroSlogan,
        input.brief.subSlogan,
        input.brief.emotionalPromise,
        ...input.brief.nicheSignals,
        ...input.brief.propFamilies,
        ...(input.dossier?.specificExamples ?? []),
        ...(input.dossier?.allowedSignals ?? []),
    ]
        .map((s) => s.trim())
        .filter((s) => s.length >= 3);
}

function explicitNicheTokenPool(input: CopyForgeInput): string[] {
    const base = [
        input.campaign.name,
        input.campaign.theme,
        input.brief.heroSlogan,
        input.brief.subSlogan,
        input.brief.emotionalPromise,
        ...input.brief.nicheSignals,
        ...input.brief.propFamilies,
        ...(input.dossier?.specificExamples ?? []),
        ...(input.dossier?.allowedSignals ?? []),
    ].join(' ');
    const extracted = base
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 5)
        .filter((token) => !new Set(['cruise', 'nights', 'western', 'caribbean', 'quietly', 'traveler', 'campaign']).has(token));
    return Array.from(new Set([
        ...extracted,
        'wellness',
        'nature',
        'yoga',
        'meditation',
        'mindful',
        'breath',
        'breathe',
        'stretch',
        'reset',
        'restore',
        'restorative',
    ]));
}

function textUsesAnchor(text: string, anchors: string[]): boolean {
    if (anchors.length === 0) return true; // no anchors known — cannot enforce
    const lower = text.toLowerCase();
    return anchors.some((anchor) => {
        const tokens = anchor.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
        return tokens.some((t) => lower.includes(t));
    });
}

function checkSpecificity(set: AdCopySet, input: CopyForgeInput): QualityCheckResult {
    const anchors = themeAnchorPool(input);
    const packs = eachSlotPack(set);
    const offenders = packs.filter((p) => !textUsesAnchor([p.headline, p.subhead, p.microcopy].join(' '), anchors));
    if (offenders.length > 0) {
        return {
            key: 'specificity',
            passed: false,
            severity: 'blocker',
            message: `${offenders.length} slot pack(s) do not reference any term from the campaign's niche/theme anchors across headline, subhead, or microcopy. Anchors available: ${lowerJoin(anchors.slice(0, 8))}.`,
        };
    }
    return {
        key: 'specificity',
        passed: true,
        severity: 'warning',
        message: 'Every slot pack anchors visible copy to at least one campaign-specific term.',
    };
}

function checkThemeDominance(set: AdCopySet, input: CopyForgeInput): QualityCheckResult {
    const packs = eachSlotPack(set);
    const logisticSources = [
        input.campaign.vessel,
        input.campaign.route,
        input.campaign.departure,
    ].filter((value) => value.trim().length > 0);
    const offenders: string[] = [];

    for (const pack of packs) {
        const visibleCopy = [pack.headline, pack.subhead, pack.microcopy].join(' ');
        for (const source of logisticSources) {
            if (containsAnyToken(visibleCopy, source)) {
                offenders.push(`"${visibleCopy}" leans on logistics from "${source}" instead of the niche theme`);
                break;
            }
        }
        if (containsLogisticDate(visibleCopy, input.campaign.departure)) {
            offenders.push(`"${visibleCopy}" includes date-like logistics in visible ad copy`);
        }
    }

    if (offenders.length > 0) {
        return {
            key: 'theme_dominance',
            passed: false,
            severity: 'blocker',
            message: `Visible ad copy must sell the niche theme, not the ship/route/date: ${offenders.join('; ')}.`,
        };
    }

    return {
        key: 'theme_dominance',
        passed: true,
        severity: 'warning',
        message: 'Visible copy keeps ship, route, and date out of the primary sales message.',
    };
}

function checkNicheVisibility(set: AdCopySet, input: CopyForgeInput): QualityCheckResult {
    const tokens = explicitNicheTokenPool(input);
    const packs = eachSlotPack(set);
    const offenders = packs.filter((pack) => !tokens.some((token) =>
        [pack.headline, pack.subhead, pack.microcopy].join(' ').toLowerCase().includes(token),
    ));

    if (offenders.length > 0) {
        return {
            key: 'niche_visibility',
            passed: false,
            severity: 'blocker',
            message: `${offenders.length} slot pack(s) do not explicitly portray the niche in visible copy. Use one of: ${tokens.slice(0, 16).join(', ')}.`,
        };
    }

    return {
        key: 'niche_visibility',
        passed: true,
        severity: 'warning',
        message: 'Visible copy explicitly signals the niche theme.',
    };
}

function checkImageDiversity(set: AdCopySet, input: CopyForgeInput): QualityCheckResult {
    const issues: string[] = [];
    for (const format of input.formats) {
        const packValue = set.formats[format];
        const layout = input.templateLayouts[format];
        if (!packValue || !layout) continue;
        const packs = Array.isArray(packValue) ? packValue : [packValue];
        const imageSlotCount = layout.slotDescriptors.filter((slot) => slot.type === 'image').length;
        const availableTypes = Object.entries(input.availableImages).filter(([, count]) => count > 0).map(([type]) => type);
        const requiredDistinct = Math.min(3, imageSlotCount, availableTypes.length);
        for (const pack of packs) {
            const usedTypes = new Set(Object.values(pack.imageSlotDirectives).map((directive) => directive.assetType));
            if (usedTypes.size < requiredDistinct) {
                issues.push(`${format} uses only ${usedTypes.size} image asset type(s); expected at least ${requiredDistinct} for this template`);
            }
        }
    }

    if (issues.length > 0) {
        return {
            key: 'image_diversity',
            passed: false,
            severity: 'blocker',
            message: `Image directives are too repetitive: ${issues.join('; ')}.`,
        };
    }

    return {
        key: 'image_diversity',
        passed: true,
        severity: 'warning',
        message: 'Image directives diversify asset types across the template.',
    };
}

function checkNonGenericity(set: AdCopySet): QualityCheckResult {
    const packs = eachSlotPack(set);
    const matches: string[] = [];
    for (const pack of packs) {
        const blob = [pack.headline, pack.subhead ?? '', pack.microcopy ?? ''].join(' ');
        for (const pattern of GENERIC_CRUISE_PATTERNS) {
            if (pattern.test(blob)) {
                matches.push(`"${pack.headline}" — matches ${pattern}`);
                break;
            }
        }
    }
    if (matches.length > 0) {
        return {
            key: 'non_genericity',
            passed: false,
            severity: 'blocker',
            message: `Generic cruise-brochure language detected: ${matches.join('; ')}.`,
        };
    }
    return {
        key: 'non_genericity',
        passed: true,
        severity: 'warning',
        message: 'No generic cruise-brochure phrases detected.',
    };
}

function checkImageCopyDependency(set: AdCopySet): QualityCheckResult {
    if (!set.compositionIntent || set.compositionIntent.trim().length < 60) {
        return {
            key: 'image_copy_dependency',
            passed: false,
            severity: 'blocker',
            message: 'compositionIntent is missing or too thin (<60 chars). Without a directorial north star, image-copy fusion cannot be evaluated.',
        };
    }
    const packs = eachSlotPack(set);
    const weak = packs.filter((p) => !p.compositionNote || p.compositionNote.trim().length < 20);
    if (weak.length > 0) {
        return {
            key: 'image_copy_dependency',
            passed: false,
            severity: 'blocker',
            message: `${weak.length} slot pack(s) missing a substantive compositionNote — copy and imagery are not described as a fused experience.`,
        };
    }
    return {
        key: 'image_copy_dependency',
        passed: true,
        severity: 'warning',
        message: 'compositionIntent and per-format compositionNotes are populated.',
    };
}

function checkVisualArcCoherence(set: AdCopySet): QualityCheckResult {
    const packs = eachSlotPack(set);
    const offenders: string[] = [];
    for (const pack of packs) {
        const roles = Object.values(pack.imageSlotDirectives).map((d) => d.narrativeRole.trim().toLowerCase());
        const unique = new Set(roles);
        if (unique.size !== roles.length) {
            offenders.push(`headline "${pack.headline}" reuses a narrativeRole across image slots`);
        }
    }
    if (offenders.length > 0) {
        return {
            key: 'visual_arc_coherence',
            passed: false,
            severity: 'blocker',
            message: `Image slot narrative roles must be unique within each pack: ${offenders.join('; ')}.`,
        };
    }
    return {
        key: 'visual_arc_coherence',
        passed: true,
        severity: 'warning',
        message: 'Every image slot in every pack has a distinct narrative role.',
    };
}

function ctaIsImperative(cta: string): boolean {
    const first = cta.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
    if (!first) return false;
    return IMPERATIVE_LEAD_WORDS.has(first);
}

function checkCtaFit(set: AdCopySet): QualityCheckResult {
    const packs = eachSlotPack(set);
    const offenders = packs.filter((p) => !ctaIsImperative(p.cta));
    if (offenders.length > 0) {
        return {
            key: 'cta_fit',
            passed: false,
            severity: 'blocker',
            message: `${offenders.length} CTA(s) do not start with a recognized imperative verb: ${offenders.map((p) => `"${p.cta}"`).join(', ')}.`,
        };
    }
    return {
        key: 'cta_fit',
        passed: true,
        severity: 'warning',
        message: 'Every CTA reads as imperative action.',
    };
}

function checkCompliance(set: AdCopySet, input: CopyForgeInput): QualityCheckResult {
    const banned = input.brief.avoidDirectives
        .map((d) => d.trim().toLowerCase())
        .filter((d) => d.length >= 3);
    if (banned.length === 0) {
        return {
            key: 'compliance',
            passed: true,
            severity: 'warning',
            message: 'No avoidDirectives defined for this brief.',
        };
    }
    const packs = eachSlotPack(set);
    const hits: string[] = [];
    for (const pack of packs) {
        const blob = [pack.headline, pack.subhead ?? '', pack.microcopy ?? '', pack.cta]
            .join(' ')
            .toLowerCase();
        for (const term of banned) {
            if (blob.includes(term)) {
                hits.push(`"${pack.headline}" contains banned term "${term}"`);
                break;
            }
        }
    }
    if (hits.length > 0) {
        return {
            key: 'compliance',
            passed: false,
            severity: 'blocker',
            message: `avoidDirectives violated: ${hits.join('; ')}.`,
        };
    }
    return {
        key: 'compliance',
        passed: true,
        severity: 'warning',
        message: 'No avoidDirectives violations detected.',
    };
}

function checkSlotFit(set: AdCopySet, input: CopyForgeInput): QualityCheckResult {
    const issues: string[] = [];

    const checkTextSlot = (format: AdFormat, pack: SlotPack, slot: SlotDescriptor) => {
        const value = textValueForSlot(pack, slot.name);
        if (!value) return;
        const label = `${format}.${slot.name}`;
        if (slot.maxChars !== undefined && value.length > slot.maxChars) {
            issues.push(`${label} "${value}" exceeds ${slot.maxChars} chars`);
        }
        if (slot.maxWords !== undefined && wordCount(value) > slot.maxWords) {
            issues.push(`${label} "${value}" exceeds ${slot.maxWords} words`);
        }
        if (slot.maxLines !== undefined && estimatedLineCount(value, slot.maxChars) > slot.maxLines) {
            issues.push(`${label} "${value}" exceeds estimated ${slot.maxLines} line(s)`);
        }
        if (slot.name === 'headline' && /[.!?]$/.test(value.trim())) {
            issues.push(`${label} "${value}" ends with sentence punctuation`);
        }
        if (slot.disallow?.includes('date') && containsLogisticDate(value, input.campaign.departure)) {
            issues.push(`${label} "${value}" includes a date even though this slot forbids logistics`);
        }
        if (slot.disallow?.includes('port') && containsAnyToken(value, input.campaign.route)) {
            issues.push(`${label} "${value}" includes route/port text even though this slot forbids logistics`);
        }
        if (slot.disallow?.includes('ship') && containsAnyToken(value, input.campaign.vessel)) {
            issues.push(`${label} "${value}" includes ship text even though this slot forbids logistics`);
        }
    };

    for (const format of input.formats) {
        const packValue = set.formats[format];
        const layout = input.templateLayouts[format];
        if (!packValue || !layout) continue;
        const packs = Array.isArray(packValue) ? packValue : [packValue];
        const textSlots = layout.slotDescriptors.filter((slot) => slot.type === 'text');
        for (const pack of packs) {
            if (pack.cta.length > 20) issues.push(`${format}.cta "${pack.cta}" exceeds 20 chars`);
            for (const slot of textSlots) {
                checkTextSlot(format, pack, slot);
            }
        }
    }

    for (const pack of eachSlotPack(set)) {
        for (const [slotName, dir] of Object.entries(pack.imageSlotDirectives)) {
            const inv = input.availableImages[dir.assetType];
            if (inv === undefined || inv <= 0) {
                issues.push(`slot ${slotName} requires assetType "${dir.assetType}" but availableImages[${dir.assetType}] = ${inv ?? 0}`);
            }
        }
    }
    if (issues.length > 0) {
        return {
            key: 'slot_fit',
            passed: false,
            severity: 'blocker',
            message: `Slot fit failures: ${issues.join('; ')}.`,
        };
    }
    return {
        key: 'slot_fit',
        passed: true,
        severity: 'warning',
        message: 'All length limits, period rules, and asset-type availability checks pass.',
    };
}

function textValueForSlot(pack: SlotPack, slotName: string): string {
    switch (slotName) {
        case 'headline':
            return pack.headline;
        case 'subhead':
            return pack.subhead;
        case 'microcopy':
            return pack.microcopy;
        case 'cta':
            return pack.cta;
        default:
            return '';
    }
}

function wordCount(value: string): number {
    return value.trim().split(/\s+/).filter(Boolean).length;
}

function estimatedLineCount(value: string, maxChars: number | undefined): number {
    if (!maxChars || maxChars <= 0) return 1;
    return Math.max(1, Math.ceil(value.length / Math.max(1, Math.floor(maxChars / 2))));
}

function containsLogisticDate(value: string, departure: string): boolean {
    const lower = value.toLowerCase();
    if (/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\.?\b/i.test(value)) return true;
    if (/\b20\d{2}\b/.test(value)) return true;
    return containsAnyToken(lower, departure);
}

function containsAnyToken(value: string, source: string): boolean {
    const lower = value.toLowerCase();
    return source
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 4)
        .some((token) => lower.includes(token));
}

export function runQualityGate(set: AdCopySet, input: CopyForgeInput): QualityGateResult {
    const checks: QualityCheckResult[] = [
        checkSpecificity(set, input),
        checkNicheVisibility(set, input),
        checkThemeDominance(set, input),
        checkImageCopyDependency(set),
        checkNonGenericity(set),
        checkVisualArcCoherence(set),
        checkImageDiversity(set, input),
        checkCtaFit(set),
        checkCompliance(set, input),
        checkSlotFit(set, input),
    ];
    const blockerCount = checks.filter((c) => !c.passed && c.severity === 'blocker').length;
    const warningCount = checks.filter((c) => !c.passed && c.severity === 'warning').length;
    return {
        passed: blockerCount === 0,
        blockerCount,
        warningCount,
        checks,
    };
}

/**
 * Formats failed checks as plain-text bullets for injection into a
 * regeneration prompt. Returns null when every check passed.
 */
export function failedChecksAsPromptHint(gate: QualityGateResult): string | null {
    const failed = gate.checks.filter((c) => !c.passed);
    if (failed.length === 0) return null;
    return failed
        .map((c) => `- [${c.severity.toUpperCase()}::${c.key}] ${c.message}`)
        .join('\n');
}
