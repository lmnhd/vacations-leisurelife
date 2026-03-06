import { ModelName, modelForTask } from '@/lib/ai/llm-gateway';
import type { GeneratorService } from '@/lib/campaigns/schema';

// ────────────────────────────────────────────────────────────────────────────
// MEDIA PIPELINE CONFIGURATION
// lib/campaigns/media/media-pipeline-config.ts
//
// Single source of truth for every model and parameter used in the
// Phase 2B media generation pipeline.
//
// ── HOW TO CHANGE A MODEL ────────────────────────────────────────────────────
// 1. Update the ModelName value in the LLM_TASKS section below.
// 2. That's it. All generators and routes derive the generator name
//    automatically via modelNameToGeneratorService().
//
// ── HOW TO CHANGE A MEDIA API SETTING ────────────────────────────────────────
// Update the relevant section below (STABILITY, ELEVENLABS, HEYGEN, RUNWAYML).
// ────────────────────────────────────────────────────────────────────────────

// ── ModelName → GeneratorService mapper ──────────────────────────────────────
// Keeps AssetRecord.generator accurate regardless of which model is active.
// Add new entries here when new ModelName values are added to the gateway.

const MODEL_TO_GENERATOR: Record<ModelName, GeneratorService> = {
    [ModelName.CLAUDE_4_OPUS]: 'claude4_opus',
    [ModelName.CLAUDE_4_SONNET]: 'claude4_sonnet',
    [ModelName.GPT_5_HIGH]: 'gpt4o',
    [ModelName.GPT_5_MEDIUM]: 'gpt4o',
    [ModelName.GPT_5_INSTANT]: 'gpt4o',
    [ModelName.GEMINI_3_PRO]: 'gemini3_pro',
    [ModelName.GEMINI_3_FLASH]: 'gemini3_flash',
    [ModelName.GEMINI_3_FLASH_LITE]: 'gemini3_flash_lite',
    [ModelName.LLAMA_4_MAVERICK]: 'llama4',
};

/**
 * Derives the GeneratorService enum value from a ModelName.
 * Use this in routes when building AssetRecord.generator.
 *
 * @example
 *   generator: modelNameToGeneratorService(MEDIA_LLM_CONFIG.platformCopy)
 */
export function modelNameToGeneratorService(model: ModelName): GeneratorService {
    return MODEL_TO_GENERATOR[model];
}

// ── LLM Task → Model Assignments ────────────────────────────────────────────
// Every text-generation task in the pipeline routes through the LLM gateway.
// Change campaign copy model here to instantly swap all copy generation.

export const MEDIA_LLM_CONFIG = {
    /** Platform copy batch: carousel, ad variants, captions, email subjects */
    platformCopy: modelForTask('creative'),
    /** Aesthetic brief generation (Phase 1) */
    aestheticBrief: modelForTask('creative'),
    /** Merch prompt refinement / brief parsing */
    merchPromptRefinement: ModelName.GPT_5_MEDIUM,
    /** Niche theme discovery research */
    nicheDiscovery: ModelName.GEMINI_3_PRO,
    /** Campaign match scoring and decision logic */
    campaignDecision: ModelName.GPT_5_INSTANT,
} as const satisfies Record<string, ModelName>;

// ── Stability AI Settings ─────────────────────────────────────────────────────
// Controls image generation quality, format, and API endpoint.

export const STABILITY_CONFIG = {
    apiBase: 'https://api.stability.ai/v2beta',
    endpoint: '/stable-image/generate/ultra',
    outputFormat: 'webp' as const,
    heroAspectRatio: '16:9' as const,
    conceptAspectRatio: '1:1' as const,
    referenceTransformStrength: 0.5,
    heroCount: 5,
    conceptCount: 4,
} as const;

// ── ElevenLabs Settings ───────────────────────────────────────────────────────
// Voice IDs from ElevenLabs voice library. Update to swap voices without
// touching generator logic.

export const ELEVENLABS_CONFIG = {
    apiBase: 'https://api.elevenlabs.io/v1',
    /** Voice used for 30s ambient narration (landing page hero audio) */
    narrationVoiceId: 'pNInz6obpgDQGcFmaJgB', // Adam — calm, authoritative
    /** Voice used for 15s hype clips (MMS on THRESHOLD_MET) */
    hypeVoiceId: 'EXAVITQu4vr4xnSDxMaL',      // Bella — energetic, punchy
    /** TTS model — eleven_multilingual_v2 for best quality */
    model: 'eleven_multilingual_v2' as const,
    narrationMaxChars: 1200,
    hypeMaxChars: 400,
} as const;

// ── HeyGen Settings ───────────────────────────────────────────────────────────
// Avatar and video generation parameters.

export const HEYGEN_CONFIG = {
    apiBase: 'https://api.heygen.com/v2',
    /** Default avatar. Override with HEYGEN_DEFAULT_AVATAR_ID env var. */
    defaultAvatarId: process.env.HEYGEN_DEFAULT_AVATAR_ID ?? 'josh_lite3_20230714',
    tiktokAspectRatio: '9:16' as const,
    tiktokDimensions: { width: 1080, height: 1920 } as const,
    explainerAspectRatio: '16:9' as const,
    explainerDimensions: { width: 1920, height: 1080 } as const,
    /** Max polling attempts at 10s interval = 10 minutes */
    pollIntervalMs: 10_000,
    maxPollAttempts: 60,
} as const;

// ── RunwayML Settings ─────────────────────────────────────────────────────────
// Gen-3 Alpha image-to-video parameters.

export const RUNWAYML_CONFIG = {
    apiBase: 'https://api.dev.runwayml.com/v1',
    model: 'gen3a_turbo' as const,
    apiVersion: '2024-11-06' as const,
    outputRatio: '1280:768' as const,
    /** Duration in seconds for countdown and B-roll clips */
    clipDurationSeconds: 10,
    /** Max prompt length for motion description */
    motionPromptMaxChars: 512,
    pollIntervalMs: 10_000,
    maxPollAttempts: 60,
} as const;

// ── DALL-E 3 Settings (Merch Designs) ────────────────────────────────────────
// Image generation settings for merch design output.

export const DALLE_CONFIG = {
    apiBase: 'https://api.openai.com/v1',
    model: 'dall-e-3' as const,
    size: '1024x1024' as const,
    quality: 'hd' as const,
    style: 'natural' as const,
    responseFormat: 'b64_json' as const,
} as const;

// ── Replicate API Settings (MusicGen) ───────────────────────────────────────────
// Controls music generation for campaign themes using Meta's MusicGen model via Replicate.

export const REPLICATE_CONFIG = {
    // Current MusicGen 'melody' model version hash
    musicGenModel: 'meta/musicgen:7a76a8258b23fae65c5a22debb8841d1d7e816b75c2f24218cd2bd8573787906' as const,
    defaultDuration: 30, // seconds (max 30s for this model)
    outputFormat: 'mp3' as const,
    normalizationStrategy: 'loudness' as const,
} as const;
