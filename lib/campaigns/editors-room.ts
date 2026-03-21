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

// ── Generation-only schemas: audit fields required (OpenAI structured output rejects .optional fields) ──
// These are used ONLY for generateObject calls. schema.ts keeps .optional() for backward-compat reading
// of persisted stills that pre-date the audit fields.

const StillSpecForGenerationSchema = LandingStillSpecSchema.extend({
    anchorId: z.string(),
    slotRole: LandingStillSlotRoleEnum,
    nicheCarryThrough: z.string(),
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
): Promise<LandingStillBible> {
    const model = getHighModel();
    const lintBlock = buildLintComplianceBlock(campaign, brief.communityExpression?.belongingSignals);
    const anchorList = anchors.anchors
        .map((a, i) => `anchorId="${a.anchorId}" | Slot ${i + 1}: [${a.locationFamily}] [${a.socialUnit}] [niche="${a.nicheSignal}"] — ${a.communityAction} | feel: ${a.emotionalRegister}`)
        .join('\n');

    const system = `
You are a visual director translating community action anchors into 6 landing still specs for a niche cruise campaign.

SLOT ASSIGNMENT — for each still, populate the three audit fields:
  anchorId: copy the anchorId value from the anchor that seeded this still
  slotRole: set to the enum value for this slot (HERO_PRIMARY, HERO_ALT, EDITORIAL_WIDE_A, EDITORIAL_WIDE_B, INTIMATE, or FLEX)
  nicheCarryThrough: write the exact niche keyword or phrase you embedded in BOTH imagePrompt AND subjectAction

- Slot 1 → slotRole=HERO_PRIMARY, usage="hero_primary" — wide — niche in imagePrompt + subjectAction — no cabin/window setup
- Slot 2 → slotRole=HERO_ALT, usage="hero_alt" — wide or medium — niche in both fields — different location family than Slot 1
- Slot 3 → slotRole=EDITORIAL_WIDE_A, usage="concept" or "email_header" — composition MUST NOT contain intimate/close/tight/detail — niche in both fields — NOT railing/balcony/horizon fallback
- Slot 4 → slotRole=EDITORIAL_WIDE_B, usage="concept" or "email_header" — composition MUST NOT contain intimate/close/tight/detail — niche in both fields — different location family AND social unit from Slot 3
- Slot 5 → slotRole=INTIMATE, usage="concept" — composition MUST contain "intimate", "close", "tight", or "detail" — niche in both fields — NOT candlelit dining fallback
- Slot 6 → slotRole=FLEX, usage="hero_alt", "email_header", "social_square", or "concept" — niche in imagePrompt or subjectAction — least-used location family so far

ANCHOR SEEDS (translate each into a full still spec; set anchorId accordingly):
${anchorList}

${lintBlock}

FINAL SELF-CHECK: verify each still has (1) anchorId set, (2) slotRole set, (3) nicheCarryThrough set to the exact term present in both imagePrompt and subjectAction, (4) no two stills share a location family, (5) no generic fallback repeated more than once.
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

    console.log(`[editors-room] generateLandingStillBible for ${campaign.id}`);
    const { object } = await generateObject({
        model,
        schema: BibleForGenerationSchema,
        system,
        prompt: ctx,
    });

    return object;
}

// ── Step 3: Repair only the failing stills (one pass, isolated) ───────────────

export async function repairFailingStills(
    campaign: Campaign,
    brief: CampaignAestheticBrief,
    currentBible: LandingStillBible,
    failingStillIds: string[],
    blockerIssues: ProductionBuildLintIssue[],
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

BLOCKERS TO RESOLVE:
${blockerSummary}

PASSING STILLS (for reference — do not repeat their location families or niche terms):
${passingContext}

${lintBlock}

For each repaired still: embed a niche term in BOTH imagePrompt AND subjectAction, use a location family not already claimed by a passing still, and avoid every generic fallback family.
`.trim();

    const prompt = `
Campaign: ${campaign.name} | Ship: ${getCanonicalShipName(campaign)}
Belonging signals: ${brief.communityExpression?.belongingSignals?.join('; ') ?? ''}

FAILING STILLS TO REPAIR:
${failingContext}
`.trim();

    console.log(`[editors-room] repairFailingStills for ${campaign.id}: ${failingStillIds.join(', ')}`);
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
