/**
 * Reference Pack Type Definitions
 *
 * Curated pre-shot reference packs that ground still generation
 * with known-good examples and known-toxic patterns per niche family + slot role.
 */

import { z } from 'zod';
import { LandingStillSlotRoleEnum } from './schema';

// ── Niche family enum — maps campaign archetypes to reference packs ──────────

export const NicheFamilyEnum = z.enum([
    'tabletop',
    'stitch',
    'sketchbook',
]);
export type NicheFamily = z.infer<typeof NicheFamilyEnum>;

// ── Camera distance enum for shot-intent underlayer ─────────────────────────

export const CameraDistanceEnum = z.enum([
    'extreme_wide',
    'wide',
    'medium_wide',
    'medium',
    'medium_close',
    'close_up',
    'macro',
]);
export type CameraDistance = z.infer<typeof CameraDistanceEnum>;

// ── Framing mode enum for shot-intent underlayer ────────────────────────────

export const FramingModeEnum = z.enum([
    'establishing',
    'environmental_portrait',
    'over_the_shoulder',
    'two_shot',
    'single_subject',
    'detail_insert',
    'overhead',
    'low_angle_hero',
]);
export type FramingMode = z.infer<typeof FramingModeEnum>;

// ── Shot intent underlayer — compact structured contract per still ──────────

export const ShotIntentSchema = z.object({
    shotIntent: z.string(),
    cameraDistance: CameraDistanceEnum,
    framingMode: FramingModeEnum,
    heroSubject: z.string(),
    nicheCue: z.string(),
    antiFallbackNote: z.string(),
    locationFamily: z.string(),
});
export type ShotIntent = z.infer<typeof ShotIntentSchema>;

// ── Winning example — a known-good still description pattern ────────────────

export const WinningExampleSchema = z.object({
    exampleId: z.string(),
    slotRole: LandingStillSlotRoleEnum,
    description: z.string(),
    shotIntent: ShotIntentSchema,
});
export type WinningExample = z.infer<typeof WinningExampleSchema>;

// ── Toxic example — a known-bad generic fallback to avoid ───────────────────

export const ToxicExampleSchema = z.object({
    exampleId: z.string(),
    description: z.string(),
    whyToxic: z.string(),
});
export type ToxicExample = z.infer<typeof ToxicExampleSchema>;

// ── Reference pack — the full curated bundle per niche family ───────────────

export const ReferencePackSchema = z.object({
    referencePackId: z.string(),
    nicheFamily: NicheFamilyEnum,
    winningExamples: z.array(WinningExampleSchema),
    toxicExamples: z.array(ToxicExampleSchema),
    requiredNicheSignals: z.array(z.string()),
    bannedFallbackPatterns: z.array(z.string()),
    cameraIntentHints: z.array(z.string()),
    locationFamilyHints: z.array(z.string()),
});
export type ReferencePack = z.infer<typeof ReferencePackSchema>;

// ── Slot-scoped reference bundle — what the generator receives per slot ─────

export const SlotReferenceBundleSchema = z.object({
    slotRole: LandingStillSlotRoleEnum,
    winningExamples: z.array(WinningExampleSchema).max(2),
    toxicExample: ToxicExampleSchema,
    requiredNicheSignals: z.array(z.string()),
    cameraIntentHints: z.array(z.string()),
    locationFamilyHints: z.array(z.string()),
});
export type SlotReferenceBundle = z.infer<typeof SlotReferenceBundleSchema>;
