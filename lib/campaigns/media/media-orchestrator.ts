import { getAestheticBrief } from '../campaign-store';
import { getCampaignBlueprint } from '../campaign-store';
import { assertAestheticBriefReadyForMedia } from '../aesthetic-red-team';
import {
    AssetRecord,
    AssetType,
    CampaignMediaManifest,
    MediaGenerationJob,
    ImageFormat,
} from '../schema';
import {
    saveMediaJob,
    updateMediaJobStatus,
    saveAssetRecord,
    saveMediaManifest,
    getMediaManifest,
    updateCampaignMediaStatus,
} from './media-store';
import { storeAsset, getAssetUrl } from './storage-client';
import { generateAestheticConcepts, generateSceneImages } from './generators/stability-generator';
import { generatePlatformCrops } from './generators/sharp-processor';
import { generateMerchDesigns } from './generators/dalle-generator';
import { generateHeroExplainer, generateThresholdAnnouncement } from './generators/heygen-generator';
import { generateStoryboardVideo } from './generators/tiktok-seed-generator';
import { generateCountdownVideos, generateBrollClips } from './generators/runway-generator';
import { generateAmbientNarration, generateHypeClip } from './generators/elevenlabs-generator';
import { generateThemeMusic } from './generators/replicate-music-generator';
import { generateDesignedAdArtifactPack } from './generators/ad-artifact-generator';
import { buildDefaultThemeMusicRecord, buildThemeMusicSelectionReason, selectDefaultThemeMusicTrack } from './theme-music-library';
import { scoreTikTokVideoReadiness } from './lint/video-lint';
import { inferTikTokFormat } from './generators/tiktok-formats/index';
import { calculateElevenLabsCreditsRequired, checkMediaCredits } from './credit-check-service';
import { generatePlatformCopy, GeneratedCopy } from './generators/copy-generator';
import { buildElevenLabsVoiceTags } from './elevenlabs-voices';
import {
    assetRecordToShipReferenceCandidate,
    discoverShipReferenceCandidates,
    discoverShipReferenceCandidatesWithExclusions,
    importHeroAssetsFromReferences,
    importShipReferenceAssets,
} from './ship-reference-service';
import { randomUUID } from 'crypto';
import { DESIGNED_MEDIA_CONFIG, getMediaImageGeneratorService } from './media-pipeline-config';
import { assertProbeGateReady } from './probe-gate';
import { runSceneProbeLoop } from './probe-engine';
import { type VideoModelPresetId, getActiveVideoGeneratorService } from './video-models';
import { ShipReferenceCandidate } from '../schema';
import { resolveVideoModelPresetId } from './video-model-preference';

export { ProbeGateError } from './probe-gate';
export const PRODUCTION_BUILD_LINT_FAILURE_CODE = 'PRODUCTION_BUILD_LINT_FAILURE' as const;
export const MEDIA_READINESS_FAILURE_CODE = 'MEDIA_READINESS_FAILURE' as const;

export class ProductionBuildLintError extends Error {
    readonly code = PRODUCTION_BUILD_LINT_FAILURE_CODE;
    constructor(message: string) {
        super(message);
        this.name = 'ProductionBuildLintError';
    }
}

export class MediaReadinessError extends Error {
    readonly code = MEDIA_READINESS_FAILURE_CODE;
    constructor(message: string) {
        super(message);
        this.name = 'MediaReadinessError';
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Media Generation Orchestrator
// Coordinates all generators, uploads results to R2, writes DynamoDB records.
// ────────────────────────────────────────────────────────────────────────────

const activeGenerations = new Set<string>();

export interface GenerationOptions {
    /** Specific asset types to generate. If omitted, generates everything. */
    assetTypes?: AssetType[];
    /** Asset types that must bypass existing-manifest skip logic. */
    forceRegenerateAssetTypes?: AssetType[];
    themeMusicSource?: 'replicate' | 'default';
    sceneImageMode?: 'all' | 'missing_only';
    storyboardDeliverableIds?: string[];
    videoModelPresetId?: VideoModelPresetId;
    /**
     * Optional probe gate. Defaults to 'ignore' (existing pipeline unaffected).
     * 'require_approved' — blocks spend-gated generation if the latest probe run is blocked or missing.
     * 'warn_only'        — logs a warning but does not block.
     */
    probeGate?: 'require_approved' | 'warn_only' | 'ignore';
}

export interface GenerationResult {
    slug: string;
    manifest: CampaignMediaManifest;
    jobSummary: {
        total: number;
        completed: number;
        failed: number;
        errors: string[];
        warnings: string[];
    };
}

type GeneratorCategory = 'images' | 'video' | 'audio' | 'merch' | 'copy';

function getApprovedReferenceCandidates(records: readonly AssetRecord[]): ShipReferenceCandidate[] {
    return records
        .filter((record) => record.assetType === 'ship_reference_image' && (
            record.curation?.approvalState === 'human_approved' ||
            record.reviewStatus === 'human_approved' ||
            record.reviewStatus === 'auto_approved'   // SerpAPI references are systematically curated — auto_approved is their correct trusted state
        ))
        .map((record) => assetRecordToShipReferenceCandidate(record))
        .filter((candidate): candidate is ShipReferenceCandidate => candidate !== null);
}

function getAvailableReferenceCandidates(records: readonly AssetRecord[]): ShipReferenceCandidate[] {
    return records
        .filter((record) => record.assetType === 'ship_reference_image' && record.active)
        .map((record) => assetRecordToShipReferenceCandidate(record))
        .filter((candidate): candidate is ShipReferenceCandidate => candidate !== null);
}

function shouldRunAsset(
    assetType: AssetType,
    assetTypes?: AssetType[]
): boolean {
    if (!assetTypes) return true;
    return assetTypes.includes(assetType);
}

function shouldRunAny(
    requestedAssetTypes: readonly AssetType[],
    assetTypes?: AssetType[]
): boolean {
    if (!assetTypes) return true;
    return requestedAssetTypes.some((assetType) => assetTypes.includes(assetType));
}

function shouldForceRegenerateAsset(
    assetType: AssetType,
    forceRegenerateAssetTypes?: AssetType[]
): boolean {
    if (!forceRegenerateAssetTypes) return false;
    return forceRegenerateAssetTypes.includes(assetType);
}

function shouldRunStoryboardDeliverable(
    deliverableId: string,
    storyboardDeliverableIds?: readonly string[]
): boolean {
    if (!storyboardDeliverableIds || storyboardDeliverableIds.length === 0) {
        return true;
    }

    return storyboardDeliverableIds.includes(deliverableId);
}

function shouldRunDesignedAds(assetTypes?: AssetType[]): boolean {
    if (DESIGNED_MEDIA_CONFIG.mode === 'off') return false;
    if (!assetTypes) return true;
    return assetTypes.includes('designed_ad_artifact') || assetTypes.includes('documentary_detail_image');
}

function getSceneImageSceneId(asset: AssetRecord): string | null {
    const taggedSceneId = asset.tags.find((tag) => tag !== 'scene' && tag !== 'scene_image');
    return taggedSceneId ?? null;
}

function mergeAssetRecords(
    existingRecords: readonly AssetRecord[],
    newRecords: readonly AssetRecord[]
): AssetRecord[] {
    if (newRecords.length === 0) {
        return [...existingRecords];
    }

    const merged = new Map(existingRecords.map((record) => [record.assetId, record]));
    for (const record of newRecords) {
        merged.set(record.assetId, record);
    }

    return Array.from(merged.values());
}

function resolveSceneImageMode(options: GenerationOptions): 'all' | 'missing_only' {
    if (options.sceneImageMode) {
        return options.sceneImageMode;
    }

    return shouldForceRegenerateAsset('scene_image', options.forceRegenerateAssetTypes)
        ? 'all'
        : 'missing_only';
}

function calculateRequestedElevenLabsCredits(
    brief: Awaited<ReturnType<typeof getAestheticBrief>>,
    options: GenerationOptions,
    hasProductionBible: boolean
): number {
    const storyboardNarrationScripts = hasProductionBible
        ? (brief?.productionBible?.storyboards ?? [])
            .filter((storyboard) => shouldRunStoryboardDeliverable(storyboard.deliverableId, options.storyboardDeliverableIds))
            .filter((storyboard) => {
                const assetType: AssetType = storyboard.deliverableId.startsWith('tiktok') ? 'tiktok_seed_video'
                    : storyboard.deliverableId.startsWith('hero') ? 'hero_explainer_video'
                    : storyboard.deliverableId.startsWith('threshold') ? 'threshold_video'
                    : storyboard.deliverableId.startsWith('countdown') ? 'countdown_video'
                    : 'broll_clip';
                return shouldRunAsset(assetType, options.assetTypes);
            })
            .map((storyboard) => storyboard.narrationScript)
        : [];

    const shouldIncludeAmbientNarration = shouldRunAsset('ambient_narration', options.assetTypes);
    const ambientNarrationScript = shouldIncludeAmbientNarration ? brief?.audio.ambientNarrationScript : undefined;

    const hypeClipScript = shouldRunAsset('hype_clip', options.assetTypes) ? brief?.audio.hypeClipScript : undefined;

    return calculateElevenLabsCreditsRequired({
        ambientNarrationScript,
        hypeClipScript,
        storyboardNarrationScripts,
    });
}

function makeAssetRecord(
    assetId: string,
    assetType: AssetType,
    url: string,
    generator: AssetRecord['generator'],
    promptUsed: string,
    fileSizeBytes: number,
    mimeType: string,
    tags: string[],
    dims?: { width: number; height: number },
    duration?: number
): AssetRecord {
    return {
        assetId,
        assetType,
        url,
        generator,
        promptUsed,
        fileSizeBytes,
        mimeType,
        tags,
        createdAt: new Date().toISOString(),
        reviewStatus: 'auto_approved',
        version: 1,
        active: true,
        ...(dims ? { dimensions: dims } : {}),
        ...(duration !== undefined ? { durationSeconds: duration } : {}),
    };
}

async function uploadAndRecord(
    slug: string,
    assetId: string,
    assetType: AssetType,
    generator: AssetRecord['generator'],
    prompt: string,
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    tags: string[],
    dims?: { width: number; height: number },
    duration?: number
): Promise<AssetRecord> {
    // storeAsset routes to R2 when configured, falls back to DynamoDB or placeholder.
    const url = await storeAsset(slug, assetId, fileName, buffer, mimeType);
    const record = makeAssetRecord(
        assetId, assetType, url, generator, prompt,
        buffer.length, mimeType, tags, dims, duration
    );
    await saveAssetRecord(slug, record);
    return record;
}

async function downloadAssetBuffer(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download asset: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
}

async function runWithJob(
    slug: string,
    assetType: AssetType,
    generator: AssetRecord['generator'],
    prompt: string,
    fn: () => Promise<AssetRecord[]>,
    errors: string[]
): Promise<AssetRecord[]> {
    const jobId = `job_${randomUUID().slice(0, 8)}`;
    const job: MediaGenerationJob = {
        jobId,
        campaignSlug: slug,
        assetType,
        status: 'in_progress',
        generator,
        promptUsed: prompt,
        retryCount: 0,
        createdAt: new Date().toISOString(),
    };
    await saveMediaJob(job);

    try {
        const records = await fn();
        const firstUrl = records[0]?.url;
        await updateMediaJobStatus(slug, jobId, 'complete', firstUrl);
        return records;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await updateMediaJobStatus(slug, jobId, 'failed', undefined, message);
        errors.push(`[${assetType}/${generator}] ${message}`);
        return [];
    }
}

/**
 * Main entry point — run the full media generation pipeline.
 */
export async function runMediaGeneration(
    slug: string,
    options?: GenerationOptions
): Promise<GenerationResult> {
    if (activeGenerations.has(slug)) {
        throw new Error(`Media generation already in progress for campaign ${slug}`);
    }
    activeGenerations.add(slug);

    try {
        const resolvedOptions: GenerationOptions = {
            ...(options ?? {}),
            videoModelPresetId: await resolveVideoModelPresetId(options?.videoModelPresetId),
        };
        const activeVideoGeneratorService = getActiveVideoGeneratorService(resolvedOptions.videoModelPresetId);
        const existingManifest = await getMediaManifest(slug);
        const campaign = await getCampaignBlueprint(slug);
        if (!campaign) {
            throw new Error(`Campaign not found: ${slug}`);
        }
        const brief = await getAestheticBrief(slug);
        const requiresApprovedBrief = shouldRunAny([
            'hero_image',
            'aesthetic_concept',
            'scene_image',
            'platform_crop',
            'tiktok_seed_video',
            'hero_explainer_video',
            'threshold_video',
            'countdown_video',
            'broll_clip',
            'ambient_narration',
            'hype_clip',
            'theme_music',
            'ad_creative',
            'carousel_slide',
            'email_header',
            'merch_design',
        ], resolvedOptions.assetTypes);
        if (requiresApprovedBrief && !brief) {
            throw new Error(`No approved aesthetic brief found for campaign: ${slug}`);
        }
        if (requiresApprovedBrief) {
            assertAestheticBriefReadyForMedia(brief!, slug);
        }
        if (shouldRunAsset('scene_image', resolvedOptions.assetTypes)) {
            if (!brief?.productionBible) {
                throw new MediaReadinessError(
                    `Production Bible missing for ${slug}. Regenerate the Production Bible, approve the brief, then retry scene image generation.`
                );
            }
            if (brief.productionBible.sceneLibrary.length === 0) {
                throw new MediaReadinessError(
                    `Production Bible for ${slug} has no scene library entries. Regenerate the Production Bible so it emits scenes, approve the brief, then retry scene image generation.`
                );
            }
        }

        // ── Production build lint gate ────────────────────────────────────
        const spendGatedTypes: AssetType[] = ['hero_image', 'aesthetic_concept', 'scene_image'];
        const requestingSpendGatedTypes = spendGatedTypes.some(t => shouldRunAsset(t, resolvedOptions.assetTypes));

        if (requestingSpendGatedTypes) {
            const existingLintVerdict = brief!.productionBuildStatus;

            if (existingLintVerdict === 'fail') {
                throw new ProductionBuildLintError(
                    `Production build for ${slug} has failed pre-spend quality checks and cannot proceed to image generation. ` +
                    `Review repeated pattern issues and niche signal failures in the production bible, then regenerate the build.`
                );
            }

            if (!brief!.landingStillBible || !brief!.productionBuildStatus) {
                throw new ProductionBuildLintError(
                    `Production build for ${slug} has not been evaluated. ` +
                    `Generate the production bible first to run pre-spend lint before generating hero or concept images.`
                );
            }

            // ── Optional landing-still probe gate ────────────────────────────
            if (resolvedOptions.probeGate === 'require_approved') {
                await assertProbeGateReady(slug);
            } else if (resolvedOptions.probeGate === 'warn_only') {
                const { getLatestProbeRunRecord } = await import('./media-store');
                const lastRun = await getLatestProbeRunRecord(slug);
                if (!lastRun || lastRun.verdict === 'blocked') {
                    console.warn(
                        `[media-orchestrator] Probe gate warning: no approved probe run for ${slug}. ` +
                        `Run /media/probe first for early direction validation.`,
                    );
                }
            }

        }

        // 2. Update campaign status
        await updateCampaignMediaStatus(slug, 'generating');

        const errors: string[] = [];
        const warnings: string[] = [];
        const shipReferenceRecords: AssetRecord[] = [];
        const heroRecords: AssetRecord[] = [];
        const sceneImageRecords: AssetRecord[] = [];
        const conceptRecords: AssetRecord[] = [];
        const documentaryDetailRecords: AssetRecord[] = [];
        const designedAdRecords: AssetRecord[] = [];
        const cropRecords: AssetRecord[] = [];
        const merchRecords: AssetRecord[] = [];
        const hasProductionBible = brief?.productionBible !== undefined && brief?.productionBible !== null;
        let copyCarouselSlides: string[] = [];
        let copyAdVariants: GeneratedCopy['adVariants'] = [];
        let copyCaptions: GeneratedCopy['captions'] | null = null;
        let copyEmailSubjectLines: GeneratedCopy['emailSubjectLines'] = [];
        let hasCopy = false;
        const videoRecords: {
            tiktokSeed: AssetRecord | null;
            heroExplainer: AssetRecord | null;
            thresholdAnnouncement: AssetRecord | null;
            countdown: AssetRecord[];
            broll: AssetRecord[];
        } = {
            tiktokSeed: null,
            heroExplainer: null,
            thresholdAnnouncement: null,
            countdown: [],
            broll: [],
        };
        const audioRecords: {
            ambientNarration: AssetRecord | null;
            hypeClip: AssetRecord | null;
            themeMusic: AssetRecord | null;
        } = {
            ambientNarration: null,
            hypeClip: null,
            themeMusic: null,
        };

        // ── GROUP 1: Independent generators (parallel) ────────────────
        const group1Promises: Promise<unknown>[] = [];

        if (shouldRunDesignedAds(resolvedOptions.assetTypes)) {
            group1Promises.push(
                runWithJob(slug, 'designed_ad_artifact', 'sharp', 'designed static ad artifact pack', async () => {
                    const result = await generateDesignedAdArtifactPack(slug, brief!, campaign);
                    documentaryDetailRecords.push(...result.documentaryDetails);
                    designedAdRecords.push(...result.designedAds);
                    return [...result.documentaryDetails, ...result.designedAds];
                }, errors)
            );
        }

        if (shouldRunAsset('ship_reference_image', resolvedOptions.assetTypes)) {
            group1Promises.push(
                runWithJob(slug, 'ship_reference_image', 'serpapi', 'real ship reference discovery', async () => {
                    const existingReferenceRecords = [
                        ...(existingManifest?.images.shipReferences ?? []),
                        ...shipReferenceRecords,
                    ];
                    const candidates = await discoverShipReferenceCandidatesWithExclusions(campaign, 6, {
                        imageUrls: existingReferenceRecords.map((record) => record.sourceImageUrl ?? record.url),
                    });
                    if (candidates.length === 0) {
                        throw new Error(`No usable ship reference images found for ${slug}`);
                    }
                    const referenceRecords = await importShipReferenceAssets(slug, campaign, candidates);
                    shipReferenceRecords.push(...referenceRecords);
                    return referenceRecords;
                }, errors)
            );
        }

        if (shouldRunAsset('hero_image', resolvedOptions.assetTypes)) {
            group1Promises.push(
                runWithJob(slug, 'hero_image', getMediaImageGeneratorService(), 'real ship hero imagery from approved references', async () => {
                    const manifestReferenceRecords = [
                        ...(existingManifest?.images.shipReferences ?? []),
                        ...shipReferenceRecords,
                    ];
                    const approvedReferenceCandidates = getApprovedReferenceCandidates(manifestReferenceRecords);
                    const availableReferenceCandidates = getAvailableReferenceCandidates(manifestReferenceRecords);

                    // Use approved (includes auto_approved SerpAPI) candidates first; fall back to all active records.
                    const selectedHeroRecords = approvedReferenceCandidates.length > 0
                        ? await importHeroAssetsFromReferences(slug, campaign, brief!, approvedReferenceCandidates, 5)
                        : availableReferenceCandidates.length > 0
                            ? await importHeroAssetsFromReferences(slug, campaign, brief!, availableReferenceCandidates, 5)
                            : await importHeroAssetsFromReferences(slug, campaign, brief!, [], 5);

                    heroRecords.push(...selectedHeroRecords);
                    return selectedHeroRecords;
                }, errors)
            );
        }

        if (shouldRunAsset('aesthetic_concept', resolvedOptions.assetTypes)) {
            group1Promises.push(
                runWithJob(slug, 'aesthetic_concept', getMediaImageGeneratorService(), 'concept art', async () => {
                    const images = await generateAestheticConcepts(brief!);
                    const records: AssetRecord[] = [];
                    for (const img of images) {
                        const rec = await uploadAndRecord(
                            slug, img.assetId, 'aesthetic_concept', getMediaImageGeneratorService(),
                            img.prompt, img.buffer, img.fileName, 'image/png',
                            ['concept', 'moodboard'], { width: 1080, height: 1080 }
                        );
                        records.push(rec);
                    }
                    conceptRecords.push(...records);
                    return records;
                }, errors)
            );
        }

        if (shouldRunAsset('merch_design', resolvedOptions.assetTypes)) {
            group1Promises.push(
                runWithJob(slug, 'merch_design', getMediaImageGeneratorService(), 'merch designs', async () => {
                    const designs = await generateMerchDesigns(brief!);
                    const records: AssetRecord[] = [];
                    for (const img of designs) {
                        const rec = await uploadAndRecord(
                            slug, img.assetId, 'merch_design', getMediaImageGeneratorService(),
                            img.prompt, img.buffer, img.fileName, 'image/png',
                            ['merch', 'design'], { width: 1024, height: 1024 }
                        );
                        records.push(rec);
                    }
                    merchRecords.push(...records);
                    return records;
                }, errors)
            );
        }

        if (shouldRunAny(['ad_creative', 'carousel_slide', 'email_header'], resolvedOptions.assetTypes)) {
            group1Promises.push(
                runWithJob(slug, 'ad_creative', 'gpt4o', 'platform copy', async () => {
                    const generatedCopy = await generatePlatformCopy(brief!);
                    copyCarouselSlides = generatedCopy.carouselSlides;
                    copyAdVariants = generatedCopy.adVariants;
                    copyCaptions = generatedCopy.captions;
                    copyEmailSubjectLines = generatedCopy.emailSubjectLines;
                    hasCopy = true;
                    // Store copy as a JSON asset
                    const copyBuffer = Buffer.from(JSON.stringify(generatedCopy, null, 2));
                    const rec = await uploadAndRecord(
                        slug, 'copy_platform_set', 'ad_creative', 'gpt4o',
                        'platform copy batch', copyBuffer, 'copy/platform_captions.json',
                        'application/json', ['copy', 'captions']
                    );
                    return [rec];
                }, errors)
            );
        }

        if (shouldRunAsset('ambient_narration', resolvedOptions.assetTypes)) {
            // Ambient narration
            group1Promises.push(
                runWithJob(slug, 'ambient_narration', 'elevenlabs', 'ambient narration', async () => {
                    const audio = await generateAmbientNarration(brief!);
                    const rec = await uploadAndRecord(
                        slug, audio.assetId, 'ambient_narration', 'elevenlabs',
                        audio.script, audio.buffer, audio.fileName, 'audio/mpeg',
                        ['audio', 'narration', 'landing_page', ...buildElevenLabsVoiceTags(audio.voiceRole, audio.voiceId, audio.voiceName)]
                    );
                    audioRecords.ambientNarration = rec;
                    return [rec];
                }, errors)
            );

        }

        if (shouldRunAsset('hype_clip', resolvedOptions.assetTypes)) {
            // Hype clip
            group1Promises.push(
                runWithJob(slug, 'hype_clip', 'elevenlabs', 'hype clip', async () => {
                    const audio = await generateHypeClip(brief!);
                    const rec = await uploadAndRecord(
                        slug, audio.assetId, 'hype_clip', 'elevenlabs',
                        audio.script, audio.buffer, audio.fileName, 'audio/mpeg',
                        ['audio', 'hype', 'sms', ...buildElevenLabsVoiceTags(audio.voiceRole, audio.voiceId, audio.voiceName)]
                    );
                    audioRecords.hypeClip = rec;
                    return [rec];
                }, errors)
            );

        }

        if (shouldRunAsset('theme_music', resolvedOptions.assetTypes)) {
            // Theme music
            group1Promises.push(
                runWithJob(slug, 'theme_music', resolvedOptions.themeMusicSource === 'default' ? 'default_library' : 'replicate', 'theme music', async () => {
                    if (resolvedOptions.themeMusicSource === 'default') {
                        const selectedTrack = await selectDefaultThemeMusicTrack(brief!);
                        if (!selectedTrack) {
                            throw new Error('No default theme music tracks are available in the shared library');
                        }

                        const selectionReason = buildThemeMusicSelectionReason(brief!, selectedTrack);
                        const record = buildDefaultThemeMusicRecord(slug, selectedTrack, selectionReason);
                        await saveAssetRecord(slug, record);
                        audioRecords.themeMusic = record;
                        return [record];
                    }

                    const audio = await generateThemeMusic(brief!);
                    const rec = await uploadAndRecord(
                        slug, audio.assetId, 'theme_music', 'replicate',
                        audio.script, audio.buffer, audio.fileName, 'audio/mpeg',
                        ['audio', 'music', 'theme']
                    );
                    audioRecords.themeMusic = rec;
                    return [rec];
                }, errors)
            );
        }

        await Promise.all(group1Promises);

        const shouldGenerateNarratedVideos = shouldRunAny(['tiktok_seed_video', 'hero_explainer_video', 'threshold_video', 'countdown_video', 'broll_clip'], resolvedOptions.assetTypes);
        const selectedThemeMusicRecord = audioRecords.themeMusic ?? existingManifest?.audio.themeMusic ?? null;
        let themeMusicBuffer: Buffer | null = null;

        if (shouldGenerateNarratedVideos) {
            if (!selectedThemeMusicRecord) {
                warnings.push('No theme music track is selected. Narrated storyboard and TikTok videos will be composed without background music.');
            } else {
                try {
                    themeMusicBuffer = await downloadAssetBuffer(selectedThemeMusicRecord.url);
                } catch (err) {
                    warnings.push(`Theme music could not be loaded from the selected asset. Narrated storyboard and TikTok videos will be composed without background music. ${err instanceof Error ? err.message : String(err)}`);
                }
            }
        }

        // ── Scene probe gate — runs after GROUP 1 (brief loaded), before GROUP 2 spend ──
        // runSceneProbeLoop generates cheap Stability probe images for every sceneLibrary
        // entry, scores them with Claude vision, saves the result to DynamoDB, and returns
        // a verdict. A blocked verdict stops generation before any full-resolution scene
        // images are produced. Unconditional — does not require probeGate to be set.
        if (shouldRunAsset('scene_image', resolvedOptions.assetTypes) && hasProductionBible) {
            console.log(`[media-orchestrator] Running scene probe for ${slug} before scene image generation`);
            const sceneProbeResult = await runSceneProbeLoop(slug);
            if (sceneProbeResult.verdict === 'blocked') {
                throw new MediaReadinessError(
                    `Scene probe for ${slug} is blocked: ${sceneProbeResult.verdictReason}. ` +
                    `Fix the scene imagePrompts in the production bible (regenerate), then retry scene image generation.`
                );
            }
            if (sceneProbeResult.verdict === 'warn') {
                warnings.push(
                    `[scene-probe] WARN: ${sceneProbeResult.verdictReason} ` +
                    `(${sceneProbeResult.passCount}/${sceneProbeResult.totalProbed} passed)`
                );
            }
        }

        // ── GROUP 2: Depends on hero images ───────────────────────────
        const heroImageUrls = heroRecords.map(r => r.url);
        const firstHeroUrl = heroImageUrls[0] || '';

        const group2Promises: Promise<unknown>[] = [];

        // Platform crops (from hero images)
        if (shouldRunAsset('platform_crop', resolvedOptions.assetTypes) && heroRecords.length > 0) {
            for (const heroRec of heroRecords) {
                group2Promises.push(
                    (async () => {
                        try {
                            // Download the hero source for cropping
                            const sourceResp = await fetch(heroRec.url);
                            const sourceBuffer = Buffer.from(await sourceResp.arrayBuffer());
                            const crops = await generatePlatformCrops(sourceBuffer, heroRec.assetId);
                            for (const crop of crops) {
                                const rec = await uploadAndRecord(
                                    slug, crop.assetId, 'platform_crop', 'sharp',
                                    `Crop of ${heroRec.assetId} to ${crop.format}`,
                                    crop.buffer, crop.fileName, 'image/webp',
                                    ['crop', crop.format, heroRec.assetId],
                                    { width: crop.width, height: crop.height }
                                );
                                cropRecords.push(rec);
                            }
                        } catch (err) {
                            errors.push(`[platform_crop/sharp] ${err instanceof Error ? err.message : String(err)}`);
                        }
                    })()
                );
            }
        }

        // ── Scene image generation (Production Bible path) ──────────
        if (shouldRunAsset('scene_image', resolvedOptions.assetTypes) && !hasProductionBible) {
            errors.push(
                `Scene image generation requires a saved Production Bible for ${slug}. Regenerate the Production Bible first, then retry Scene Images.`
            );
        }

        if (shouldRunAsset('scene_image', resolvedOptions.assetTypes) && hasProductionBible) {
            group2Promises.push(
                runWithJob(slug, 'scene_image', getMediaImageGeneratorService(), 'scene images from production bible', async () => {
                    const manifestReferenceRecords = [
                        ...(existingManifest?.images.shipReferences ?? []),
                        ...shipReferenceRecords,
                    ];
                    const approvedReferenceCandidates = getApprovedReferenceCandidates(manifestReferenceRecords);
                    const availableReferenceCandidates = getAvailableReferenceCandidates(manifestReferenceRecords);
                    // Use approved (includes auto_approved SerpAPI) candidates first; fall back to all active records.
                    const sceneReferenceCandidates = approvedReferenceCandidates.length > 0
                        ? approvedReferenceCandidates
                        : availableReferenceCandidates;

                    if (sceneReferenceCandidates.length === 0) {
                        throw new Error(`No ship reference images found for ${slug}. Import references first before generating scene images.`);
                    }

                    const sceneLibrary = brief!.productionBible!.sceneLibrary;
                    const sceneImageMode = resolveSceneImageMode(resolvedOptions);
                    const scenesToGenerate = sceneImageMode === 'missing_only'
                        ? sceneLibrary.filter((scene) => {
                            const existingSceneRecord = (existingManifest?.images.sceneImages ?? []).find((record) => {
                                if (!record.active) return false;
                                return getSceneImageSceneId(record) === scene.sceneId;
                            });

                            return !existingSceneRecord;
                        })
                        : sceneLibrary;

                    if (scenesToGenerate.length === 0) {
                        return [];
                    }

                    const sceneImages = await generateSceneImages(
                        scenesToGenerate,
                        sceneReferenceCandidates,
                        campaign.shipTarget || 'TBD',
                        brief?.visual.plausibilityFramework.allowedProps.slice(0, 5) ?? [],
                    );
                    const records: AssetRecord[] = [];
                    for (const img of sceneImages) {
                        const rec = await uploadAndRecord(
                            slug, img.assetId, 'scene_image', getMediaImageGeneratorService(),
                            img.prompt, img.buffer, img.fileName, 'image/png',
                            ['scene', img.sceneId], { width: 1920, height: 1080 }
                        );
                        records.push(rec);
                    }
                    sceneImageRecords.push(...records);
                    return records;
                }, errors)
            );
        }

        // ── Video generation (legacy path only — storyboard path runs in GROUP 3) ──────
        let videoCreditsOk = false;
        if (shouldRunAny(['tiktok_seed_video', 'hero_explainer_video', 'threshold_video', 'countdown_video', 'broll_clip'], resolvedOptions.assetTypes)) {
            // Credit pre-check: verify RunwayML balance before burning any credits
            const sceneCount = brief!.productionBible?.sceneLibrary.length ?? 10;
            const elevenLabsCreditsRequired = calculateRequestedElevenLabsCredits(brief!, resolvedOptions, hasProductionBible);
            const creditCheck = await checkMediaCredits(
                sceneCount,
                resolvedOptions.storyboardDeliverableIds,
                elevenLabsCreditsRequired,
                resolvedOptions.videoModelPresetId,
            );
            if (!creditCheck.canProceed) {
                const msg = `Media generation blocked by credit pre-check:\n${creditCheck.blockers.join('\n')}`;
                errors.push(msg);
            } else {
            videoCreditsOk = true;
            if (!hasProductionBible && firstHeroUrl) {
                // ── Legacy video generation (no Production Bible) ──────────
                if (shouldRunAsset('tiktok_seed_video', resolvedOptions.assetTypes)) {
                    errors.push(
                        'TikTok seed video now requires a Production Bible and generated scene images. ' +
                        'Generate the Production Bible first, then rerun media generation for tiktok_seed_video.'
                    );
                }

                if (shouldRunAsset('hero_explainer_video', resolvedOptions.assetTypes)) {
                    group2Promises.push(
                        runWithJob(slug, 'hero_explainer_video', 'heygen', 'hero explainer', async () => {
                            const video = await generateHeroExplainer(brief!, firstHeroUrl);
                            const rec = await uploadAndRecord(
                                slug, video.assetId, 'hero_explainer_video', 'heygen',
                                video.script, video.buffer, video.fileName, 'video/mp4',
                                ['video', 'explainer', 'landing_page'], undefined, video.durationSeconds
                            );
                            videoRecords.heroExplainer = rec;
                            return [rec];
                        }, errors)
                    );
                }

                if (shouldRunAsset('threshold_video', resolvedOptions.assetTypes)) {
                    group2Promises.push(
                        runWithJob(slug, 'threshold_video', 'heygen', 'threshold announcement', async () => {
                            const video = await generateThresholdAnnouncement(brief!, firstHeroUrl);
                            const rec = await uploadAndRecord(
                                slug, video.assetId, 'threshold_video', 'heygen',
                                video.script, video.buffer, video.fileName, 'video/mp4',
                                ['video', 'threshold', 'announcement'], undefined, video.durationSeconds
                            );
                            videoRecords.thresholdAnnouncement = rec;
                            return [rec];
                        }, errors)
                    );
                }

                if (shouldRunAsset('countdown_video', resolvedOptions.assetTypes)) {
                    group2Promises.push(
                        runWithJob(slug, 'countdown_video', activeVideoGeneratorService, 'countdown videos', async () => {
                            const videos = await generateCountdownVideos(brief!, firstHeroUrl, resolvedOptions.videoModelPresetId);
                            const records: AssetRecord[] = [];
                            for (const vid of videos) {
                                const rec = await uploadAndRecord(
                                    slug, vid.assetId, 'countdown_video', activeVideoGeneratorService,
                                    vid.motionPrompt, vid.buffer, vid.fileName, 'video/mp4',
                                    ['video', 'countdown'], undefined, vid.durationSeconds
                                );
                                records.push(rec);
                            }
                            videoRecords.countdown.push(...records);
                            return records;
                        }, errors)
                    );
                }

                if (heroImageUrls.length > 0 && shouldRunAsset('broll_clip', resolvedOptions.assetTypes)) {
                    group2Promises.push(
                        runWithJob(slug, 'broll_clip', activeVideoGeneratorService, 'broll clips', async () => {
                            const videos = await generateBrollClips(brief!, heroImageUrls, resolvedOptions.videoModelPresetId);
                            const records: AssetRecord[] = [];
                            for (const vid of videos) {
                                const rec = await uploadAndRecord(
                                    slug, vid.assetId, 'broll_clip', activeVideoGeneratorService,
                                    vid.motionPrompt, vid.buffer, vid.fileName, 'video/mp4',
                                    ['video', 'broll', 'cinematic'], undefined, vid.durationSeconds
                                );
                                records.push(rec);
                            }
                            videoRecords.broll.push(...records);
                            return records;
                        }, errors)
                    );
                }
            }
            } // end else (credit check passed)
        }

        await Promise.all(group2Promises);

        // ── GROUP 3: Storyboard-driven video assembly (Production Bible path) ────────
        // Must run AFTER group2 so sceneImageRecords is fully populated.
        if (videoCreditsOk && hasProductionBible && brief!.productionBible!.storyboards.length > 0) {
            // Prefer freshly-generated scene image records; fall back to existing manifest
            const effectiveSceneImages = mergeAssetRecords(existingManifest?.images.sceneImages ?? [], sceneImageRecords);
            const sceneImageMap = new Map<string, string>();
            for (const rec of effectiveSceneImages) {
                const sceneIdTag = rec.tags.find(t => t !== 'scene' && t !== 'revised');
                if (sceneIdTag) sceneImageMap.set(sceneIdTag, rec.url);
            }
            const fallbackUrl = firstHeroUrl;

            // Sequential — each storyboard video calls ElevenLabs; parallel runs hit the concurrent cap
            for (const storyboard of brief!.productionBible!.storyboards) {
                const delivId = storyboard.deliverableId;
                const assetType: AssetType = delivId.startsWith('tiktok') ? 'tiktok_seed_video'
                    : delivId.startsWith('hero') ? 'hero_explainer_video'
                    : delivId.startsWith('threshold') ? 'threshold_video'
                    : delivId.startsWith('countdown') ? 'countdown_video'
                    : 'broll_clip';

                if (!shouldRunAsset(assetType, resolvedOptions.assetTypes)) continue;
                if (!shouldRunStoryboardDeliverable(delivId, resolvedOptions.storyboardDeliverableIds)) continue;

                const forceRegenerateAsset = shouldForceRegenerateAsset(assetType, resolvedOptions.forceRegenerateAssetTypes);
                const alreadyExists =
                    (assetType === 'tiktok_seed_video'      && !!existingManifest?.videos.tiktokSeed) ||
                    (assetType === 'hero_explainer_video'   && !!existingManifest?.videos.heroExplainer) ||
                    (assetType === 'threshold_video'        && !!existingManifest?.videos.thresholdAnnouncement) ||
                    (assetType === 'countdown_video'        && existingManifest?.videos.countdown.some(r => r.tags.includes(delivId))) ||
                    (assetType === 'broll_clip'             && existingManifest?.videos.broll.some(r => r.tags.includes(delivId)));
                if (alreadyExists && !forceRegenerateAsset) continue;

                await runWithJob(slug, assetType, activeVideoGeneratorService, `storyboard: ${delivId}`, async () => {
                    const video = await generateStoryboardVideo(
                        brief!, storyboard, sceneImageMap, fallbackUrl, themeMusicBuffer, undefined, undefined, resolvedOptions.videoModelPresetId, slug
                    );
                    // Resolve distribution tag from the format registry — deterministic, not substring-based
                    const tiktokFormat = assetType === 'tiktok_seed_video' ? inferTikTokFormat(delivId) : null;
                    const distributionTags = tiktokFormat ? [tiktokFormat.distributionTag] : [];
                    const isTextFirstTikTok = assetType === 'tiktok_seed_video' && video.script.trim().length === 0;
                    const narrationTags = isTextFirstTikTok
                        ? ['text_first']
                        : ['narrated', ...buildElevenLabsVoiceTags('narration', video.narrationVoiceId, video.narrationVoiceName)];
                    const baseTags = ['video', 'storyboard', delivId, ...narrationTags, ...distributionTags];
                    const rec = await uploadAndRecord(
                        slug, video.assetId, assetType, activeVideoGeneratorService,
                        `${video.motionPrompt}\n\n${video.script}`,
                        video.buffer, video.fileName, 'video/mp4',
                        baseTags, undefined, video.durationSeconds
                    );

                    // Lint gate for TikTok storyboard videos
                    let finalRec = rec;
                    if (assetType === 'tiktok_seed_video' && tiktokFormat) {
                        const variant = tiktokFormat.distributionTag === 'paid' ? 'paid' : 'organic';
                        const lint = scoreTikTokVideoReadiness(
                            { tags: baseTags, durationSeconds: video.durationSeconds },
                            storyboard,
                            sceneImageMap,
                            variant,
                        );
                        if (lint.lintStatus === 'fail') {
                            throw new Error(`Storyboard video "${delivId}" failed quality lint (score ${lint.lintScore}/100): ${lint.issues.join('; ')}`);
                        }
                        if (lint.lintStatus === 'warn') {
                            warnings.push(`[${delivId}/lint] WARN (score ${lint.lintScore}): ${lint.issues.join('; ')}`);
                        }
                        finalRec = { ...rec, lintScore: lint.lintScore, lintStatus: lint.lintStatus };
                    }

                    if (assetType === 'tiktok_seed_video') videoRecords.tiktokSeed = finalRec;
                    else if (assetType === 'hero_explainer_video') videoRecords.heroExplainer = rec;
                    else if (assetType === 'threshold_video') videoRecords.thresholdAnnouncement = rec;
                    else if (assetType === 'countdown_video') videoRecords.countdown.push(rec);
                    else videoRecords.broll.push(rec);
                    return [finalRec];
                }, errors);
            }
        }

        // ── Build manifest ────────────────────────────────────────────

        const cropsByFormat: Record<string, AssetRecord[]> = {};
        for (const crop of cropRecords) {
            const formatTag = crop.tags.find((tag) =>
                ['hero_16x9', 'hero_4x5', 'story_9x16', 'square_1x1', 'banner_3x1', 'email_header', 'og_image', 'thumbnail'].includes(tag)
            ) || 'unknown';
            if (!cropsByFormat[formatTag]) {
                cropsByFormat[formatTag] = [];
            }
            cropsByFormat[formatTag].push(crop);
        }

        const mergedImages = {
            shipReferences: mergeAssetRecords(existingManifest?.images.shipReferences ?? [], shipReferenceRecords),
            hero: heroRecords.length > 0 ? heroRecords : (existingManifest?.images.hero ?? []),
            sceneImages: mergeAssetRecords(existingManifest?.images.sceneImages ?? [], sceneImageRecords),
            aestheticConcepts: conceptRecords.length > 0 ? conceptRecords : (existingManifest?.images.aestheticConcepts ?? []),
            documentaryDetails: mergeAssetRecords(existingManifest?.images.documentaryDetails ?? [], documentaryDetailRecords),
            designedAdArtifacts: mergeAssetRecords(existingManifest?.images.designedAdArtifacts ?? [], designedAdRecords),
            platformCrops: (Object.keys(cropsByFormat).length > 0
                ? cropsByFormat
                : (existingManifest?.images.platformCrops ?? {})) as Record<ImageFormat, AssetRecord[]>,
        };

        const mergedVideos = {
            tiktokSeed: videoRecords.tiktokSeed ?? existingManifest?.videos.tiktokSeed ?? null,
            heroExplainer: videoRecords.heroExplainer ?? existingManifest?.videos.heroExplainer ?? null,
            thresholdAnnouncement: videoRecords.thresholdAnnouncement ?? existingManifest?.videos.thresholdAnnouncement ?? null,
            countdown: videoRecords.countdown.length > 0 ? videoRecords.countdown : (existingManifest?.videos.countdown ?? []),
            broll: videoRecords.broll.length > 0 ? videoRecords.broll : (existingManifest?.videos.broll ?? []),
        };

        const mergedAudio = {
            ambientNarration: audioRecords.ambientNarration ?? existingManifest?.audio.ambientNarration ?? null,
            hypeClip: audioRecords.hypeClip ?? existingManifest?.audio.hypeClip ?? null,
            themeMusic: audioRecords.themeMusic ?? existingManifest?.audio.themeMusic ?? null,
        };

        const mergedMerch = {
            designs: merchRecords.length > 0 ? merchRecords : (existingManifest?.merch.designs ?? []),
            mockups: existingManifest?.merch.mockups ?? [],
            printfulProductIds: existingManifest?.merch.printfulProductIds ?? [],
        };

        const mergedCopy = hasCopy && copyCaptions
            ? {
                carouselSlides: copyCarouselSlides,
                adVariants: copyAdVariants,
                captions: copyCaptions,
                emailSubjectLines: copyEmailSubjectLines,
            }
            : (existingManifest?.copy ?? null);

        const allRecords = [
            ...mergedImages.shipReferences,
            ...mergedImages.hero,
            ...mergedImages.sceneImages,
            ...mergedImages.aestheticConcepts,
            ...mergedImages.documentaryDetails,
            ...mergedImages.designedAdArtifacts,
            ...Object.values(mergedImages.platformCrops).flat(),
            ...(mergedVideos.tiktokSeed ? [mergedVideos.tiktokSeed] : []),
            ...(mergedVideos.heroExplainer ? [mergedVideos.heroExplainer] : []),
            ...(mergedVideos.thresholdAnnouncement ? [mergedVideos.thresholdAnnouncement] : []),
            ...mergedVideos.countdown,
            ...mergedVideos.broll,
            ...(mergedAudio.ambientNarration ? [mergedAudio.ambientNarration] : []),
            ...(mergedAudio.hypeClip ? [mergedAudio.hypeClip] : []),
            ...(mergedAudio.themeMusic ? [mergedAudio.themeMusic] : []),
            ...mergedMerch.designs,
            ...mergedMerch.mockups,
        ];

        const manifest: CampaignMediaManifest = {
            slug,
            generatedAt: new Date().toISOString(),
            totalAssets: allRecords.length,
            completionStatus: errors.length > 0 ? 'partial' : 'complete',
            images: mergedImages,
            videos: mergedVideos,
            audio: mergedAudio,
            merch: mergedMerch,
            copy: mergedCopy,
        };

        await saveMediaManifest(manifest);

        let manifestUrl = getAssetUrl(slug, 'manifests/media_manifest.json');
        try {
            const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));
            const storedUrl = await storeAsset(
                slug,
                'manifest_json',
                'manifests/media_manifest.json',
                manifestBuffer,
                'application/json'
            );
            if (!storedUrl.startsWith('r2://pending')) {
                manifestUrl = storedUrl;
            }
        } catch (manifestStoreErr: unknown) {
            errors.push(`[manifest/storage] ${manifestStoreErr instanceof Error ? manifestStoreErr.message : String(manifestStoreErr)}`);
        }

        const finalStatus = errors.length > 0 ? 'partial' as const : 'ready' as const;
        await updateCampaignMediaStatus(slug, finalStatus, manifestUrl);

        return {
            slug,
            manifest,
            jobSummary: {
                total: allRecords.length + errors.length,
                completed: allRecords.length,
                failed: errors.length,
                errors,
                warnings,
            },
        };
    } finally {
        activeGenerations.delete(slug);
    }
}

/**
 * Check if a campaign has media generation in progress.
 */
export function isGenerating(slug: string): boolean {
    return activeGenerations.has(slug);
}
