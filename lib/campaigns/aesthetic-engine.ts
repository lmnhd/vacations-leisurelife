import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { Campaign } from './types';
import { ModelName, getModelConfig, modelForTask } from '@/lib/ai/llm-gateway';
import {
    CampaignAestheticBrief,
    CampaignAestheticBriefSchema,
    TikTokConceptSetSchema,
    ReelConceptSetSchema,
    FeedConceptSetSchema,
    AdConceptSetSchema,
    YouTubeConceptSetSchema,
    PinterestConceptSetSchema,
    EmailConceptSetSchema,
    DiscordConceptSetSchema,
    VideoBriefSchema,
    ProductionBibleSchema,
    ProductionBible,
} from './schema';

function buildTShirtMerchPrompt(themeName: string, conceptStatement: string, tagline: string, printStyle: string, designDescription: string, colorway: string): string {
    return [
        `Create a print-ready t-shirt graphic concept for the cruise theme "${themeName}"`,
        `Cute slogan shirt concept with cruise humor or theme-specific charm`,
        `Primary slogan/tagline: ${tagline}`,
        `Concept direction: ${conceptStatement}`,
        `Design direction: ${designDescription}`,
        `Print style: ${printStyle}`,
        `Colorway: ${colorway}`,
        'Output a feasible apparel graphic for a real printable t-shirt front design',
        'Use flat graphic composition, clean edges, limited print-friendly colors, and screen-print-friendly styling',
        'Do not depict bags, leather goods, impossible accessories, product mockups, or non-apparel objects as the primary concept',
    ].join('. ');
}

function normalizeMerchItem(themeName: string, conceptStatement: string, tagline: string, printStyle: string, item: z.infer<typeof Pass1Schema>['merch']['coreItem']): z.infer<typeof Pass1Schema>['merch']['coreItem'] {
    const normalizedColorway = item.colorway.trim() || 'soft pastel cruise colors';
    const normalizedDesignDescription = item.designDescription.trim() || `${tagline} cute cruise slogan graphic`;
    return {
        ...item,
        productType: 'T-Shirt',
        designDescription: normalizedDesignDescription,
        colorway: normalizedColorway,
        dallePrompt: buildTShirtMerchPrompt(themeName, conceptStatement, tagline, printStyle, normalizedDesignDescription, normalizedColorway),
    };
}

function normalizeMerchBrief(themeName: string, merch: z.infer<typeof Pass1Schema>['merch']): z.infer<typeof Pass1Schema>['merch'] {
    const normalizedTagline = merch.tagline.trim() || merch.conceptStatement.trim() || `${themeName} cruise club`;
    const normalizedPrintStyle = merch.printStyle.trim() || 'cute retro cruise slogan tee';
    const normalizedConceptStatement = merch.conceptStatement.trim() || `Cute t-shirt merch for ${themeName} cruise guests`; 
    return {
        ...merch,
        conceptStatement: normalizedConceptStatement,
        tagline: normalizedTagline,
        printStyle: normalizedPrintStyle,
        coreItem: normalizeMerchItem(themeName, normalizedConceptStatement, normalizedTagline, normalizedPrintStyle, merch.coreItem),
        practicalItem: normalizeMerchItem(themeName, normalizedConceptStatement, normalizedTagline, normalizedPrintStyle, merch.practicalItem),
        nicheSpecificItems: merch.nicheSpecificItems.map((item) => normalizeMerchItem(themeName, normalizedConceptStatement, normalizedTagline, normalizedPrintStyle, item)),
    };
}

// Helper Schema for Pass 1 (Excludes heavy platform concepts)
const Pass1Schema = CampaignAestheticBriefSchema.omit({
    socialConcepts: true,
    videoConcepts: true,
    productionBible: true,
    generatedAt: true,
    generatedBy: true,
    humanReviewStatus: true,
    revisionNotes: true,
    slug: true,
    themeName: true
});

// Helper Schema for Pass 2 (Only heavy platform concepts)
const Pass2Schema = z.object({
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
    })
});

function checkSloganQuality(heroSlogan: string, subSlogan: string): string[] {
    const failures: string[] = [];
    const lowerSlogans = `${heroSlogan.toLowerCase()} ${subSlogan.toLowerCase()}`;
    const cliches = ["paradise", "perfect vacation", "dream getaway", "sail away", "unforgettable", "memories"];

    // Check 1: No cliches
    for (const cliche of cliches) {
        if (lowerSlogans.includes(cliche)) {
            failures.push(`Contains cliche: '${cliche}'`);
        }
    }

    // Check 2: Length counts
    const heroWords = heroSlogan.split(" ").filter(w => w.trim().length > 0).length;
    const subWords = subSlogan.split(" ").filter(w => w.trim().length > 0).length;

    if (heroWords > 8) failures.push(`Hero slogan too long (${heroWords} words, max 8)`);
    if (subWords > 14) failures.push(`Sub slogan too long (${subWords} words, max 14)`);

    return failures;
}

export async function generateAestheticBrief(campaign: Campaign): Promise<CampaignAestheticBrief> {
    // Resolve model through the gateway registry. Creative task → GPT_5_HIGH (OpenAI Tier-1).
    // Note: uses @ai-sdk/openai adapter for generateObject structured output.
    const aestheticModelConfig = getModelConfig(ModelName.GPT_5_HIGH);
    const model = openai(aestheticModelConfig.apiId ?? ModelName.GPT_5_HIGH);

    const brandGuidelines = `
Leisure Life Interactive Brand Guidelines:
- Brand typefaces must take precedence on the landing page.
- CTA buttons always use brand interaction colors.
- The LLL wordmark remains in its approved form on all owned-channel assets.
- Do NOT use generic cruise marketing copy ("Your Adventure Starts Here", "Sail Away").
    `.trim();

    const baseContext = `
Theme: ${campaign.name}
Aesthetic Request: ${campaign.aesthetic || 'Determine best fit'}
Target Audience/Keywords: ${(campaign.targetingKeywords || []).join(', ')}
Highlight Events: ${(campaign.highlightEvents || []).join(', ')}
Ship Target: ${campaign.shipTarget || 'TBD'}
Destination: ${campaign.targetDestination || 'TBD'}
`;

    const merchGuidelines = `
Merch Direction:
- Merch concepts must specialize in cute cruise/theme t-shirt ideas.
- The core item must be a t-shirt concept suitable for real print-on-demand production.
- Practical and niche items must also stay apparel-graphic-first and should not invent luxury accessories, leather goods, bags, or impossible physical products.
- Favor slogan-led shirt ideas with simple printable graphics, cruise humor, and theme-specific charm.
- Keep all merch prompts grounded in feasible front-of-shirt artwork, not product fantasy scenes.
    `.trim();

    const systemPromptPass1 = `
You are the Creative Director for Leisure Life Interactive, a boutique cruise campaign studio. 
Your role is to devise the core aesthetic identity (visuals, messaging, merch, audio) for a niche-targeted group cruise.
Return a partial CampaignAestheticBrief JSON object conforming to the schema.
Make it aspirational, highly specific to the niche, and avoid generic cruise industry tropes.
`.trim();

    let pass1Result: { object: z.infer<typeof Pass1Schema>, failures?: string[] } | undefined;
    let attempts = 0;
    while (attempts < 3) {
        attempts++;
        const feedbackOpt = attempts > 1 ? `\nPREVIOUS ATTEMPT FAILED QUALITY GATE:\n${pass1Result?.failures?.join('\n')}\nFIX THESE ISSUES.` : '';

        const { object } = await generateObject({
            model,
            schema: Pass1Schema,
            system: systemPromptPass1 + feedbackOpt,
            prompt: `Context:\n${baseContext}\n\nBrand Guidelines:\n${brandGuidelines}\n\n${merchGuidelines}`
        });

        const normalizedObject: z.infer<typeof Pass1Schema> = {
            ...object,
            merch: normalizeMerchBrief(campaign.name, object.merch),
        };

        const sloganFailures = checkSloganQuality(normalizedObject.messaging.heroSlogan, normalizedObject.messaging.subSlogan);
        if (sloganFailures.length < 2) {
            pass1Result = { object: normalizedObject };
            break; // Pass!
        } else {
            pass1Result = { object: normalizedObject, failures: sloganFailures };
        }
    }

    // Fallback if it failed 3 times, keep last result
    const coreAesthetic = pass1Result!.object;

    // PASS 2: Platform Extrapolations
    const systemPromptPass2 = `
You are the Creative Director for Leisure Life Interactive. 
Based on the finalized core aesthetic identity, expand this campaign into precise, platform-native social media and video concepts.
Return ONLY the socialConcepts and videoConcepts conforming to the schema.
`.trim();

    const { object: platformConcepts } = await generateObject({
        model,
        schema: Pass2Schema,
        system: systemPromptPass2,
        prompt: `Campaign Identity to apply:\n${JSON.stringify(coreAesthetic, null, 2)}`
    });

    // Assemble final brief (Production Bible generated separately via /media/aesthetic/production-bible)
    const finalBrief: CampaignAestheticBrief = {
        slug: campaign.id,
        themeName: campaign.name,
        ...coreAesthetic,
        socialConcepts: platformConcepts.socialConcepts,
        videoConcepts: platformConcepts.videoConcepts,
        generatedAt: new Date().toISOString(),
        generatedBy: 'agent',
        humanReviewStatus: 'pending' // pending by default
    };

    return finalBrief;
}

// ────────────────────────────────────────────────────────────────────────────
// Pass 3: Production Bible Generation
// Generates the Scene Library and Storyboards for multi-shot video production.
// ────────────────────────────────────────────────────────────────────────────

const SHIP_REFERENCE_CATEGORIES = [
    'exterior', 'pool_deck', 'dining', 'stateroom', 'atrium',
    'nightclub', 'spa', 'destination_port', 'theater', 'sports_deck',
] as const;

const VIDEO_DELIVERABLES = [
    { id: 'tiktok_seed', title: 'TikTok Seed Video', durationSeconds: 35, shotCount: 4 },
    { id: 'hero_explainer', title: 'Hero Explainer Video', durationSeconds: 60, shotCount: 6 },
    { id: 'threshold_announcement', title: 'Threshold Announcement', durationSeconds: 30, shotCount: 4 },
    { id: 'countdown_1', title: 'Countdown — 3 Cabins Left', durationSeconds: 15, shotCount: 3 },
] as const;

// Public entry point — called from the dedicated /media/aesthetic/production-bible route.
// Takes the already-saved brief so the route doesn't need the internal Pass types.
export async function generateProductionBibleFromBrief(
    campaign: Campaign,
    brief: CampaignAestheticBrief
): Promise<ProductionBible> {
    const aestheticModelConfig = getModelConfig(ModelName.GPT_5_HIGH);
    const model = openai(aestheticModelConfig.apiId ?? ModelName.GPT_5_HIGH);

    const coreAesthetic = {
        visual: brief.visual,
        messaging: brief.messaging,
        audio: brief.audio,
        merch: brief.merch,
    } as z.infer<typeof Pass1Schema>;

    const platformConcepts = {
        socialConcepts: brief.socialConcepts,
        videoConcepts: brief.videoConcepts,
    } as z.infer<typeof Pass2Schema>;

    return generateProductionBible(model, campaign, coreAesthetic, platformConcepts);
}

async function generateProductionBible(
    model: ReturnType<typeof openai>,
    campaign: Campaign,
    coreAesthetic: z.infer<typeof Pass1Schema>,
    platformConcepts: z.infer<typeof Pass2Schema>
): Promise<ProductionBible> {
    const { visual, messaging, audio } = coreAesthetic;
    const tiktokHook = platformConcepts.socialConcepts.tiktokOrganic.hook;
    const tiktokCTA = platformConcepts.socialConcepts.tiktokOrganic.callToAction;

    const systemPromptPass3 = `
You are the Creative Director of a luxury travel advertising agency commissioned by Leisure Life Interactive.
Your ONE job: make someone watching this campaign stop scrolling and think "I need to be on that ship."

You are building a Production Bible — a scene library and storyboard package for a niche cruise campaign.
Think Condé Nast Traveler meets National Geographic. NOT corporate training video. NOT business propaganda.
Every scene must make the viewer feel desire, wonder, or FOMO — never obligation or information overload.

The people in these scenes are the HERO. They are living their best life. They look like the viewer's aspirational self.
The ship is the SETTING that enables the experience — it should feel like a privilege to be on it, not a venue.

You will produce:
1. A SCENE LIBRARY of 10 distinct scenes — each evoking a different emotional beat (wonder, belonging, discovery, thrill, joy, intimacy, awe)
2. STORYBOARDS for each video deliverable — ordered shot sequences that build emotional momentum

SCENE RULES:
- Every scene must make the viewer FEEL something specific. Name that emotion in the mood field.
- Scenes on deck: show the OCEAN as a character — vast, beautiful, cinematic. People are in it, not just near it.
- Interior scenes: must feel exclusive and special — NOT generic conference rooms or hotel lobbies. Portholes, ship curves, ocean light through windows.
- NO corporate body language. People laugh, gasp, point at something amazing, lean over railings, share moments.
- Camera angles vary: wide establishing, low-angle hero, overhead crane, eye-level tracking, intimate close-up, dutch angle, POV.
- referenceCategory must be one of: ${SHIP_REFERENCE_CATEGORIES.join(', ')}. Spread scenes across at least 6 different categories.

IMAGE PROMPT RULES:
- Each imagePrompt must read like a brief to a world-class travel photographer shooting for Condé Nast Traveler.
- Lead with the EMOTIONAL PAYOFF first: "Golden hour euphoria on an expedition ship deck..." not "Participants conduct census..."
- Include: aspirational lighting (golden hour, soft ocean haze, warm interior pools), authentic human joy, and the ocean/ship as backdrop.
- Style references: "luxury expedition travel editorial, aspirational, warm cinematic color grade, f/1.8 bokeh, National Geographic quality"
- NEVER use words like: "participant", "conduct", "deploy", "adjust", "conference", "training", "corporate", "business".
- USE words like: "explorer", "discover", "sunlit", "breathtaking", "golden", "wonder", "adventure", "intimate", "exclusive".

STORYBOARD RULES:
- Each storyboard must follow an emotional arc: intrigue/hook → building desire → peak euphoria → "this could be you" CTA.
- No two CONSECUTIVE shots may use the same sceneId.
- Camera movements vary per shot: dolly forward, dolly back, crane rise, crane drop, orbit left, orbit right, steadicam tracking, push-in, pull-out, handheld follow, whip pan, slow arc.
- transitionIn/transitionOut use film terminology: hard cut, cross-dissolve, whip pan, match cut, fade from black, fade to black, J-cut, L-cut.
- narrationSegment must sound like a travel documentary voiceover — evocative, personal, aspirational.
- musicCue describes the audio energy: "silence into bass hit", "building synth swell", "full drop", "ambient bed", "fade out".
- avoidDirectives must include: "No slideshow parallax", "No static tripod framing", "No repeated camera movement across consecutive shots", "No empty/unpopulated scenes", "No corporate body language", "No generic interiors without ship identity".
`.trim();

    const contextPrompt = `
Campaign: ${campaign.name}
Ship: ${campaign.shipTarget || 'TBD'}
Destination: ${campaign.targetDestination || 'TBD'}
Highlight Events: ${(campaign.highlightEvents || []).join(', ')}
Aesthetic: ${visual.aestheticLabel}
Imagery Mood: ${visual.imageryMood}
Lighting: ${visual.lightingStyle}
Composition: ${visual.compositionNotes}
Color Palette: Primary ${visual.colorPalette.primary}, Secondary ${visual.colorPalette.secondary}, Accent ${visual.colorPalette.accent}
Tone: ${messaging.toneKeywords.join(', ')}
Hero Slogan: ${messaging.heroSlogan}
Elevator Pitch: ${messaging.elevatorPitch}
Music Mood: ${audio.musicMood}
TikTok Hook: ${tiktokHook}
TikTok CTA: ${tiktokCTA}

Video Deliverables to storyboard:
${VIDEO_DELIVERABLES.map(d => `- ${d.id}: "${d.title}" (${d.durationSeconds}s, ${d.shotCount} shots)`).join('\n')}
`.trim();

    const { object: bible } = await generateObject({
        model,
        schema: ProductionBibleSchema,
        system: systemPromptPass3,
        prompt: contextPrompt,
    });

    return bible;
}
