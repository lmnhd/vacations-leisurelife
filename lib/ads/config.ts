// lib/ads/config.ts
//
// Provider + model configuration for the ad render core.
// All values are read once at import time; UI tests can override via
// constructor args rather than mutating process.env at runtime.

export type AdRenderProviderName = 'templated' | 'satori_legacy' | 'canva_autofill';

export const AD_RENDER_PROVIDER: AdRenderProviderName =
    ((process.env.AD_RENDER_PROVIDER ?? 'satori_legacy') as AdRenderProviderName);

export const TEMPLATED_API_KEY: string | undefined = process.env.TEMPLATED_API_KEY?.trim() || undefined;
export const TEMPLATED_API_BASE_URL: string = process.env.TEMPLATED_API_BASE_URL?.trim() || 'https://api.templated.io/v1';

/**
 * Local override for the Copy Forge model. Optional. If unset, Copy Forge
 * routes through the LLM gateway task map (TASK_MODEL_MAP['creative']).
 *
 * Use this only when auditioning or debugging — keep production routing
 * centralized in the gateway.
 */
export const AD_COPY_FORGE_MODEL_OVERRIDE: string | undefined =
    process.env.AD_COPY_FORGE_MODEL?.trim() || undefined;
