// lib/ads/index.ts
//
// Public surface for the reusable ad render/copy core.
// App-level callers should import only from here.

export { generateCopySet, runQualityGate, AdCopySetSchema } from './copy-forge';
export { lookupTemplate, listTemplateLayouts, listRegistryEntries } from './template-registry';
export type { RegistryEntrySummary } from './template-registry';
export { AD_RENDER_PROVIDER, AD_COPY_FORGE_MODEL_OVERRIDE, TEMPLATED_API_BASE_URL, TEMPLATED_API_KEY } from './config';
export { buildTemplatedRenderPacks } from './render-pack';
export { prepareRenderImageSource } from './image-uploader';
export { renderWithTemplated } from './providers/templated';
export type {
    AdFormat,
    AdWorkflow,
    AdAssetType,
    AdCopySet,
    SlotPack,
    ImageSlotDirective,
    SlotDescriptor,
    SlotZone,
    SlotKind,
    TemplateLayout,
    TemplateRef,
    AvailableImageInventory,
    NormalizedAdInput,
    CopyForgeInput,
    CopyForgeBriefSlice,
    CopyForgeCampaignSlice,
    CopyForgeDossierSlice,
    CopyForgeResult,
    QualityCheckKey,
    QualityCheckResult,
    QualityGateResult,
    TemplatedRenderFormat,
    TemplatedLayerOverride,
    TemplatedRenderPageInput,
    TemplatedRenderRequest,
    TemplatedRenderResponsePage,
    AdRenderImageSelection,
    AdRenderPageArtifact,
    AdRenderPack,
    AdRenderResult,
} from './types';
export { AD_FORMATS } from './types';
