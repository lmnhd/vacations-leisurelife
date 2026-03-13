import { z } from "zod";

export const CarouselSlideSchema = z.object({
    slideNumber: z.number(),
    headline: z.string(),
    bodyText: z.string(),
    visualDescription: z.string(),
});

export const VideoBriefSchema = z.object({
    title: z.string(),
    durationSeconds: z.number(),
    tool: z.enum(['heygen', 'runwayml', 'kling', 'composite']),
    scriptOrNarration: z.string(),
    visualDirectionNotes: z.string(),
    avatarRequired: z.boolean(),
    backgroundDescription: z.string(),
    musicMood: z.string(),
});

export const MerchItemBriefSchema = z.object({
    productType: z.string(),
    designDescription: z.string(),
    colorway: z.string(),
    dallePrompt: z.string(),
    printfulProductId: z.string(), // Required by OpenAI structured output; AI returns "" when not yet assigned
});

export const TikTokConceptSetSchema = z.object({
    hook: z.string(),
    narrative: VideoBriefSchema,
    caption: z.string(),
    hashtags: z.array(z.string()),
    callToAction: z.string(),
});

export const ReelConceptSetSchema = z.object({
    visualConcept: z.string(),
    audioTrackType: z.string(),
    caption: z.string(),
    hashtags: z.array(z.string()),
});

export const FeedConceptSetSchema = z.object({
    carouselSlides: z.array(CarouselSlideSchema),
    singlePostConcept: z.string(),
    caption: z.string(),
});

export const AdConceptSetSchema = z.object({
    headline: z.string(),
    primaryText: z.string(),
    description: z.string(),
    cta: z.string(),
    visualDescription: z.string(),
});

export const YouTubeConceptSetSchema = z.object({
    title: z.string(),
    visualConcept: z.string(),
    description: z.string(),
    hashtags: z.array(z.string()),
});

export const PinterestConceptSetSchema = z.object({
    pinTitle: z.string(),
    pinDescription: z.string(),
    visualConcept: z.string(),
});

export const EmailConceptSetSchema = z.object({
    subjectLine: z.string(),
    preheader: z.string(),
    bodyDirection: z.string(),
    visualDirection: z.string(),
});

export const DiscordConceptSetSchema = z.object({
    serverBannerDescription: z.string(),
    welcomeMessageDirection: z.string(),
});

export const DEFAULT_VISUAL_PLAUSIBILITY_FRAMEWORK = {
    governingPrinciple: 'Depict the campaign theme as a believable modulation of ordinary cruise life, not as a staged demonstration of the niche itself.',
    cruiseNativeMoments: [],
    nicheEnhancedMoments: [],
    implausibleLiteralizations: [],
    allowedProps: [],
    discouragedProps: [],
} satisfies {
    governingPrinciple: string;
    cruiseNativeMoments: string[];
    nicheEnhancedMoments: string[];
    implausibleLiteralizations: string[];
    allowedProps: string[];
    discouragedProps: string[];
};

export const VisualPlausibilityFrameworkSchema = z.object({
    governingPrinciple: z.string(),
    cruiseNativeMoments: z.array(z.string()),
    nicheEnhancedMoments: z.array(z.string()),
    implausibleLiteralizations: z.array(z.string()),
    allowedProps: z.array(z.string()),
    discouragedProps: z.array(z.string()),
});
export type VisualPlausibilityFramework = z.infer<typeof VisualPlausibilityFrameworkSchema>;

export function normalizeVisualPlausibilityFramework(
    input?: Partial<VisualPlausibilityFramework> | null,
): VisualPlausibilityFramework {
    return {
        governingPrinciple: input?.governingPrinciple?.trim() || DEFAULT_VISUAL_PLAUSIBILITY_FRAMEWORK.governingPrinciple,
        cruiseNativeMoments: input?.cruiseNativeMoments ?? DEFAULT_VISUAL_PLAUSIBILITY_FRAMEWORK.cruiseNativeMoments,
        nicheEnhancedMoments: input?.nicheEnhancedMoments ?? DEFAULT_VISUAL_PLAUSIBILITY_FRAMEWORK.nicheEnhancedMoments,
        implausibleLiteralizations: input?.implausibleLiteralizations ?? DEFAULT_VISUAL_PLAUSIBILITY_FRAMEWORK.implausibleLiteralizations,
        allowedProps: input?.allowedProps ?? DEFAULT_VISUAL_PLAUSIBILITY_FRAMEWORK.allowedProps,
        discouragedProps: input?.discouragedProps ?? DEFAULT_VISUAL_PLAUSIBILITY_FRAMEWORK.discouragedProps,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 1B: Production Bible — Scene Library + Storyboard Architecture
// ────────────────────────────────────────────────────────────────────────────

export const SceneSpecSchema = z.object({
    sceneId: z.string(),
    location: z.string(),
    timeOfDay: z.string(),
    lighting: z.string(),
    cameraAngle: z.string(),
    subjectAction: z.string(),
    environmentDetails: z.string(),
    mood: z.string(),
    imagePrompt: z.string(),
    referenceCategory: z.string(),
});
export type SceneSpec = z.infer<typeof SceneSpecSchema>;

export const ShotSpecSchema = z.object({
    shotNumber: z.number(),
    sceneId: z.string(),
    durationSeconds: z.number(),
    cameraMovement: z.string(),
    subjectMotion: z.string(),
    environmentMotion: z.string(),
    transitionIn: z.string(),
    transitionOut: z.string(),
    emotionalBeat: z.string(),
    narrationSegment: z.string(),
    musicCue: z.string(),
});
export type ShotSpec = z.infer<typeof ShotSpecSchema>;

export const StoryboardSchema = z.object({
    deliverableId: z.string(),
    title: z.string(),
    totalDurationSeconds: z.number(),
    shotSequence: z.array(ShotSpecSchema),
    narrationScript: z.string(),
    musicDirection: z.string(),
    editingStyle: z.string(),
});
export type Storyboard = z.infer<typeof StoryboardSchema>;

export const ProductionBibleSchema = z.object({
    sceneLibrary: z.array(SceneSpecSchema),
    storyboards: z.array(StoryboardSchema),
    globalDirectionNotes: z.string(),
    avoidDirectives: z.array(z.string()),
});
export type ProductionBible = z.infer<typeof ProductionBibleSchema>;

export const LandingStillUsageEnum = z.enum([
    'hero_primary',
    'hero_alt',
    'concept',
    'email_header',
    'social_square',
]);
export type LandingStillUsage = z.infer<typeof LandingStillUsageEnum>;

export const LandingStillSpecSchema = z.object({
    stillId: z.string(),
    usage: LandingStillUsageEnum,
    location: z.string(),
    timeOfDay: z.string(),
    lighting: z.string(),
    composition: z.string(),
    subjectAction: z.string(),
    environmentDetails: z.string(),
    mood: z.string(),
    imagePrompt: z.string(),
    referenceCategory: z.string(),
});
export type LandingStillSpec = z.infer<typeof LandingStillSpecSchema>;

export const LandingStillBibleSchema = z.object({
    stillLibrary: z.array(LandingStillSpecSchema),
    globalDirectionNotes: z.string(),
    avoidDirectives: z.array(z.string()),
});
export type LandingStillBible = z.infer<typeof LandingStillBibleSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Phase 1A + 1B Combined: Campaign Aesthetic Brief
// ────────────────────────────────────────────────────────────────────────────

export const CampaignAestheticBriefSchema = z.object({
    slug: z.string(),
    themeName: z.string(),

    visual: z.object({
        aestheticLabel: z.string(),
        colorPalette: z.object({
            primary: z.string(),
            secondary: z.string(),
            accent: z.string(),
            background: z.string(),
            textOnDark: z.string(),
            textOnLight: z.string(),
        }),
        typographyDirection: z.object({
            headlineStyle: z.string(),
            bodyStyle: z.string(),
            suggestedFonts: z.array(z.string()),
        }),
        imageryMood: z.string(),
        lightingStyle: z.string(),
        compositionNotes: z.string(),
        avoidList: z.array(z.string()),
        referenceMoodboard: z.array(z.string()),
        plausibilityFramework: VisualPlausibilityFrameworkSchema,
    }),

    messaging: z.object({
        heroSlogan: z.string(),
        subSlogan: z.string(),
        ctaVariants: z.object({
            waitlist: z.string(),
            bookNow: z.string(),
            merch: z.string(),
            share: z.string(),
        }),
        elevatorPitch: z.string(),
        toneKeywords: z.array(z.string()),
        voicePersona: z.string(),
    }),

    socialConcepts: z.object({
        tiktokOrganic: TikTokConceptSetSchema,
        instagramReels: ReelConceptSetSchema,
        instagramFeed: FeedConceptSetSchema,
        facebookAd: AdConceptSetSchema,
        youtubeShort: YouTubeConceptSetSchema,
        pinterest: PinterestConceptSetSchema,
        emailHeader: EmailConceptSetSchema,
        discordBanner: DiscordConceptSetSchema,
    }),

    videoConcepts: z.object({
        heroExplainer: VideoBriefSchema,
        tiktokSeed: VideoBriefSchema,
        thresholdAnnouncement: VideoBriefSchema,
        merchReveal: VideoBriefSchema,
        countdownSeries: z.array(VideoBriefSchema),
    }),

    merch: z.object({
        conceptStatement: z.string(),
        coreItem: MerchItemBriefSchema,
        practicalItem: MerchItemBriefSchema,
        nicheSpecificItems: z.array(MerchItemBriefSchema),
        logoConceptDescription: z.string(),
        tagline: z.string(),
        printStyle: z.string(),
    }),

    audio: z.object({
        ambientNarrationScript: z.string(),
        hypeClipScript: z.string(),
        voiceProfile: z.string(),
        musicMood: z.string(),
    }),

    productionBible: ProductionBibleSchema.optional(),
    landingStillBible: LandingStillBibleSchema.optional(),

    generatedAt: z.string(),
    generatedBy: z.enum(['agent', 'ui-session']),
    humanReviewStatus: z.enum(['pending', 'approved', 'revised']),
    revisionNotes: z.string().optional(),
});

export type CarouselSlide = z.infer<typeof CarouselSlideSchema>;
export type VideoBrief = z.infer<typeof VideoBriefSchema>;
export type MerchItemBrief = z.infer<typeof MerchItemBriefSchema>;
export type TikTokConceptSet = z.infer<typeof TikTokConceptSetSchema>;
export type ReelConceptSet = z.infer<typeof ReelConceptSetSchema>;
export type FeedConceptSet = z.infer<typeof FeedConceptSetSchema>;
export type AdConceptSet = z.infer<typeof AdConceptSetSchema>;
export type YouTubeConceptSet = z.infer<typeof YouTubeConceptSetSchema>;
export type PinterestConceptSet = z.infer<typeof PinterestConceptSetSchema>;
export type EmailConceptSet = z.infer<typeof EmailConceptSetSchema>;
export type DiscordConceptSet = z.infer<typeof DiscordConceptSetSchema>;
export type CampaignAestheticBrief = z.infer<typeof CampaignAestheticBriefSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Phase 2B: Media Generation Pipeline — Types
// ────────────────────────────────────────────────────────────────────────────

export const AssetTypeEnum = z.enum([
    'ship_reference_image', 'hero_image', 'aesthetic_concept', 'scene_image', 'platform_crop',
    'tiktok_seed_video', 'hero_explainer_video', 'threshold_video',
    'countdown_video', 'broll_clip',
    'ambient_narration', 'hype_clip', 'theme_music',
    'merch_design', 'email_header', 'ad_creative',
    'carousel_slide', 'copy_batch',
]);
export type AssetType = z.infer<typeof AssetTypeEnum>;

export const GeneratorServiceEnum = z.enum([
    // Image generators
    'midjourney', 'stability_ai', 'dalle3', 'serpapi',
    // Video generators
    'heygen', 'runwayml', 'kling',
    // Audio generators
    'elevenlabs', 'openai_tts', 'replicate', 'udio', 'default_library',
    // Image processing
    'sharp',
    // OpenAI LLM
    'gpt4o',
    // Anthropic LLM
    'claude4_opus', 'claude4_sonnet',
    // Google LLM
    'gemini3_pro', 'gemini3_flash', 'gemini3_flash_lite',
    // Meta / Groq
    'llama4',
]);
export type GeneratorService = z.infer<typeof GeneratorServiceEnum>;

export const ImageFormatEnum = z.enum([
    'hero_16x9', 'hero_4x5', 'story_9x16', 'square_1x1',
    'banner_3x1', 'email_header', 'og_image', 'thumbnail',
]);
export type ImageFormat = z.infer<typeof ImageFormatEnum>;

export const ReviewStatusEnum = z.enum([
    'auto_approved', 'human_approved', 'needs_review',
]);
export type ReviewStatus = z.infer<typeof ReviewStatusEnum>;

export const ImageContextEnum = z.enum([
    'landing_hero_primary',
    'landing_hero_alt',
    'waitlist_page_hero',
    'email_header',
    'meta_ad_creative',
    'instagram_cover',
    'storyboard_fallback',
    'explainer_backplate',
    'general_moodboard',
]);
export type ImageContext = z.infer<typeof ImageContextEnum>;
export const IMAGE_CONTEXT_VALUES = ImageContextEnum.options;

export const AssetApprovalStateEnum = z.enum([
    'pending_review',
    'auto_approved',
    'human_approved',
    'rejected',
    'revision_required',
    'hold',
]);
export type AssetApprovalState = z.infer<typeof AssetApprovalStateEnum>;

export const AssetCurationSchema = z.object({
    approvalState: AssetApprovalStateEnum.default('pending_review'),
    globalPriority: z.number().int().min(0).max(100).default(50),
    contextPriorities: z.record(z.string(), z.number().int().min(0).max(100)).default({}),
    approvedContexts: z.array(ImageContextEnum).default([]),
    blockedContexts: z.array(ImageContextEnum).default([]),
    suitabilityTags: z.array(z.string()).default([]),
    antiTags: z.array(z.string()).default([]),
    downstreamLocked: z.boolean().default(false),
    curatorNotes: z.string().optional(),
    updatedAt: z.string(),
});
export type AssetCuration = z.infer<typeof AssetCurationSchema>;

export const ImageSelectionModeEnum = z.enum([
    'approved_only',
    'approved_if_any_else_fallback',
    'priority_only',
]);
export type ImageSelectionMode = z.infer<typeof ImageSelectionModeEnum>;

export const MediaGovernancePolicySchema = z.object({
    imageSelectionMode: ImageSelectionModeEnum.default('approved_if_any_else_fallback'),
    revisionRequiredBlocksUsage: z.boolean().default(true),
    rejectedBlocksUsage: z.boolean().default(true),
    holdBlocksUsage: z.boolean().default(true),
    pendingReviewBlocksWhenLocked: z.boolean().default(true),
});
export type MediaGovernancePolicy = z.infer<typeof MediaGovernancePolicySchema>;

export const ContextSelectionEntrySchema = z.object({
    assetIds: z.array(z.string()),
    resolvedAt: z.string(),
    strategy: z.string(),
});
export type ContextSelectionEntry = z.infer<typeof ContextSelectionEntrySchema>;

export const AssetRecordSchema = z.object({
    assetId: z.string(),
    assetType: AssetTypeEnum,
    url: z.string(),
    generator: GeneratorServiceEnum,
    promptUsed: z.string(),
    sourcePageUrl: z.string().optional(),
    sourceThumbnailUrl: z.string().optional(),
    sourceQuery: z.string().optional(),
    selectionScore: z.number().optional(),
    dimensions: z.object({ width: z.number(), height: z.number() }).optional(),
    durationSeconds: z.number().optional(),
    fileSizeBytes: z.number(),
    mimeType: z.string(),
    tags: z.array(z.string()),
    createdAt: z.string(),
    reviewStatus: ReviewStatusEnum,
    reviewNotes: z.string().optional(),
    reviewedAt: z.string().optional(),
    version: z.number().default(1),
    active: z.boolean().default(true),
    curation: AssetCurationSchema.optional(),
});
export type AssetRecord = z.infer<typeof AssetRecordSchema>;

export const ShipReferenceCandidateSchema = z.object({
    title: z.string(),
    imageUrl: z.string(),
    thumbnailUrl: z.string(),
    contextUrl: z.string(),
    width: z.number(),
    height: z.number(),
    category: z.string(),
    query: z.string(),
    selectionScore: z.number(),
});
export type ShipReferenceCandidate = z.infer<typeof ShipReferenceCandidateSchema>;

export const MediaJobStatusEnum = z.enum([
    'queued', 'in_progress', 'complete', 'failed', 'needs_review',
]);

export const MediaGenerationJobSchema = z.object({
    jobId: z.string(),
    campaignSlug: z.string(),
    assetType: AssetTypeEnum,
    status: MediaJobStatusEnum,
    generator: GeneratorServiceEnum,
    promptUsed: z.string(),
    outputUrl: z.string().optional(),
    outputMetadata: z.record(z.string(), z.unknown()).optional(),
    retryCount: z.number().default(0),
    createdAt: z.string(),
    completedAt: z.string().optional(),
    error: z.string().optional(),
});
export type MediaGenerationJob = z.infer<typeof MediaGenerationJobSchema>;

export const AdCopySetSchema = z.object({
    headline: z.string(),
    primaryText: z.string(),
    description: z.string(),
    cta: z.string(),
    variant: z.enum(['A', 'B', 'C']),
});
export type AdCopySet = z.infer<typeof AdCopySetSchema>;

export const EmailSubjectSetSchema = z.object({
    stage: z.string(),
    variants: z.array(z.string()),
});
export type EmailSubjectSet = z.infer<typeof EmailSubjectSetSchema>;

export const PlatformCaptionsSchema = z.object({
    tiktok: z.array(z.object({ caption: z.string(), hashtags: z.array(z.string()) })),
    pinterest: z.array(z.object({ title: z.string(), description: z.string() })),
    discord: z.string(),
});
export type PlatformCaptions = z.infer<typeof PlatformCaptionsSchema>;

export const CampaignMediaManifestSchema = z.object({
    slug: z.string(),
    generatedAt: z.string(),
    totalAssets: z.number(),
    completionStatus: z.enum(['partial', 'complete']),
    governance: MediaGovernancePolicySchema.optional(),
    selections: z.object({
        images: z.record(z.string(), ContextSelectionEntrySchema).default({}),
    }).optional(),

    images: z.object({
        shipReferences: z.array(AssetRecordSchema),
        hero: z.array(AssetRecordSchema),
        sceneImages: z.array(AssetRecordSchema),
        aestheticConcepts: z.array(AssetRecordSchema),
        platformCrops: z.record(ImageFormatEnum, z.array(AssetRecordSchema)),
    }),

    videos: z.object({
        tiktokSeed: AssetRecordSchema.nullable(),
        heroExplainer: AssetRecordSchema.nullable(),
        thresholdAnnouncement: AssetRecordSchema.nullable(),
        countdown: z.array(AssetRecordSchema),
        broll: z.array(AssetRecordSchema),
    }),

    audio: z.object({
        ambientNarration: AssetRecordSchema.nullable(),
        hypeClip: AssetRecordSchema.nullable(),
        themeMusic: AssetRecordSchema.nullable(),
    }),

    merch: z.object({
        designs: z.array(AssetRecordSchema),
        mockups: z.array(AssetRecordSchema),
        printfulProductIds: z.array(z.string()),
    }),

    copy: z.object({
        carouselSlides: z.array(z.string()),
        adVariants: z.array(AdCopySetSchema),
        captions: PlatformCaptionsSchema,
        emailSubjectLines: z.array(EmailSubjectSetSchema),
    }).nullable(),
});
export type CampaignMediaManifest = z.infer<typeof CampaignMediaManifestSchema>;

export const DistributionPlatformEnum = z.enum([
    'tiktok',
    'instagram_feed',
    'instagram_reels',
    'instagram_story',
    'facebook_ad',
    'youtube',
    'pinterest',
    'discord',
    'sms',
    'email',
]);
export type DistributionPlatform = z.infer<typeof DistributionPlatformEnum>;

export const DistributionPostStatusEnum = z.enum([
    'scheduled',
    'posted',
    'cancelled',
    'failed',
    'skipped',
]);
export type DistributionPostStatus = z.infer<typeof DistributionPostStatusEnum>;

export const DistributionTriggerTokenEnum = z.enum([
    'ON_THRESHOLD',
    'ON_MANIFEST_SUBMIT',
    'ON_EXPIRY',
]);
export type DistributionTriggerToken = z.infer<typeof DistributionTriggerTokenEnum>;

export const DistributionCallerEnum = z.enum([
    'agent',
    'human',
    'system',
]);
export type DistributionCaller = z.infer<typeof DistributionCallerEnum>;

export const ScheduledPostSchema = z.object({
    postId: z.string(),
    platform: DistributionPlatformEnum,
    assetId: z.string(),
    copyVariant: z.string(),
    scheduledAt: z.union([z.string(), DistributionTriggerTokenEnum]),
    campaignStage: z.string(),
    status: DistributionPostStatusEnum,
    externalPostId: z.string().optional(),
    notes: z.array(z.string()).default([]),
});
export type ScheduledPost = z.infer<typeof ScheduledPostSchema>;

export const DistributionScheduleSchema = z.object({
    campaignSlug: z.string(),
    timezone: z.string(),
    generatedAt: z.string(),
    generatedBy: DistributionCallerEnum,
    version: z.number().int().min(1),
    posts: z.array(ScheduledPostSchema),
});
export type DistributionSchedule = z.infer<typeof DistributionScheduleSchema>;

export const DistributionExecutionRecordSchema = z.object({
    executionId: z.string(),
    campaignSlug: z.string(),
    caller: DistributionCallerEnum,
    mode: z.enum(['plan', 'dispatch']),
    requestedPlatforms: z.array(DistributionPlatformEnum),
    requestedStages: z.array(z.string()),
    dryRun: z.boolean(),
    status: z.enum(['planned', 'completed', 'failed']),
    createdAt: z.string(),
    completedAt: z.string().optional(),
    error: z.string().optional(),
    summary: z.object({
        plannedPosts: z.number().int().min(0),
        persistedPosts: z.number().int().min(0),
        dispatchedPosts: z.number().int().min(0),
        skippedPosts: z.number().int().min(0),
    }),
});
export type DistributionExecutionRecord = z.infer<typeof DistributionExecutionRecordSchema>;
