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
    'ship_reference_image', 'hero_image', 'aesthetic_concept', 'platform_crop',
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

    images: z.object({
        shipReferences: z.array(AssetRecordSchema),
        hero: z.array(AssetRecordSchema),
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
