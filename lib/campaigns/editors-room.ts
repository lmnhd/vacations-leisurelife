/**
 * Editor's Room pipeline — replaces monolithic visual-planning generation.
 *
 * Four specialized steps:
 *   1. generateActionAnchors        — community-native action seeds
 *   2. generateLandingStillBible    — 6 stills from locked anchors + slot rules
 *   3. repairFailingStills          — one-pass isolated repair for specific stills
 *   4. generateProductionBibleFromStills — scene library + storyboards from validated stills
 */

import { z } from "zod";
import type { Campaign } from "./types";
import type {
  CampaignAestheticBrief,
  LandingStillBible,
  LandingStillSpec,
  ProductionBuildLintIssue,
} from "./schema";
import {
  LandingStillUsageEnum,
  LandingStillSlotRoleEnum,
  ProductionBibleSchema,
} from "./schema";
import { VIDEO_DELIVERABLE_SPECS } from "./media/video-deliverable-specs";
import { ModelName } from "@/lib/ai/llm-gateway";
import { callGlobalGenerateObject } from "@/lib/chat/llm-call";
import {
  buildLintComplianceBlock,
  getCanonicalShipName,
  buildShipContext,
  buildEventFramingGuidance,
  joinCampaignList,
  sanitizePromptList,
  isMusicFestivalCampaign,
} from "./aesthetic-engine";
import { buildCampaignResearchDossierContext } from "./research-context";
import {
  getReferencePack,
  formatReferencePackForGeneration,
  formatReferenceBundleForPrompt,
  getSlotReferenceBundle,
} from "./reference-packs";
import { CameraDistanceEnum, FramingModeEnum } from "./reference-pack-types";

// ── Lenient generation schemas: .default() on all fields so Zod fills gaps instead of triggering repair loops ──
// These are used ONLY for generateObject calls. schema.ts keeps strict schemas for downstream persistence.

// Coerce keyed-object responses (model returns {"1":{...}, "2":{...}} instead of [{...}, {...}]) to arrays.
const coerceToArray = (val: unknown): unknown[] =>
  Array.isArray(val)
    ? val
    : val !== null && typeof val === "object"
      ? Object.values(val as object)
      : [];

const LenientStillSpecSchema = z.object({
  stillId: z.string().default(""),
  usage: LandingStillUsageEnum.default("hero_primary" as const),
  location: z.string().default(""),
  timeOfDay: z.string().default(""),
  lighting: z.string().default(""),
  composition: z.string().default(""),
  subjectAction: z.string().default(""),
  environmentDetails: z.string().default(""),
  mood: z.string().default(""),
  imagePrompt: z.string().default(""),
  referenceCategory: z.string().default(""),
  anchorId: z.string().default(""),
  slotRole: LandingStillSlotRoleEnum.default("HERO_PRIMARY" as const),
  nicheCarryThrough: z.string().default(""),
  shotIntent: z.string().default(""),
  cameraDistance: CameraDistanceEnum.default("medium"),
  framingMode: FramingModeEnum.default("single_subject" as const),
  heroSubject: z.string().default(""),
  nicheCue: z.string().default(""),
  antiFallbackNote: z.string().default(""),
  referencePackId: z.string().default(""),
});

const StillSpecForGenerationSchema = LenientStillSpecSchema;

const BibleForGenerationSchema = z.object({
  stillLibrary: z.preprocess(
    coerceToArray,
    z.array(LenientStillSpecSchema).default([]),
  ),
  globalDirectionNotes: z.string().default(""),
  avoidDirectives: z.preprocess(coerceToArray, z.array(z.string()).default([])),
});

const RepairResultSchema = z.object({
  stills: z.preprocess(
    coerceToArray,
    z.array(LenientStillSpecSchema).default([]),
  ),
});

// ── Internal: anchor schema (intermediate only — not exported as a named type) ──

const ActionAnchorSchema = z.object({
  anchorId: z.string().default(""),
  communityAction: z.string().default(""),
  locationFamily: z.string().default(""),
  nicheSignal: z.string().default(""),
  socialUnit: z.enum(["solo", "pair"]).default("pair"),
  emotionalRegister: z.string().default(""),
});

const ActionAnchorSetSchema = z.object({
  anchors: z.preprocess(coerceToArray, z.array(ActionAnchorSchema).default([])),
});

// ── Lenient ProductionBible override for generation (strict ProductionBibleSchema used downstream) ──

const LenientSceneSpecSchema = z.object({
  sceneId: z.string().default(""),
  location: z.string().default(""),
  timeOfDay: z.string().default(""),
  lighting: z.string().default(""),
  cameraAngle: z.string().default(""),
  subjectAction: z.string().default(""),
  environmentDetails: z.string().default(""),
  mood: z.string().default(""),
  imagePrompt: z.string().default(""),
  referenceCategory: z.string().default(""),
});

const LenientShotSpecSchema = z.object({
  sceneId: z.string().default(""),
  durationSeconds: z.number().default(0),
  shotNumber: z.number().default(1),
  cameraMovement: z.string().default(""),
  subjectMotion: z.string().default(""),
  environmentMotion: z.string().default(""),
  transitionIn: z.string().default(""),
  transitionOut: z.string().default(""),
  emotionalBeat: z.string().default(""),
  narrationSegment: z.string().default(""),
  musicCue: z.string().default(""),
});

const LenientStoryboardSchema = z.object({
  deliverableId: z.string().default(""),
  title: z.string().default(""),
  totalDurationSeconds: z.number().default(30),
  shotSequence: z.preprocess(
    coerceToArray,
    z.array(LenientShotSpecSchema).min(1),
  ),
  narrationScript: z.string().default(""),
  musicDirection: z.string().default(""),
  editingStyle: z.string().default(""),
});

const LenientProductionBibleSchema = z.object({
  sceneLibrary: z.preprocess(
    coerceToArray,
    z.array(LenientSceneSpecSchema).min(6),
  ),
  storyboards: z.preprocess(
    coerceToArray,
    z.array(LenientStoryboardSchema).min(1),
  ),
  globalDirectionNotes: z
    .string()
    .min(20)
    .refine((notes) => notes.includes(REQUIRED_SAFETY_OPS), {
      message:
        "globalDirectionNotes must include REQUIRED_SAFETY_OPS sentence verbatim",
    }),
  avoidDirectives: z.preprocess(coerceToArray, z.array(z.string()).default([])),
});

// Must match validators and auto-fix logic exactly.
const REQUIRED_SAFETY_OPS =
  "Passenger-area capture rules: max two-person crew, one off-frame spotter, off-peak capture only, maintain single-file keep-right flow, and stand down immediately if passenger traffic builds or flow is impeded.";

type ActionAnchorSet = z.infer<typeof ActionAnchorSetSchema>;

// ── Step 1: Generate community-native action anchors ─────────────────────────

export async function generateActionAnchors(
  campaign: Campaign,
  brief: CampaignAestheticBrief,
  options?: { instructions?: string },
): Promise<ActionAnchorSet> {
  const nicheKw =
    (campaign.targetingKeywords ?? []).join(", ") || campaign.name;
  const belonging =
    brief.communityExpression?.belongingSignals?.join("; ") ?? "None";
  const solitudeAnti =
    brief.communityExpression?.solitudeAntiPatterns?.join("; ") ?? "None";

  const musicAnchorBlock = isMusicFestivalCampaign(campaign)
    ? `
MUSIC/FESTIVAL/OPEN-DECK CAMPAIGN — ANCHOR HARD REQUIREMENTS:
This campaign requires strong on-image music identity across the still set. Generic cruise anchor seeds are not acceptable.

REQUIRED MUSIC ANCHOR FAMILIES — at least 3 of your 6-8 anchors MUST come from these families:

FAMILY A — DECK ENERGY:
  communityAction: guests visibly responding to live music or a sound system on an open deck — dancing, swaying, arms raised, crowd gathered near speakers
  locationFamily: pool deck / open deck / lido deck / stern deck
  nicheSignal: must be a music-energy term (e.g. "deck dancing", "live set", "outdoor DJ", "sound system crowd", "open air music")
  socialUnit: pair or solo permitted

FAMILY B — PERFORMANCE PROXIMITY:
  communityAction: guests standing, watching, or reacting close to a live performer, acoustic musician, band, or DJ setup on deck
  locationFamily: pool deck stage area / stern bar / outdoor deck near speakers
  nicheSignal: must reference performance context (e.g. "live performer", "acoustic set", "stage adjacency", "DJ deck", "band on deck")
  socialUnit: pair preferred

FAMILY C — PERSONAL LISTENING CULTURE:
  communityAction: one or two guests sharing earbuds, showing album art on a phone screen, or wearing headphones half-off in mid-recommendation
  locationFamily: lounge / atrium / bar / balcony / library
  nicheSignal: must reference personal music behavior (e.g. "earbuds", "album art", "playlist share", "headphones", "track recommendation")
  socialUnit: pair strongly preferred

FAMILY D — MUSIC SOCIAL RECOGNITION:
  communityAction: two guests connecting over music identity — band tee recognition, festival wristband comparison, discussing a favorite set
  locationFamily: bar / promenade / dining lounge / pool deck
  nicheSignal: must name a social music behavior or visual marker (e.g. "band tee", "festival wristband", "set discussion", "music talk")
  socialUnit: pair

BANNED anchor seeds for this campaign:
  × solo guest watching sunset with no music element in frame
  × couple at railing with no sound, music, or crowd context
  × dining or spa scene with no observable music identity
  × interior scene where music is entirely absent and interchangeable with any luxury cruise

The remaining anchors (outside the 3 required families) may use any location family BUT must still carry a music signal in their nicheSignal field.`.trim()
    : "";

  const system = `
You are a community strategist seeding a landing still set for a niche cruise campaign.
Generate 6-8 community-native action anchors. Each anchor seeds one specific landing still.

RULES:
- anchorId: REQUIRED — set to "anchor-01", "anchor-02", etc. (unique sequential ID for each anchor)
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
${musicAnchorBlock ? `\n${musicAnchorBlock}` : ""}
Niche vocabulary: ${nicheKw}
Belonging signals: ${belonging}
Solitude anti-patterns to avoid as anchor seeds: ${solitudeAnti}
${
  options?.instructions
    ? `
OPERATOR INSTRUCTIONS:
Honor these user-supplied instructions unless they conflict with schema validity, safety, or cruise plausibility requirements.
${options.instructions}`
    : ""
}
`.trim();

  console.log(`[editors-room] generateActionAnchors for ${campaign.id}`);
  const { object } = await callGlobalGenerateObject({
    modelName: ModelName.GPT_5_HIGH,
    schema: ActionAnchorSetSchema,
    system,
    prompt: `Campaign: ${campaign.name}\nShip: ${getCanonicalShipName(campaign)}\nDestination: ${campaign.targetDestination ?? "TBD"}`,
    maxOutputTokens: 8000,
    skipRepair: true,
    operationName: `editors-room:anchors:${campaign.id}`,
  });

  return object as z.output<typeof ActionAnchorSetSchema>;
}

// ── Step 2: Generate landing still bible from locked anchors ──────────────────

export async function generateLandingStillBible(
  campaign: Campaign,
  brief: CampaignAestheticBrief,
  anchors: ActionAnchorSet,
  options?: { correctionContext?: string; instructions?: string },
): Promise<LandingStillBible> {
  const lintBlock = buildLintComplianceBlock(
    campaign,
    brief.communityExpression?.belongingSignals,
  );
  const anchorList = anchors.anchors
    .map(
      (a, i) =>
        `anchorId="${a.anchorId}" | Slot ${i + 1}: [${a.locationFamily}] [${a.socialUnit}] [niche="${a.nicheSignal}"] — ${a.communityAction} | feel: ${a.emotionalRegister}`,
    )
    .join("\n");

  // ── Reference grounding ──────────────────────────────────────────────
  const refPack = getReferencePack(campaign);
  const referenceBlock = refPack
    ? formatReferencePackForGeneration(refPack)
    : "";
  const refPackId = refPack?.referencePackId ?? "none";

  const system = `
You are a visual director translating community action anchors into 6 landing still specs for a niche cruise campaign.

SLOT ASSIGNMENT — for each still, populate ALL of these fields:
  stillId: REQUIRED — set to "still-01" for Slot 1, "still-02" for Slot 2, "still-03", "still-04", "still-05", "still-06"
  anchorId: REQUIRED — copy the EXACT anchorId string from the anchor that seeded this still
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
  If anchor locationFamily contains "pool" or "pool deck" or "pool_deck" or "lido" → still location field MUST contain the word "pool" or "lido" (e.g., "main pool deck", "lido deck", "pool bar area")
  If anchor locationFamily is "dining" → still location must be in a dining venue
  If anchor locationFamily is "library" → still location must be in the ship library or reading room — do not use pool, deck, or railing locations
  If anchor locationFamily is "spa" or "solarium" → still location must be in a spa, solarium, or thermal area
  If anchor locationFamily is "atrium" → still location must be in the ship atrium or grand lobby
  If anchor locationFamily is "lounge" or "bar" → still location must contain "lounge" or "bar"
  If anchor locationFamily is "promenade" → still location must contain "promenade", "bow", or "stern"
  Do not substitute a different location family even if the scene idea is more compelling.
  The location field must contain at least one concrete keyword from the anchor's declared locationFamily.

NICHE SIGNAL EMBEDDING — for each still, the anchor's nicheSignal must appear VERBATIM (exact characters, not inflected) in BOTH imagePrompt AND subjectAction:
  If anchor nicheSignal is "deck dance" → imagePrompt and subjectAction must contain the exact string "deck dance" (not "deck dancing", not "dance on deck")
  If anchor nicheSignal is "live set" → both fields must contain "live set" exactly
  Copy the anchor's nicheSignal as-is into both fields — do not rephrase, inflect, or paraphrase it.

ANCHOR SEEDS (translate each into a full still spec; set anchorId accordingly):
${anchorList}
${referenceBlock}
${lintBlock}
${
  options?.instructions
    ? `
OPERATOR INSTRUCTIONS:
Honor these user-supplied instructions unless they conflict with schema validity, safety, or cruise plausibility requirements.
${options.instructions}`
    : ""
}
${options?.correctionContext ? `\nHARD FAILURES FROM PREVIOUS GENERATION — you MUST fix ALL of the following in this regeneration:\n${options.correctionContext}\n` : ""}
REQUIRED JSON OUTPUT STRUCTURE — use these EXACT field names. Each still MUST have a unique stillId, slotRole, and location family:
{
  "stillLibrary": [
    { "stillId": "still-01", "slotRole": "HERO_PRIMARY",      "usage": "hero_primary",  "anchorId": "anchor-01", ... },
    { "stillId": "still-02", "slotRole": "HERO_ALT",          "usage": "hero_alt",       "anchorId": "anchor-02", ... },
    { "stillId": "still-03", "slotRole": "EDITORIAL_WIDE_A",  "usage": "concept",        "anchorId": "anchor-03", ... },
    { "stillId": "still-04", "slotRole": "EDITORIAL_WIDE_B",  "usage": "email_header",   "anchorId": "anchor-04", ... },
    { "stillId": "still-05", "slotRole": "INTIMATE",          "usage": "concept",        "anchorId": "anchor-05", ... },
    { "stillId": "still-06", "slotRole": "FLEX",              "usage": "social_square",  "anchorId": "anchor-06", ... }
  ],
  "globalDirectionNotes": "...",
  "avoidDirectives": [ "...", "..." ]
}
Each still object also requires: location, timeOfDay, lighting, composition, subjectAction, environmentDetails, mood, imagePrompt, referenceCategory, nicheCarryThrough, shotIntent, cameraDistance, framingMode, heroSubject, nicheCue, antiFallbackNote, referencePackId.
NEVER name the stills array field anything other than "stillLibrary".

FINAL SELF-CHECK: verify each still has (1) anchorId set, (2) slotRole set, (3) nicheCarryThrough set to the exact term present in both imagePrompt and subjectAction, (4) no two stills share a location family, (5) no generic fallback repeated more than once, (6) shotIntent + nicheCue + heroSubject are filled, (7) nicheCue names a specific niche object or action visible in the scene, (8) each still's location field contains a concrete keyword from its anchor's declared locationFamily — for a balcony anchor the word "balcony" must appear in the location field, not just "railing".
`.trim();

  const ctx = `
Campaign: ${campaign.name}
Ship: ${getCanonicalShipName(campaign)}
Ship Context: ${buildShipContext(campaign)}
Destination: ${campaign.targetDestination ?? "TBD"}
Highlight Events: ${joinCampaignList(sanitizePromptList(campaign.highlightEvents))}
Event Framing: ${buildEventFramingGuidance(campaign)}
Community Promise: ${brief.communityExpression?.corePromise ?? ""}
Belonging Signals: ${brief.communityExpression?.belongingSignals?.join("; ") ?? ""}
Plausibility Principle: ${brief.visual?.plausibilityFramework?.governingPrinciple ?? ""}
${buildCampaignResearchDossierContext(
  brief.campaignResearchDossier ?? campaign.researchDossier,
  "Secondary campaign research dossier (use to sharpen still framing and niche legibility):",
)}
`.trim();

  console.log(
    `[editors-room] generateLandingStillBible for ${campaign.id} (refPack=${refPackId})`,
  );
  const { object } = await callGlobalGenerateObject({
    modelName: ModelName.GPT_5_HIGH,
    schema: BibleForGenerationSchema,
    system,
    prompt: ctx,
    maxOutputTokens: 16000,
    skipRepair: true,
    operationName: `editors-room:landing-stills:${campaign.id}`,
  });

  return object as z.output<typeof BibleForGenerationSchema>;
}

// ── Step 3.1: Deterministic editorial composition normalizer ──────────────────
// Lint's extractShotRole classifies concept-usage stills with intimate/close/tight/detail
// composition keywords as 'intimate' rather than 'editorial'. EDITORIAL_WIDE slots must
// never carry those keywords. This step runs after generation and before anchor compliance
// so the compliance gate and lint both see corrected compositions.

const INTIMATE_KEYWORD_REPLACEMENTS: [RegExp, string][] = [
  [/\bintimate\b/gi, "wide"],
  [/\bclose-up\b/gi, "medium"],
  [/\bclose\b/gi, "medium"],
  [/\btight\b/gi, "medium"],
  [/\bdetailed\b/gi, "environmental"],
  [/\bdetail\b/gi, "environmental"],
];

const EDITORIAL_WIDE_SYNONYM_KEYWORDS = [
  "broad",
  "expansive",
  "sweeping",
  "open",
];

export function normalizeEditorialCompositions(
  bible: LandingStillBible,
): LandingStillBible {
  const EDITORIAL_WIDE_ROLES = new Set([
    "EDITORIAL_WIDE_A",
    "EDITORIAL_WIDE_B",
  ]);
  let changed = false;
  const stillLibrary = bible.stillLibrary.map((still) => {
    if (!still.slotRole || !EDITORIAL_WIDE_ROLES.has(still.slotRole))
      return still;
    const compLC = still.composition.toLowerCase();
    const hasExplicitWideToken =
      compLC.includes("wide") || compLC.includes("medium");
    const needsIntimateFix = INTIMATE_KEYWORDS.some((kw) =>
      compLC.includes(kw),
    );
    const needsWideCanonicalization =
      !hasExplicitWideToken &&
      EDITORIAL_WIDE_SYNONYM_KEYWORDS.some((kw) => compLC.includes(kw));
    const needsFix = needsIntimateFix || needsWideCanonicalization;
    if (!needsFix) return still;
    let fixed = still.composition;
    for (const [pattern, replacement] of INTIMATE_KEYWORD_REPLACEMENTS) {
      fixed = fixed.replace(pattern, replacement);
    }
    if (needsWideCanonicalization) {
      fixed = `Wide ${fixed.charAt(0).toLowerCase()}${fixed.slice(1)}`;
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

const EDITORIAL_WIDE_ALLOWED_USAGES = new Set<LandingStillSpec["usage"]>([
  "concept",
  "email_header",
]);

export function normalizeEditorialUsage(
  bible: LandingStillBible,
): LandingStillBible {
  const EDITORIAL_WIDE_ROLES = new Set([
    "EDITORIAL_WIDE_A",
    "EDITORIAL_WIDE_B",
  ]);
  let changed = false;
  const stillLibrary = bible.stillLibrary.map((still) => {
    if (!still.slotRole || !EDITORIAL_WIDE_ROLES.has(still.slotRole))
      return still;
    if (EDITORIAL_WIDE_ALLOWED_USAGES.has(still.usage)) return still;
    changed = true;
    return { ...still, usage: "concept" as LandingStillSpec["usage"] };
  });
  if (!changed) return bible;
  return { ...bible, stillLibrary };
}

// ── Step 3.3: Deterministic anchor compliance normalizer ──────────────────────
// Embeds missing nicheSignal and nicheCarryThrough into imagePrompt and subjectAction
// if the model dropped them, preventing rejection loops for minor text omissions.

export function normalizeAnchorContent(
  anchors: { anchorId: string; nicheSignal: string; locationFamily: string }[],
  bible: LandingStillBible,
): LandingStillBible {
  const anchorMap = new Map(anchors.map((a) => [a.anchorId, a]));
  let changed = false;

  const stillLibrary = bible.stillLibrary.map((still) => {
    if (!still.anchorId || !anchorMap.has(still.anchorId)) return still;
    const anchor = anchorMap.get(still.anchorId)!;

    let newImagePrompt = still.imagePrompt;
    let newSubjectAction = still.subjectAction;
    let updated = false;

    const nicheLC = normalizeComparisonText(anchor.nicheSignal);

    if (!normalizeComparisonText(newImagePrompt).includes(nicheLC)) {
      newImagePrompt = `${newImagePrompt}, featuring ${anchor.nicheSignal}`;
      updated = true;
    }
    if (!normalizeComparisonText(newSubjectAction).includes(nicheLC)) {
      newSubjectAction = `${newSubjectAction}, including ${anchor.nicheSignal}`;
      updated = true;
    }

    if (still.nicheCarryThrough) {
      const carryLC = normalizeComparisonText(still.nicheCarryThrough);
      if (!normalizeComparisonText(newImagePrompt).includes(carryLC)) {
        newImagePrompt = `${newImagePrompt}, emphasizing ${still.nicheCarryThrough}`;
        updated = true;
      }
      if (!normalizeComparisonText(newSubjectAction).includes(carryLC)) {
        newSubjectAction = `${newSubjectAction}, showing ${still.nicheCarryThrough}`;
        updated = true;
      }
    }

    if (updated) {
      changed = true;
      return {
        ...still,
        imagePrompt: newImagePrompt,
        subjectAction: newSubjectAction,
      };
    }
    return still;
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
  options?: { instructions?: string },
): Promise<LandingStillSpec[]> {
  const lintBlock = buildLintComplianceBlock(
    campaign,
    brief.communityExpression?.belongingSignals,
  );

  const failingStills = currentBible.stillLibrary.filter((s) =>
    failingStillIds.includes(s.stillId),
  );
  const passingStills = currentBible.stillLibrary.filter(
    (s) => !failingStillIds.includes(s.stillId),
  );

  const blockerSummary = blockerIssues
    .map((i) => `[${i.code}] ${i.message}`)
    .join("\n");

  const passingContext = passingStills
    .map((s) =>
      [
        `stillId=${s.stillId} | slotRole=${s.slotRole ?? "unknown"} | location=${s.location} | usage=${s.usage}`,
        `  nicheCarryThrough: ${s.nicheCarryThrough ?? "(not set)"}`,
      ].join("\n"),
    )
    .join("\n");

  // ── Reference grounding for repair ───────────────────────────────────
  const refPack = getReferencePack(campaign);
  const refPackId = refPack?.referencePackId ?? "none";
  const slotRefBlocks = failingStills
    .map((s) => {
      if (!refPack || !s.slotRole) return "";
      const bundle = getSlotReferenceBundle(refPack, s.slotRole);
      return `\nREFERENCE FOR ${s.stillId} (${s.slotRole}):\n${formatReferenceBundleForPrompt(bundle)}`;
    })
    .filter(Boolean)
    .join("\n");

  const failingContext = failingStills
    .map((s) =>
      [
        `stillId=${s.stillId} | slotRole=${s.slotRole ?? "unknown"} | anchorId=${s.anchorId ?? "unknown"} | location=${s.location} | usage=${s.usage}`,
        `  imagePrompt: ${s.imagePrompt}`,
        `  subjectAction: ${s.subjectAction}`,
        `  nicheCarryThrough (current, failing): ${s.nicheCarryThrough ?? "(missing)"}`,
      ].join("\n"),
    )
    .join("\n\n");

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
${anchorViolationsBlock ? `\n${anchorViolationsBlock}\n` : ""}
PASSING STILLS (for reference — do not repeat their location families or niche terms):
${passingContext}
${slotRefBlocks}
${lintBlock}
${
  options?.instructions
    ? `
OPERATOR INSTRUCTIONS:
Honor these user-supplied instructions unless they conflict with schema validity, safety, or cruise plausibility requirements.
${options.instructions}`
    : ""
}

For each repaired still:
- CRITICAL: For niche_signal_dropped violations — copy the EXACT string from the "expected" field of the violation into BOTH imagePrompt AND subjectAction verbatim. Do NOT use inflected forms, synonyms, or paraphrases.
- CRITICAL: For anchor_location_mismatch violations — use a location that contains the exact keyword from the anchor's expected location family (e.g., if expected is "pool_deck", your location must contain "pool" or "lido").
- CRITICAL: For duplicate_location_family violations — use a completely different ship location than all OTHER stills in the set (check the passing stills list).
- Embed the anchor's nicheSignal verbatim in BOTH imagePrompt AND subjectAction. Set nicheCarryThrough to that exact same string.
- The location field MUST contain at least one concrete keyword from the anchor's declared locationFamily. If the anchor locationFamily is "balcony", the word "balcony" must appear in the location field.
- Use a location family not already claimed by ANY other still (passing or failing — each still in this repair batch must use a DIFFERENT location family).
- Avoid every generic fallback family.
- SELF-CHECK before output: confirm the repaired still's location field contains a keyword matching its anchor's declared locationFamily.
- Use the reference examples as guides for niche-native imagery.
`.trim();

  const prompt = `
Campaign: ${campaign.name} | Ship: ${getCanonicalShipName(campaign)}
Belonging signals: ${brief.communityExpression?.belongingSignals?.join("; ") ?? ""}

FAILING STILLS TO REPAIR:
${failingContext}
`.trim();

  console.log(
    `[editors-room] repairFailingStills for ${campaign.id}: ${failingStillIds.join(", ")} (refPack=${refPackId})`,
  );
  const { object } = await callGlobalGenerateObject({
    modelName: ModelName.GPT_5_HIGH,
    schema: RepairResultSchema,
    system,
    prompt,
    maxOutputTokens: 12000,
    skipRepair: true,
    operationName: `editors-room:repair-stills:${campaign.id}`,
  });
  return (object as z.output<typeof RepairResultSchema>).stills;
}

// ── Step 4: Generate production bible from validated stills ───────────────────

export async function generateProductionBibleFromStills(
  campaign: Campaign,
  brief: CampaignAestheticBrief,
  landingStillBible: LandingStillBible,
  options?: { instructions?: string },
): Promise<z.infer<typeof ProductionBibleSchema>> {
  const stillSummary = landingStillBible.stillLibrary
    .map(
      (s) =>
        `[${s.slotRole ?? s.usage}] ${s.location}: ${s.subjectAction}${s.nicheCarryThrough ? ` | niche="${s.nicheCarryThrough}"` : ""}`,
    )
    .join("\n");

  const visual = brief.visual;
  const casting = visual?.humanRepresentation;
  const plausibility = visual?.plausibilityFramework;
  const communityExpression = brief.communityExpression;
  const avoidList = brief.visual?.avoidList ?? [];
  const avoidListBlock =
    avoidList.length > 0
      ? `\n\nCAMPAIGN AVOID LIST — each of these MUST appear explicitly as a directive in the avoidDirectives array:\n${avoidList.map((item) => `- ${item}`).join("\n")}`
      : "";

  const musicBibleBlock = isMusicFestivalCampaign(campaign)
    ? `
MUSIC/FESTIVAL/OPEN-DECK CAMPAIGN — PRODUCTION BIBLE HARD REQUIREMENTS:
This campaign requires sustained music identity across all scenes and storyboards.

SCENE LIBRARY:
  - At least 2 of the 10 scenes MUST be set on an open deck with visible crowd energy, sound system context, or live performance adjacency. These scenes must show guests physically responding to music — not just standing near water.
  - At least 1 scene must show guests in direct physical response to music: swaying, dancing, bodies moving — on deck, not in a lounge.
  - At least 1 scene may use a personal listening moment (earbuds, phone music, recommendation exchange) as an intimate complement to the energy scenes.
  - No scene should read as quiet luxury with no music atmosphere. Every interior scene must carry a music-culture cue in subjectAction or environmentDetails.

STORYBOARDS:
  - musicCue fields MUST escalate across the emotional arc. Do not default all shots to "ambient bed".
  - Required arc: ambient opening → recognizable beat builds → crowd energy peak → intimate personal close.
  - At least 1 shot per storyboard must use a high-energy musicCue: "full crowd energy", "bass drop moment", "stage peak", "crowd swell", or "festival atmosphere peak".

ADDITIONAL avoidDirectives REQUIRED for this campaign:
  - "No scenes where all music context is absent"
  - "No open-deck wide shots that ignore sound system or crowd energy"
  - "No interior scenes that read as quiet luxury with zero music atmosphere"
  - "No storyboard where musicCue stays at ambient bed for all shots"`.trim()
    : "";

  const isBoardGamesAtSeaCampaign =
    campaign.id === "board-games-at-sea" ||
    /board games at sea/i.test(campaign.name);
  const boardGamesSceneBlock = isBoardGamesAtSeaCampaign
    ? `
BOARD-GAMES-AT-SEA SCENE PRIORITIES:
- Every scene must visibly earn the campaign title. A board-game prop or interaction should be legible in frame, not merely implied.
- Prefer tabletop play, rules explanations, card shuffles, dice rolls, meeples, score sheets, game boxes, or hands arranging pieces.
- At least 6 of the 10 scenes should feel like a small social cluster around a game table or shared play surface.
- Limit pure cruise postcard scenes to at most 2 total; the rest should feel like board-game life happening aboard the ship.
- If a scene is set in spa, theater, nightclub, or destination_port, it still needs a recognizable game cue or social play detail so the niche does not disappear.
- A scene counts as clearly board-game themed only when the imagePrompt or subjectAction makes the play object or interaction visible; do not rely on generic "game" language alone.`
    : "";

  const boardGamesStoryboardBlock = isBoardGamesAtSeaCampaign
    ? `
BOARD-GAMES-AT-SEA STORYBOARD PRIORITIES:
- The tiktok_seed storyboard must be exactly six shots in a hook -> build -> proof -> social -> peak -> payoff arc.
- shotNumber values must be sequential starting at 1 and must match the array order.
- Every shot.sceneId must reuse a sceneId that exists in the generated sceneLibrary.
- Favor the most social, object-legible, and table-aware scenes when assigning tiktok_seed shots.
- Do not fall back to generic cruise filler when a board-game scene is available.
- Prefer this progression when it fits the available sceneLibrary: pool_deck or exterior hook, dining build, atrium proof, nightclub social, sports_deck peak, offboard_excursion or theater payoff.`
    : "";
  const researchContext = buildCampaignResearchDossierContext(
    campaign.researchDossier ?? brief.campaignResearchDossier,
    "SECONDARY CAMPAIGN RESEARCH DOSSIER (use to sharpen scene selection, narrative beats, and storyboard framing):",
  );

  const system = `
You are the Creative Director generating a Production Bible for a niche cruise campaign.
The landing still set is already validated. Use it as the community identity reference.

SCENE LIBRARY (10 scenes) + STORYBOARD RULES:
- Vary across at least 6 ship reference categories: exterior, pool_deck, dining, stateroom, atrium, nightclub, spa, destination_port, theater, sports_deck, offboard_excursion
- mood: vacation emotion only (wonder, FOMO, joy, serenity, intimacy, awe, belonging, thrill, magic, freedom)
- subjectAction: what the person EXPERIENCES, not what they DO — aspiration format
- At least 6 of 10 scenes must show two or more people in relaxed proximity
- Camera angles vary but must be filmable in passenger areas: wide establishing, low-angle hero, eye-level handheld, close-up detail, over-the-shoulder
- For video scenes: humans as background accents, ship/sea/architecture as dominant subject
- subjectMotion: default to no human motion — frozen human presence in a living environment
- cameraMovement and environmentMotion carry all sensation of life
- globalDirectionNotes MUST include this exact sentence verbatim: "${REQUIRED_SAFETY_OPS}"
- avoidDirectives must include: "No slideshow parallax", "No repeated camera movement across consecutive shots", "No empty scenes", "No corporate body language", "No crane, dolly, tracking shot, slider, or cable-cam language"

SCENE imagePrompt — CRITICAL — every scene MUST have a non-empty imagePrompt:
- imagePrompt is the primary creative brief sent to the image generator for each scene. It MUST be a specific, renderable description of what the camera sees.
- Write it as a documentary photography brief: concrete location on the ship, time of day, light quality, what is in frame, one niche prop cue, and one human-presence cue.
- The niche cue must be a physical prop or environmental detail from the campaign's "Niche prop families" (see context) — something a photographer could capture.
- Do NOT leave imagePrompt blank or write generic descriptions like "guests enjoying the cruise". Every imagePrompt must be specific enough that an image generator could produce the correct shot.
- Format: "[Location on ship], [time of day], [lighting quality]. [What the camera sees — architecture/sea dominant]. [One niche prop detail]. [One human-presence cue: blurred background figures, over-the-shoulder view, or hands near the table]."
- Example: "Pool deck, mid-afternoon, bright open sun. Wide shot of the main pool with teak loungers and the ocean horizon beyond. On the nearest table, a compact game box sits half-open beside a drink. In the soft background, two guests lean over the table, faces blurred, hands near the pieces."

SCENE NICHE ANCHOR — REQUIRED in every imagePrompt:
Each imagePrompt MUST name at least one prop from the campaign's "Niche prop families" list in the context. Place it as an incidental foreground or background detail — on a table, near a lounge chair, carried by a background figure — not as the hero of the shot. If the prop list is empty, draw the cue from the "Niche-enhanced moments" list instead.

SCENE HUMAN PRESENCE — REQUIRED in at least 8 of 10 imagePrompts:
Each imagePrompt must use one of these low-risk, model-friendly human presence techniques. These produce legible social energy without requiring the model to render perfect faces:
- "blurred background figures" — soft silhouettes in the mid-to-far ground
- "over-the-shoulder" — viewer-POV framing behind a seated or standing guest
- "hands in partial frame" — hands near props, placing pieces, or reaching across the table
- "anonymous seated cluster" — small group around a table, faces soft or turned away
Do NOT describe fully-posed groups, direct eye-contact portraits, or staged demonstration setups. The social energy must be implied through proximity and props — not performed for the camera.
${boardGamesSceneBlock ? `${boardGamesSceneBlock}` : ""}
${avoidListBlock}${musicBibleBlock ? `\n${musicBibleBlock}` : ""}
SCENE LIBRARY JSON STRUCTURE — use these EXACT field names (parser reads only these keys):
Each scene object: { "sceneId": str (one of: exterior/pool_deck/dining/stateroom/atrium/nightclub/spa/destination_port/theater/sports_deck), "location": str, "timeOfDay": str, "lighting": str, "cameraAngle": str, "subjectAction": str, "environmentDetails": str, "mood": str, "imagePrompt": str (NON-EMPTY — see rules above), "referenceCategory": str }

STORYBOARD JSON STRUCTURE — use these EXACT field names (parser reads only these keys):
Each storyboard object: { "deliverableId": str, "title": str, "totalDurationSeconds": num, "shotSequence": [ /* shots array — NEVER name this field "shots", "shotList", or anything else */ ], "narrationScript": str, "musicDirection": str, "editingStyle": str }
Each shot object inside shotSequence: { "sceneId": str, "durationSeconds": num, "cameraMovement": str, "subjectMotion": str, "environmentMotion": str, "transitionIn": str, "transitionOut": str, "emotionalBeat": str, "narrationSegment": str, "musicCue": str }
Shot durationSeconds values must sum exactly to the storyboard totalDurationSeconds.

STORYBOARD RULES:
- Each storyboard: intrigue/hook → building desire → peak euphoria → "this could be you" CTA arc
- No two CONSECUTIVE shots may use the same sceneId
- Camera movements vary per shot but must remain feasible without restricted equipment: handheld drift, gimbal glide, static locked-off, gentle pan/tilt, slow push-in (digital crop), slow pull-out (digital crop), soft handheld orbit (small step-around)
- Do NOT use: crane, dolly, tracking shot, slider, cable cam, drone, jib, rail, steadicam rig language
- transitionIn/transitionOut: hard cut, cross-dissolve, whip pan, match cut, fade from black, J-cut, L-cut
- narrationSegment: premium travel documentary voiceover — warm, personal, aspirational
- Do not design shots around walking toward camera, dancing, clinking, sipping, or hand-to-object choreography
${boardGamesStoryboardBlock ? `${boardGamesStoryboardBlock}` : ""}
${
  options?.instructions
    ? `
OPERATOR INSTRUCTIONS:
Honor these user-supplied instructions unless they conflict with schema validity, safety, or cruise plausibility requirements.
${options.instructions}`
    : ""
}
`.trim();

  const ctx = `
Campaign: ${campaign.name}
Ship: ${getCanonicalShipName(campaign)}
Ship Context: ${buildShipContext(campaign)}
Destination: ${campaign.targetDestination ?? "TBD"}
Highlight Events: ${joinCampaignList(sanitizePromptList(campaign.highlightEvents))}
Event Framing: ${buildEventFramingGuidance(campaign)}
Aesthetic: ${visual?.aestheticLabel ?? ""}
Imagery Mood: ${visual?.imageryMood ?? ""}
Lighting: ${visual?.lightingStyle ?? ""}
Casting Goal: ${casting?.castingGoal ?? ""}
Age Range: ${casting?.ageRangeGuidance ?? ""}
Community Promise: ${communityExpression?.corePromise ?? ""}
Belonging Signals: ${communityExpression?.belongingSignals?.join("; ") ?? ""}
Governing Principle: ${plausibility?.governingPrinciple ?? ""}
Cruise-native moments: ${plausibility?.cruiseNativeMoments?.join("; ") ?? ""}
Niche prop families: ${plausibility?.allowedProps?.join("; ") ?? ""}
Niche-enhanced moments: ${plausibility?.nicheEnhancedMoments?.join("; ") ?? ""}
Implausible bans: ${plausibility?.implausibleLiteralizations?.join("; ") ?? ""}

${researchContext}

VALIDATED LANDING STILLS (reference for campaign identity):
${stillSummary}

Video Deliverables:
${VIDEO_DELIVERABLE_SPECS.map((d) => `- ${d.id}: "${d.title}" (${d.durationSeconds}s, ${d.shotCount} shots)`).join("\n")}
`.trim();

  console.log(
    `[editors-room] generateProductionBibleFromStills for ${campaign.id}`,
  );
  const { object } = await callGlobalGenerateObject({
    modelName: ModelName.GPT_5_HIGH,
    schema: LenientProductionBibleSchema,
    system,
    prompt: ctx,
    maxOutputTokens: 16000,
    timeoutMs: 240_000,
    skipRepair: false,
    operationName: `editors-room:production-bible:${campaign.id}`,
  });

  return object as z.output<typeof ProductionBibleSchema>;
}

// ── Anchor compliance types ────────────────────────────────────────────────────

type AnchorViolationType =
  | "missing_anchor_binding"
  | "niche_signal_dropped"
  | "niche_carry_mismatch"
  | "anchor_location_mismatch"
  | "duplicate_slot_role"
  | "slot_usage_mismatch"
  | "duplicate_location_family";

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

const SLOT_ROLE_USAGE_MAP: Record<
  string,
  { allowedUsages: string[]; compositionRule?: "intimate" | "wide" }
> = {
  HERO_PRIMARY: { allowedUsages: ["hero_primary"] },
  HERO_ALT: { allowedUsages: ["hero_alt"] },
  EDITORIAL_WIDE_A: {
    allowedUsages: ["concept", "email_header"],
    compositionRule: "wide",
  },
  EDITORIAL_WIDE_B: {
    allowedUsages: ["concept", "email_header"],
    compositionRule: "wide",
  },
  INTIMATE: { allowedUsages: ["concept"], compositionRule: "intimate" },
  FLEX: {
    allowedUsages: ["hero_alt", "concept", "email_header", "social_square"],
  },
};

const INTIMATE_KEYWORDS = ["intimate", "close", "tight", "detail"];

const LOCATION_FAMILY_KEYWORDS: Array<[string[], string]> = [
  // ── Most-specific named indoor/outdoor venues first ─────────────────────
  // Ordering principle: more-specific named spaces beat less-specific or structural ones
  // when both keywords appear in the same location text.
  [["library", "reading room"], "library"],
  [["theater", "stage", "auditorium"], "theater"],
  [["spa", "solarium", "thermal"], "spa"], // before pool — 'spa solarium by the pool' → spa
  [["atrium", "lobby", "grand hall"], "atrium"], // before balcony — 'Centrum balcony in the atrium' → atrium
  [["dining", "restaurant", "meal"], "dining"], // 'table' removed — too generic (pool table, side table, bistro table, etc.)
  [["bow", "stern", "promenade"], "promenade"],
  [["pool", "lido"], "pool_deck"], // after spa — 'spa solarium near the pool' → spa
  [["sports", "court", "track", "pickleball", "basketball"], "sports_deck"],
  // ── Private fixtures — explicit balcony should beat generic deck wording ─
  [["balcony"], "balcony"], // 'private cabin balcony with teak deck' → balcony
  [["deck", "outdoor"], "deck"],
  // ── Lower-specificity interior/social fixtures ──────────────────────────
  [["lounge", "bar"], "lounge"],
  [["cabin", "stateroom", "porthole"], "cabin"],
  [["pier", "dock", "harbor", "shore", "port"], "port"], // after onboard fixtures — 'balcony with harbor view' stays balcony
  // ── Structural/perimeter feature — last resort ───────────────────────────
  [["rail", "railing"], "rail"],
];

function inferLocationFamilyFromText(text: string): string {
  const normalized = text.toLowerCase();
  for (const [keywords, family] of LOCATION_FAMILY_KEYWORDS) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return family;
    }
  }
  return "other";
}

function inferLocationFamilyFromStillFields(
  location: string,
  environmentDetails: string,
): string {
  const locationFamily = inferLocationFamilyFromText(location);
  if (locationFamily !== "other") {
    return locationFamily;
  }
  return inferLocationFamilyFromText(environmentDetails);
}

function normalizeComparisonText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Step 5: Deterministic anchor-compliance validation ─────────────────────────

export function validateAnchorCompliance(
  anchors: { anchorId: string; nicheSignal: string; locationFamily: string }[],
  bible: LandingStillBible,
): AnchorComplianceResult {
  const violations: AnchorViolation[] = [];
  const anchorMap = new Map(anchors.map((a) => [a.anchorId, a]));
  const stills = bible.stillLibrary;

  for (const still of stills) {
    const imgLC = normalizeComparisonText(still.imagePrompt);
    const actLC = normalizeComparisonText(still.subjectAction);

    // ── Check 1: anchorId exists and maps to a real anchor ──────────
    if (!still.anchorId || !anchorMap.has(still.anchorId)) {
      violations.push({
        stillId: still.stillId,
        violationType: "missing_anchor_binding",
        message: `anchorId "${still.anchorId ?? "(empty)"}" does not match any generated anchor`,
        expected: `one of: ${anchors.map((a) => a.anchorId).join(", ")}`,
        actual: still.anchorId ?? "(empty)",
      });
      continue; // skip niche checks — no anchor to compare against
    }

    const anchor = anchorMap.get(still.anchorId)!;

    // ── Check 2: anchor's nicheSignal appears in imagePrompt + subjectAction ──
    const nicheLC = normalizeComparisonText(anchor.nicheSignal);

    if (!imgLC.includes(nicheLC) || !actLC.includes(nicheLC)) {
      const missingIn: string[] = [];
      if (!imgLC.includes(nicheLC)) missingIn.push("imagePrompt");
      if (!actLC.includes(nicheLC)) missingIn.push("subjectAction");
      violations.push({
        stillId: still.stillId,
        violationType: "niche_signal_dropped",
        message: `anchor nicheSignal "${anchor.nicheSignal}" missing from ${missingIn.join(" and ")}`,
        expected: `"${anchor.nicheSignal}" in both imagePrompt and subjectAction`,
        actual: `absent from: ${missingIn.join(", ")}`,
      });
    }

    // ── Check 3: nicheCarryThrough accuracy ────────────────────────
    if (still.nicheCarryThrough) {
      const carryLC = normalizeComparisonText(still.nicheCarryThrough);
      if (!imgLC.includes(carryLC) || !actLC.includes(carryLC)) {
        const missingIn: string[] = [];
        if (!imgLC.includes(carryLC)) missingIn.push("imagePrompt");
        if (!actLC.includes(carryLC)) missingIn.push("subjectAction");
        violations.push({
          stillId: still.stillId,
          violationType: "niche_carry_mismatch",
          message: `nicheCarryThrough "${still.nicheCarryThrough}" not found in ${missingIn.join(" and ")}`,
          expected: `"${still.nicheCarryThrough}" in both fields`,
          actual: `absent from: ${missingIn.join(", ")}`,
        });
      }
    }

    const expectedLocationFamily = inferLocationFamilyFromText(
      anchor.locationFamily,
    );
    const actualLocationFamily = inferLocationFamilyFromStillFields(
      still.location,
      still.environmentDetails,
    );
    if (
      expectedLocationFamily !== "other" &&
      actualLocationFamily !== "other" &&
      expectedLocationFamily !== actualLocationFamily
    ) {
      violations.push({
        stillId: still.stillId,
        violationType: "anchor_location_mismatch",
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
          violationType: "duplicate_slot_role",
          message: `slotRole "${role}" assigned to ${ids.length} stills`,
          expected: "unique slotRole per still",
          actual: `shared by: ${ids.join(", ")}`,
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
        violationType: "slot_usage_mismatch",
        message: `slotRole=${still.slotRole} requires usage in [${rule.allowedUsages.join(", ")}], got "${still.usage}"`,
        expected: rule.allowedUsages.join(" | "),
        actual: still.usage,
      });
    }

    // INTIMATE must have intimate composition keyword
    if (rule.compositionRule === "intimate") {
      const compLC = still.composition.toLowerCase();
      if (!INTIMATE_KEYWORDS.some((kw) => compLC.includes(kw))) {
        violations.push({
          stillId: still.stillId,
          violationType: "slot_usage_mismatch",
          message: `slotRole=INTIMATE requires intimate/close/tight/detail in composition`,
          expected: "intimate keyword in composition",
          actual: still.composition,
        });
      }
    }

    // EDITORIAL_WIDE must NOT have intimate composition keyword
    if (rule.compositionRule === "wide") {
      const compLC = still.composition.toLowerCase();
      if (INTIMATE_KEYWORDS.some((kw) => compLC.includes(kw))) {
        violations.push({
          stillId: still.stillId,
          violationType: "slot_usage_mismatch",
          message: `slotRole=${still.slotRole} must NOT have intimate/close/tight/detail in composition`,
          expected: "wide or medium composition",
          actual: still.composition,
        });
      }
    }
  }

  // ── Check 6: location family uniqueness uses actual still text before anchor metadata ──
  const locFamilyCounts = new Map<string, string[]>();
  for (const still of stills) {
    const anchor = still.anchorId ? anchorMap.get(still.anchorId) : undefined;
    const actualFamily = inferLocationFamilyFromStillFields(
      still.location,
      still.environmentDetails,
    );
    const anchorFamily = anchor
      ? inferLocationFamilyFromText(anchor.locationFamily)
      : "other";
    const fam =
      actualFamily !== "other"
        ? actualFamily
        : anchorFamily !== "other"
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
          violationType: "duplicate_location_family",
          message: `location family "${fam}" shared by ${ids.length} stills`,
          expected: "unique location family per still",
          actual: `shared by: ${ids.join(", ")}`,
        });
      }
    }
  }

  return { violations, passed: violations.length === 0 };
}

// ── Utility: extract unique still IDs from anchor violations ───────────────────

export function extractViolationStillIds(
  violations: AnchorViolation[],
): string[] {
  return [...new Set(violations.map((v) => v.stillId))];
}

// ── Utility: format anchor violations for repair prompt ────────────────────────

export function formatViolationsForRepair(
  violations: AnchorViolation[],
): string {
  if (violations.length === 0) return "";
  const lines = violations.map(
    (v) =>
      `stillId=${v.stillId} | violation=${v.violationType} | expected: ${v.expected} | actual: ${v.actual}`,
  );
  return `ANCHOR COMPLIANCE VIOLATIONS:\n${lines.join("\n")}`;
}

// ── Utility: extract all failing still IDs from a lint report ─────────────────

export function extractFailingStillIds(
  issues: ProductionBuildLintIssue[],
): string[] {
  const ids = new Set<string>();
  for (const issue of issues) {
    if (issue.affectedStillIds) {
      issue.affectedStillIds.forEach((id) => ids.add(id));
    }
  }
  return [...ids];
}

// ── Utility: merge repaired stills back into an existing bible ────────────────

export function mergeRepairedStills(
  bible: LandingStillBible,
  repairedStills: LandingStillSpec[],
): LandingStillBible {
  const repairedMap = new Map(repairedStills.map((s) => [s.stillId, s]));
  return {
    ...bible,
    stillLibrary: bible.stillLibrary.map(
      (s) => repairedMap.get(s.stillId) ?? s,
    ),
  };
}
