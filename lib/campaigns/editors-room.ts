/**
 * Editor's Room pipeline — replaces monolithic visual-planning generation.
 *
 * Four specialized steps:
 *   1. generateActionAnchors        — community-native action seeds
 *   2. generateLandingStillBible    — 6 stills from locked anchors + slot rules
 *   3. repairFailingStills          — one-pass isolated repair for specific stills
 *   4. generateProductionBibleFromStills — scene library + storyboards from validated stills
 */

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import type { Campaign } from './types';
import type { CampaignAestheticBrief, LandingStillBible, LandingStillSpec, ProductionBuildLintIssue } from './schema';
import { LandingStillBibleSchema, LandingStillSlotRoleEnum, LandingStillSpecSchema, ProductionBibleSchema } from './schema';
import { VIDEO_DELIVERABLE_SPECS } from './media/video-deliverable-specs';
import { ModelName, getModelConfig } from '@/lib/ai/llm-gateway';
import {
    buildLintComplianceBlock,
    getCanonicalShipName,
    buildShipContext,
    buildEventFramingGuidance,
    joinCampaignList,
    sanitizePromptList,
} from './aesthetic-engine';
import { getReferencePack, formatReferencePackForGeneration, formatReferenceBundleForPrompt, getSlotReferenceBundle } from './reference-packs';
import { CameraDistanceEnum, FramingModeEnum } from './reference-pack-types';

// ── Generation-only schemas: audit fields required (OpenAI structured output rejects .optional fields) ──
// These are used ONLY for generateObject calls. schema.ts keeps .optional() for backward-compat reading
// of persisted stills that pre-date the audit fields.

const StillSpecForGenerationSchema = LandingStillSpecSchema.extend({
    anchorId: z.string(),
    slotRole: LandingStillSlotRoleEnum,
    nicheCarryThrough: z.string(),
    // ── Shot-intent underlayer (required in generation) ──
    shotIntent: z.string(),
    cameraDistance: CameraDistanceEnum,
    framingMode: FramingModeEnum,
    heroSubject: z.string(),
    nicheCue: z.string(),
    antiFallbackNote: z.string(),
    referencePackId: z.string(),
});

const BibleForGenerationSchema = LandingStillBibleSchema.extend({
    stillLibrary: z.array(StillSpecForGenerationSchema),
});

const RepairResultSchema = z.object({ stills: z.array(StillSpecForGenerationSchema) });

// ── Internal: anchor schema (intermediate only — not exported as a named type) ──

const ActionAnchorSchema = z.object({
    anchorId: z.string(),
    communityAction: z.string(),
    locationFamily: z.string(),
    nicheSignal: z.string(),
    socialUnit: z.enum(['solo', 'pair']),
    emotionalRegister: z.string(),
});

const ActionAnchorSetSchema = z.object({
    anchors: z.array(ActionAnchorSchema).min(6).max(8),
});

type ActionAnchorSet = z.infer<typeof ActionAnchorSetSchema>;

// ── Model helper ──────────────────────────────────────────────────────────────

function getHighModel() {
    const cfg = getModelConfig(ModelName.GPT_5_HIGH);
    return openai(cfg.apiId ?? ModelName.GPT_5_HIGH);
}

// ── Step 1: Generate community-native action anchors ─────────────────────────

export async function generateActionAnchors(
    campaign: Campaign,
    brief: CampaignAestheticBrief,
): Promise<ActionAnchorSet> {
    const model = getHighModel();
    const nicheKw = (campaign.targetingKeywords ?? []).join(', ') || campaign.name;
    const belonging = brief.communityExpression?.belongingSignals?.join('; ') ?? 'None';
    const solitudeAnti = brief.communityExpression?.solitudeAntiPatterns?.join('; ') ?? 'None';

    const system = `
You are a community strategist seeding a landing still set for a niche cruise campaign.
Generate 6-8 community-native action anchors. Each anchor seeds one specific landing still.

RULES:
- communityAction: describe a concrete, observable scene a member of THIS community would naturally create on a cruise. Vacation tone only — no study, no workshops, no work.
- locationFamily: name the ship zone (promenade, pool deck, library, spa solarium, dining lounge, cabin balcony, embarkation pier, ship atrium, etc.). No two anchors may share a location family.
- nicheSignal: one specific term from the campaign niche vocabulary that will be embedded in the still description to satisfy the niche scanner.
- socialUnit: 'solo' or 'pair'. Use each at least twice across the set.
- emotionalRegister: the vacation feeling this moment produces.

BANNED FALLBACK ANCHORS (do not generate these):
- couple laughing at railing with nothing niche in frame
- solo guest gazing contemplatively at the ocean
- couple facing the horizon at wide distance
- candlelit dining intimacy with no niche context

Niche vocabulary: ${nicheKw}
Belonging signals: ${belonging}
Solitude anti-patterns to avoid as anchor seeds: ${solitudeAnti}
`.trim();

    console.log(`[editors-room] generateActionAnchors for ${campaign.id}`);
    const { object } = await generateObject({
        model,
        schema: ActionAnchorSetSchema,
        system,
        prompt: `Campaign: ${campaign.name}\nShip: ${getCanonicalShipName(campaign)}\nDestination: ${campaign.targetDestination ?? 'TBD'}`,
    });

    return object;
}

// ── Step 2: Generate landing still bible from locked anchors ──────────────────

export async function generateLandingStillBible(
    campaign: Campaign,
    brief: CampaignAestheticBrief,
    anchors: ActionAnchorSet,
    options?: { correctionContext?: string },
): Promise<LandingStillBible> {
    const model = getHighModel();
    const lintBlock = buildLintComplianceBlock(campaign, brief.communityExpression?.belongingSignals);
    const anchorList = anchors.anchors
        .map((a, i) => `anchorId="${a.anchorId}" | Slot ${i + 1}: [${a.locationFamily}] [${a.socialUnit}] [niche="${a.nicheSignal}"] — ${a.communityAction} | feel: ${a.emotionalRegister}`)
        .join('\n');

    // ── Reference grounding ──────────────────────────────────────────────
    const refPack = getReferencePack(campaign);
    const referenceBlock = refPack ? formatReferencePackForGeneration(refPack) : '';
    const refPackId = refPack?.referencePackId ?? 'none';

    const system = `
You are a visual director translating community action anchors into 6 landing still specs for a niche cruise campaign.

SLOT ASSIGNMENT — for each still, populate the audit and shot-intent fields:
  anchorId: copy the anchorId value from the anchor that seeded this still
  slotRole: set to the enum value for this slot (HERO_PRIMARY, HERO_ALT, EDITORIAL_WIDE_A, EDITORIAL_WIDE_B, INTIMATE, or FLEX)
  nicheCarryThrough: write the exact niche keyword or phrase you embedded in BOTH imagePrompt AND subjectAction
  shotIntent: one sentence describing what this still must communicate
  cameraDistance: one of extreme_wide, wide, medium_wide, medium, medium_close, close_up, macro
  framingMode: one of establishing, environmental_portrait, over_the_shoulder, two_shot, single_subject, detail_insert, overhead, low_angle_hero
  heroSubject: the primary subject that must be visible and recognizable
  nicheCue: the specific niche object, prop, or action visible in frame
  antiFallbackNote: one sentence explaining what generic fallback this still avoids
  referencePackId: set to "${refPackId}"

- Slot 1 → slotRole=HERO_PRIMARY, usage="hero_primary" — wide — niche in imagePrompt + subjectAction — no cabin/window setup
- Slot 2 → slotRole=HERO_ALT, usage="hero_alt" — wide or medium — niche in both fields — different location family than Slot 1
- Slot 3 → slotRole=EDITORIAL_WIDE_A, usage="concept" or "email_header" — composition MUST NOT contain intimate/close/tight/detail — niche in both fields — NOT railing/balcony/horizon fallback
- Slot 4 → slotRole=EDITORIAL_WIDE_B, usage="concept" or "email_header" — composition MUST NOT contain intimate/close/tight/detail — niche in both fields — different location family AND social unit from Slot 3
- Slot 5 → slotRole=INTIMATE, usage="concept" — composition MUST contain "intimate", "close", "tight", or "detail" — niche in both fields — NOT candlelit dining fallback
- Slot 6 → slotRole=FLEX, usage="hero_alt", "email_header", "social_square", or "concept" — niche in imagePrompt or subjectAction — least-used location family so far

LOCATION CONTRACT — each still's 'location' field MUST match the locationFamily declared in its anchor seed:
  If anchor locationFamily is "balcony" → still location field MUST contain the word "balcony" — do not write only "railing" or "rail" without balcony present
  If anchor locationFamily is "deck" → still location must be on an open deck area — do not write "railing" or "balcony" as the primary descriptor
  If anchor locationFamily is "dining" → still location must be in a dining venue
  If anchor locationFamily is "library" → still location must be in the ship library or reading room — do not use pool, deck, or railing locations
  If anchor locationFamily is "spa" or "solarium" → still location must be in a spa, solarium, or thermal area
  If anchor locationFamily is "atrium" → still location must be in the ship atrium or grand lobby
  Do not substitute a different location family even if the scene idea is more compelling.
  The location field must contain at least one concrete keyword from the anchor's declared locationFamily.

ANCHOR SEEDS (translate each into a full still spec; set anchorId accordingly):
${anchorList}
${referenceBlock}
${lintBlock}
${options?.correctionContext ? `\nHARD FAILURES FROM PREVIOUS GENERATION — you MUST fix ALL of the following in this regeneration:\n${options.correctionContext}\n` : ''}
FINAL SELF-CHECK: verify each still has (1) anchorId set, (2) slotRole set, (3) nicheCarryThrough set to the exact term present in both imagePrompt and subjectAction, (4) no two stills share a location family, (5) no generic fallback repeated more than once, (6) shotIntent + nicheCue + heroSubject are filled, (7) nicheCue names a specific niche object or action visible in the scene, (8) each still's location field contains a concrete keyword from its anchor's declared locationFamily — for a balcony anchor the word "balcony" must appear in the location field, not just "railing".
`.trim();

    const ctx = `
Campaign: ${campaign.name}
Ship: ${getCanonicalShipName(campaign)}
Ship Context: ${buildShipContext(campaign)}
Destination: ${campaign.targetDestination ?? 'TBD'}
Highlight Events: ${joinCampaignList(sanitizePromptList(campaign.highlightEvents))}
Event Framing: ${buildEventFramingGuidance(campaign)}
Community Promise: ${brief.communityExpression?.corePromise ?? ''}
Belonging Signals: ${brief.communityExpression?.belongingSignals?.join('; ') ?? ''}
Plausibility Principle: ${brief.visual?.plausibilityFramework?.governingPrinciple ?? ''}
`.trim();

    console.log(`[editors-room] generateLandingStillBible for ${campaign.id} (refPack=${refPackId})`);
    const { object } = await generateObject({
        model,
        schema: BibleForGenerationSchema,
        system,
        prompt: ctx,
    });

    return object;
}

// ── Step 3.1: Deterministic editorial composition normalizer ──────────────────
// Lint's extractShotRole classifies concept-usage stills with intimate/close/tight/detail
// composition keywords as 'intimate' rather than 'editorial'. EDITORIAL_WIDE slots must
// never carry those keywords. This step runs after generation and before anchor compliance
// so the compliance gate and lint both see corrected compositions.

const INTIMATE_KEYWORD_REPLACEMENTS: [RegExp, string][] = [
    [/\bintimate\b/gi, 'wide'],
    [/\bclose-up\b/gi, 'medium'],
    [/\bclose\b/gi, 'medium'],
    [/\btight\b/gi, 'medium'],
    [/\bdetailed\b/gi, 'environmental'],
    [/\bdetail\b/gi, 'environmental'],
];

export function normalizeEditorialCompositions(bible: LandingStillBible): LandingStillBible {
    const EDITORIAL_WIDE_ROLES = new Set(['EDITORIAL_WIDE_A', 'EDITORIAL_WIDE_B']);
    let changed = false;
    const stillLibrary = bible.stillLibrary.map(still => {
        if (!still.slotRole || !EDITORIAL_WIDE_ROLES.has(still.slotRole)) return still;
        const compLC = still.composition.toLowerCase();
        const needsFix = INTIMATE_KEYWORDS.some(kw => compLC.includes(kw));
        if (!needsFix) return still;
        let fixed = still.composition;
        for (const [pattern, replacement] of INTIMATE_KEYWORD_REPLACEMENTS) {
            fixed = fixed.replace(pattern, replacement);
        }
        changed = true;
        return { ...still, composition: fixed };
    });
    if (!changed) return bible;
    return { ...bible, stillLibrary };
}

// ── Step 3.2: Deterministic editorial usage normalizer ──────────────────────
// Fixes invalid usage values on EDITORIAL_WIDE_A and EDITORIAL_WIDE_B stills.
// If the model generates a non-allowed usage (e.g. 'medium_wide', 'hero_primary')
// for an editorial slot, normalize it to 'concept' before anchor compliance runs.

const EDITORIAL_WIDE_ALLOWED_USAGES = new Set<LandingStillSpec['usage']>(['concept', 'email_header']);

export function normalizeEditorialUsage(bible: LandingStillBible): LandingStillBible {
    const EDITORIAL_WIDE_ROLES = new Set(['EDITORIAL_WIDE_A', 'EDITORIAL_WIDE_B']);
    let changed = false;
    const stillLibrary = bible.stillLibrary.map(still => {
        if (!still.slotRole || !EDITORIAL_WIDE_ROLES.has(still.slotRole)) return still;
        if (EDITORIAL_WIDE_ALLOWED_USAGES.has(still.usage)) return still;
        changed = true;
        return { ...still, usage: 'concept' as LandingStillSpec['usage'] };
    });
    if (!changed) return bible;
    return { ...bible, stillLibrary };
}

// ── Step 3: Repair only the failing stills (one pass, isolated) ───────────────

export async function repairFailingStills(
    campaign: Campaign,
    brief: CampaignAestheticBrief,
    currentBible: LandingStillBible,
    failingStillIds: string[],
    blockerIssues: ProductionBuildLintIssue[],
    anchorViolationsBlock?: string,
): Promise<LandingStillSpec[]> {
    const model = getHighModel();
    const lintBlock = buildLintComplianceBlock(campaign, brief.communityExpression?.belongingSignals);

    const failingStills = currentBible.stillLibrary.filter(s => failingStillIds.includes(s.stillId));
    const passingStills = currentBible.stillLibrary.filter(s => !failingStillIds.includes(s.stillId));

    const blockerSummary = blockerIssues
        .map(i => `[${i.code}] ${i.message}`)
        .join('\n');

    const passingContext = passingStills
        .map(s => [
            `stillId=${s.stillId} | slotRole=${s.slotRole ?? 'unknown'} | location=${s.location} | usage=${s.usage}`,
            `  nicheCarryThrough: ${s.nicheCarryThrough ?? '(not set)'}`,
        ].join('\n'))
        .join('\n');

    // ── Reference grounding for repair ───────────────────────────────────
    const refPack = getReferencePack(campaign);
    const refPackId = refPack?.referencePackId ?? 'none';
    const slotRefBlocks = failingStills.map(s => {
        if (!refPack || !s.slotRole) return '';
        const bundle = getSlotReferenceBundle(refPack, s.slotRole);
        return `\nREFERENCE FOR ${s.stillId} (${s.slotRole}):\n${formatReferenceBundleForPrompt(bundle)}`;
    }).filter(Boolean).join('\n');

    const failingContext = failingStills
        .map(s => [
            `stillId=${s.stillId} | slotRole=${s.slotRole ?? 'unknown'} | anchorId=${s.anchorId ?? 'unknown'} | location=${s.location} | usage=${s.usage}`,
            `  imagePrompt: ${s.imagePrompt}`,
            `  subjectAction: ${s.subjectAction}`,
            `  nicheCarryThrough (current, failing): ${s.nicheCarryThrough ?? '(missing)'}`,
        ].join('\n'))
        .join('\n\n');

    const system = `
You are repairing specific failing landing stills for a niche cruise campaign.
Rewrite ONLY the failing stills listed below. Return them with their original stillId values.
Do not touch or describe passing stills.

AUDIT FIELDS — each repaired still must include:
  anchorId: preserve the original value from the failing still
  slotRole: preserve the original value from the failing still
  nicheCarryThrough: write the EXACT niche keyword or phrase you embedded in BOTH imagePrompt AND subjectAction to resolve the blocker
  shotIntent: one sentence describing what this still must communicate
  cameraDistance: one of extreme_wide, wide, medium_wide, medium, medium_close, close_up, macro
  framingMode: one of establishing, environmental_portrait, over_the_shoulder, two_shot, single_subject, detail_insert, overhead, low_angle_hero
  heroSubject: the primary subject that must be visible and recognizable
  nicheCue: the specific niche object, prop, or action visible in frame
  antiFallbackNote: one sentence explaining what generic fallback this still avoids
  referencePackId: set to "${refPackId}"

BLOCKERS TO RESOLVE:
${blockerSummary}
${anchorViolationsBlock ? `\n${anchorViolationsBlock}\n` : ''}
PASSING STILLS (for reference — do not repeat their location families or niche terms):
${passingContext}
${slotRefBlocks}
${lintBlock}

For each repaired still:
- Embed a niche term in BOTH imagePrompt AND subjectAction.
- The location field MUST contain at least one concrete keyword from the anchor's declared locationFamily. If the anchor locationFamily is "balcony", the word "balcony" must appear in the location field.
- Use a location family not already claimed by ANY other still (passing or failing — each still in this repair batch must use a DIFFERENT location family).
- Avoid every generic fallback family.
- SELF-CHECK before output: confirm the repaired still's location field contains a keyword matching its anchor's declared locationFamily.
- Use the reference examples as guides for niche-native imagery.
`.trim();

    const prompt = `
Campaign: ${campaign.name} | Ship: ${getCanonicalShipName(campaign)}
Belonging signals: ${brief.communityExpression?.belongingSignals?.join('; ') ?? ''}

FAILING STILLS TO REPAIR:
${failingContext}
`.trim();

    console.log(`[editors-room] repairFailingStills for ${campaign.id}: ${failingStillIds.join(', ')} (refPack=${refPackId})`);
    const { object } = await generateObject({ model, schema: RepairResultSchema, system, prompt });
    return object.stills;
}

// ── Step 4: Generate production bible from validated stills ───────────────────

export async function generateProductionBibleFromStills(
    campaign: Campaign,
    brief: CampaignAestheticBrief,
    landingStillBible: LandingStillBible,
): Promise<z.infer<typeof ProductionBibleSchema>> {
    const model = getHighModel();

    const stillSummary = landingStillBible.stillLibrary
        .map(s => `[${s.slotRole ?? s.usage}] ${s.location}: ${s.subjectAction}${s.nicheCarryThrough ? ` | niche="${s.nicheCarryThrough}"` : ''}`)
        .join('\n');

    const visual = brief.visual;
    const casting = visual?.humanRepresentation;
    const plausibility = visual?.plausibilityFramework;
    const communityExpression = brief.communityExpression;

    const system = `
You are the Creative Director generating a Production Bible for a niche cruise campaign.
The landing still set is already validated. Use it as the community identity reference.

SCENE LIBRARY (10 scenes) + STORYBOARD RULES:
- Vary across at least 6 ship reference categories: exterior, pool_deck, dining, stateroom, atrium, nightclub, spa, destination_port, theater, sports_deck, offboard_excursion
- mood: vacation emotion only (wonder, FOMO, joy, serenity, intimacy, awe, belonging, thrill, magic, freedom)
- subjectAction: what the person EXPERIENCES, not what they DO — aspiration format
- At least 6 of 10 scenes must show two or more people in relaxed proximity
- Camera angles vary: wide establishing, low-angle hero, overhead crane, eye-level tracking, close-up, dutch angle
- For video scenes: humans as background accents, ship/sea/architecture as dominant subject
- subjectMotion: default to no human motion — frozen human presence in a living environment
- cameraMovement and environmentMotion carry all sensation of life
- avoidDirectives must include: "No slideshow parallax", "No static tripod framing", "No repeated camera movement across consecutive shots", "No empty scenes", "No corporate body language"

STORYBOARD RULES:
- Each storyboard: intrigue/hook → building desire → peak euphoria → "this could be you" CTA arc
- No two CONSECUTIVE shots may use the same sceneId
- Camera movements vary per shot: dolly forward/back, crane rise/drop, orbit, steadicam, push-in, pull-out, handheld follow, whip pan, slow arc
- transitionIn/transitionOut: hard cut, cross-dissolve, whip pan, match cut, fade from black, J-cut, L-cut
- narrationSegment: premium travel documentary voiceover — warm, personal, aspirational
- Do not design shots around walking toward camera, dancing, clinking, sipping, or hand-to-object choreography
`.trim();

    const ctx = `
Campaign: ${campaign.name}
Ship: ${getCanonicalShipName(campaign)}
Ship Context: ${buildShipContext(campaign)}
Destination: ${campaign.targetDestination ?? 'TBD'}
Highlight Events: ${joinCampaignList(sanitizePromptList(campaign.highlightEvents))}
Event Framing: ${buildEventFramingGuidance(campaign)}
Aesthetic: ${visual?.aestheticLabel ?? ''}
Imagery Mood: ${visual?.imageryMood ?? ''}
Lighting: ${visual?.lightingStyle ?? ''}
Casting Goal: ${casting?.castingGoal ?? ''}
Age Range: ${casting?.ageRangeGuidance ?? ''}
Community Promise: ${communityExpression?.corePromise ?? ''}
Belonging Signals: ${communityExpression?.belongingSignals?.join('; ') ?? ''}
Governing Principle: ${plausibility?.governingPrinciple ?? ''}
Cruise-native moments: ${plausibility?.cruiseNativeMoments?.join('; ') ?? ''}
Implausible bans: ${plausibility?.implausibleLiteralizations?.join('; ') ?? ''}

VALIDATED LANDING STILLS (reference for campaign identity):
${stillSummary}

Video Deliverables:
${VIDEO_DELIVERABLE_SPECS.map(d => `- ${d.id}: "${d.title}" (${d.durationSeconds}s, ${d.shotCount} shots)`).join('\n')}
`.trim();

    console.log(`[editors-room] generateProductionBibleFromStills for ${campaign.id}`);
    const { object } = await generateObject({
        model,
        schema: ProductionBibleSchema,
        system,
        prompt: ctx,
    });

    return object;
}

// ── Anchor compliance types ────────────────────────────────────────────────────

type AnchorViolationType =
    | 'missing_anchor_binding'
    | 'niche_signal_dropped'
    | 'niche_carry_mismatch'
    | 'anchor_location_mismatch'
    | 'duplicate_slot_role'
    | 'slot_usage_mismatch'
    | 'duplicate_location_family';

export interface AnchorViolation {
    stillId: string;
    violationType: AnchorViolationType;
    message: string;
    expected: string;
    actual: string;
}

export interface AnchorComplianceResult {
    violations: AnchorViolation[];
    passed: boolean;
}

const SLOT_ROLE_USAGE_MAP: Record<string, { allowedUsages: string[]; compositionRule?: 'intimate' | 'wide' }> = {
    HERO_PRIMARY: { allowedUsages: ['hero_primary'] },
    HERO_ALT: { allowedUsages: ['hero_alt'] },
    EDITORIAL_WIDE_A: { allowedUsages: ['concept', 'email_header'], compositionRule: 'wide' },
    EDITORIAL_WIDE_B: { allowedUsages: ['concept', 'email_header'], compositionRule: 'wide' },
    INTIMATE: { allowedUsages: ['concept'], compositionRule: 'intimate' },
    FLEX: { allowedUsages: ['hero_alt', 'concept', 'email_header', 'social_square'] },
};

const INTIMATE_KEYWORDS = ['intimate', 'close', 'tight', 'detail'];

const LOCATION_FAMILY_KEYWORDS: Array<[string[], string]> = [
    [['balcony'], 'balcony'],
    [['rail', 'railing'], 'rail'],
    [['pool', 'lido'], 'pool_deck'],
    [['bow', 'stern', 'promenade'], 'promenade'],  // before cabin — 'promenade window nook' → promenade
    [['deck', 'outdoor'], 'deck'],
    [['cabin', 'stateroom', 'porthole'], 'cabin'],  // 'window' removed — too generic, matches promenade/library windows
    [['library', 'reading room'], 'library'],
    [['spa', 'solarium', 'thermal'], 'spa'],
    [['dining', 'restaurant', 'meal', 'table'], 'dining'],
    [['lounge', 'bar'], 'lounge'],
    [['atrium', 'lobby', 'grand hall'], 'atrium'],
    [['pier', 'dock', 'harbor', 'shore', 'port'], 'port'],
    [['theater', 'stage', 'auditorium'], 'theater'],
    [['sports', 'court', 'track', 'pickleball', 'basketball'], 'sports_deck'],
];

function inferLocationFamilyFromText(text: string): string {
    const normalized = text.toLowerCase();
    for (const [keywords, family] of LOCATION_FAMILY_KEYWORDS) {
        if (keywords.some(keyword => normalized.includes(keyword))) {
            return family;
        }
    }
    return 'other';
}

function inferLocationFamilyFromStillFields(location: string, environmentDetails: string): string {
    const locationFamily = inferLocationFamilyFromText(location);
    if (locationFamily !== 'other') {
        return locationFamily;
    }
    return inferLocationFamilyFromText(environmentDetails);
}

// ── Step 5: Deterministic anchor-compliance validation ─────────────────────────

export function validateAnchorCompliance(
    anchors: { anchorId: string; nicheSignal: string; locationFamily: string }[],
    bible: LandingStillBible,
): AnchorComplianceResult {
    const violations: AnchorViolation[] = [];
    const anchorMap = new Map(anchors.map(a => [a.anchorId, a]));
    const stills = bible.stillLibrary;

    for (const still of stills) {
        // ── Check 1: anchorId exists and maps to a real anchor ──────────
        if (!still.anchorId || !anchorMap.has(still.anchorId)) {
            violations.push({
                stillId: still.stillId,
                violationType: 'missing_anchor_binding',
                message: `anchorId "${still.anchorId ?? '(empty)'}" does not match any generated anchor`,
                expected: `one of: ${anchors.map(a => a.anchorId).join(', ')}`,
                actual: still.anchorId ?? '(empty)',
            });
            continue; // skip niche checks — no anchor to compare against
        }

        const anchor = anchorMap.get(still.anchorId)!;

        // ── Check 2: anchor's nicheSignal appears in imagePrompt + subjectAction ──
        const nicheLC = anchor.nicheSignal.toLowerCase();
        const imgLC = still.imagePrompt.toLowerCase();
        const actLC = still.subjectAction.toLowerCase();

        if (!imgLC.includes(nicheLC) || !actLC.includes(nicheLC)) {
            const missingIn: string[] = [];
            if (!imgLC.includes(nicheLC)) missingIn.push('imagePrompt');
            if (!actLC.includes(nicheLC)) missingIn.push('subjectAction');
            violations.push({
                stillId: still.stillId,
                violationType: 'niche_signal_dropped',
                message: `anchor nicheSignal "${anchor.nicheSignal}" missing from ${missingIn.join(' and ')}`,
                expected: `"${anchor.nicheSignal}" in both imagePrompt and subjectAction`,
                actual: `absent from: ${missingIn.join(', ')}`,
            });
        }

        // ── Check 3: nicheCarryThrough accuracy ────────────────────────
        if (still.nicheCarryThrough) {
            const carryLC = still.nicheCarryThrough.toLowerCase();
            if (!imgLC.includes(carryLC) || !actLC.includes(carryLC)) {
                const missingIn: string[] = [];
                if (!imgLC.includes(carryLC)) missingIn.push('imagePrompt');
                if (!actLC.includes(carryLC)) missingIn.push('subjectAction');
                violations.push({
                    stillId: still.stillId,
                    violationType: 'niche_carry_mismatch',
                    message: `nicheCarryThrough "${still.nicheCarryThrough}" not found in ${missingIn.join(' and ')}`,
                    expected: `"${still.nicheCarryThrough}" in both fields`,
                    actual: `absent from: ${missingIn.join(', ')}`,
                });
            }
        }

        const expectedLocationFamily = inferLocationFamilyFromText(anchor.locationFamily);
        const actualLocationFamily = inferLocationFamilyFromStillFields(still.location, still.environmentDetails);
        if (
            expectedLocationFamily !== 'other'
            && actualLocationFamily !== 'other'
            && expectedLocationFamily !== actualLocationFamily
        ) {
            violations.push({
                stillId: still.stillId,
                violationType: 'anchor_location_mismatch',
                message: `anchor locationFamily "${anchor.locationFamily}" drifted to still location family "${actualLocationFamily}"`,
                expected: expectedLocationFamily,
                actual: actualLocationFamily,
            });
        }
    }

    // ── Check 4: slotRole uniqueness ────────────────────────────────────
    const slotRoleCounts = new Map<string, string[]>();
    for (const still of stills) {
        if (still.slotRole) {
            const ids = slotRoleCounts.get(still.slotRole) ?? [];
            ids.push(still.stillId);
            slotRoleCounts.set(still.slotRole, ids);
        }
    }
    for (const [role, ids] of slotRoleCounts) {
        if (ids.length > 1) {
            for (const id of ids) {
                violations.push({
                    stillId: id,
                    violationType: 'duplicate_slot_role',
                    message: `slotRole "${role}" assigned to ${ids.length} stills`,
                    expected: 'unique slotRole per still',
                    actual: `shared by: ${ids.join(', ')}`,
                });
            }
        }
    }

    // ── Check 5: slotRole ↔ usage mapping ──────────────────────────────
    for (const still of stills) {
        if (!still.slotRole) continue;
        const rule = SLOT_ROLE_USAGE_MAP[still.slotRole];
        if (!rule) continue;

        if (!rule.allowedUsages.includes(still.usage)) {
            violations.push({
                stillId: still.stillId,
                violationType: 'slot_usage_mismatch',
                message: `slotRole=${still.slotRole} requires usage in [${rule.allowedUsages.join(', ')}], got "${still.usage}"`,
                expected: rule.allowedUsages.join(' | '),
                actual: still.usage,
            });
        }

        // INTIMATE must have intimate composition keyword
        if (rule.compositionRule === 'intimate') {
            const compLC = still.composition.toLowerCase();
            if (!INTIMATE_KEYWORDS.some(kw => compLC.includes(kw))) {
                violations.push({
                    stillId: still.stillId,
                    violationType: 'slot_usage_mismatch',
                    message: `slotRole=INTIMATE requires intimate/close/tight/detail in composition`,
                    expected: 'intimate keyword in composition',
                    actual: still.composition,
                });
            }
        }

        // EDITORIAL_WIDE must NOT have intimate composition keyword
        if (rule.compositionRule === 'wide') {
            const compLC = still.composition.toLowerCase();
            if (INTIMATE_KEYWORDS.some(kw => compLC.includes(kw))) {
                violations.push({
                    stillId: still.stillId,
                    violationType: 'slot_usage_mismatch',
                    message: `slotRole=${still.slotRole} must NOT have intimate/close/tight/detail in composition`,
                    expected: 'wide or medium composition',
                    actual: still.composition,
                });
            }
        }
    }

    // ── Check 6: location family uniqueness uses actual still text before anchor metadata ──
    const locFamilyCounts = new Map<string, string[]>();
    for (const still of stills) {
        const anchor = still.anchorId ? anchorMap.get(still.anchorId) : undefined;
        const actualFamily = inferLocationFamilyFromStillFields(still.location, still.environmentDetails);
        const anchorFamily = anchor ? inferLocationFamilyFromText(anchor.locationFamily) : 'other';
        const fam = actualFamily !== 'other'
            ? actualFamily
            : anchorFamily !== 'other'
                ? anchorFamily
                : still.location.toLowerCase();
        const ids = locFamilyCounts.get(fam) ?? [];
        ids.push(still.stillId);
        locFamilyCounts.set(fam, ids);
    }
    for (const [fam, ids] of locFamilyCounts) {
        if (ids.length > 1) {
            for (const id of ids) {
                violations.push({
                    stillId: id,
                    violationType: 'duplicate_location_family',
                    message: `location family "${fam}" shared by ${ids.length} stills`,
                    expected: 'unique location family per still',
                    actual: `shared by: ${ids.join(', ')}`,
                });
            }
        }
    }

    return { violations, passed: violations.length === 0 };
}

// ── Utility: extract unique still IDs from anchor violations ───────────────────

export function extractViolationStillIds(violations: AnchorViolation[]): string[] {
    return [...new Set(violations.map(v => v.stillId))];
}

// ── Utility: format anchor violations for repair prompt ────────────────────────

export function formatViolationsForRepair(violations: AnchorViolation[]): string {
    if (violations.length === 0) return '';
    const lines = violations.map(v =>
        `stillId=${v.stillId} | violation=${v.violationType} | expected: ${v.expected} | actual: ${v.actual}`
    );
    return `ANCHOR COMPLIANCE VIOLATIONS:\n${lines.join('\n')}`;
}

// ── Utility: extract all failing still IDs from a lint report ─────────────────

export function extractFailingStillIds(issues: ProductionBuildLintIssue[]): string[] {
    const ids = new Set<string>();
    for (const issue of issues) {
        if (issue.affectedStillIds) {
            issue.affectedStillIds.forEach(id => ids.add(id));
        }
    }
    return [...ids];
}

// ── Utility: merge repaired stills back into an existing bible ────────────────

export function mergeRepairedStills(
    bible: LandingStillBible,
    repairedStills: LandingStillSpec[],
): LandingStillBible {
    const repairedMap = new Map(repairedStills.map(s => [s.stillId, s]));
    return {
        ...bible,
        stillLibrary: bible.stillLibrary.map(s => repairedMap.get(s.stillId) ?? s),
    };
}
