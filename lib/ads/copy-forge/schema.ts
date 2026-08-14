// lib/ads/copy-forge/schema.ts
//
// Zod schema for AdCopySet. Enforces length limits at the model boundary so
// even a misbehaving LLM cannot leak past-budget copy downstream.

import { z } from 'zod/v3';

const AD_ASSET_TYPES = ['scene_image', 'ship_reference', 'hero', 'aesthetic_concept', 'still', 'merch'] as const;

export const ImageSlotDirectiveSchema = z.object({
    assetType: z.enum(AD_ASSET_TYPES),
    narrativeRole: z.string().min(8, 'narrativeRole must be specific (>=8 chars)'),
    moodCue: z.string().min(6, 'moodCue must describe lighting/energy (>=6 chars)'),
    preferTags: z.array(z.string()),
});

export const SlotPackSchema = z.object({
    compositionNote: z.string().min(20, 'compositionNote must explain how copy + imagery fuse'),
    // The real cap is enforced per template slot in the quality gate. This
    // schema ceiling only prevents runaway generations from getting absurd.
    headline: z.string().min(1).max(80, 'headline must be <=80 chars'),
    subhead: z.string().max(80, 'subhead must be <=80 chars'),
    microcopy: z.string().max(30, 'microcopy must be <=30 chars'),
    cta: z.string().min(1).max(20, 'cta must be <=20 chars'),
    imageSlotDirectives: z.record(z.string(), ImageSlotDirectiveSchema),
});

export const AdCopySetSchema = z.object({
    creativeTerritory: z.string(),
    compositionIntent: z.string().min(40, 'compositionIntent must read like a directorial brief'),
    formats: z.record(
        z.string(),
        z.union([SlotPackSchema, z.array(SlotPackSchema)]),
    ),
});

export type AdCopySetParsed = z.infer<typeof AdCopySetSchema>;
