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
