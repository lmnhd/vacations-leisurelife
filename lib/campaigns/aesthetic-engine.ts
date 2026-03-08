import { generateObject } from 'ai';
import { VIDEO_DELIVERABLE_SPECS } from './media/video-deliverable-specs';
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

Visual Priority Rules:
- For visual identity fields, prioritize durable cruise/travel truths that would still feel correct even if no niche activity is happening in frame.
- Hero-safe imagery should read first as travel/cruising at sea, second as niche identity.
- Highlight events and targeting keywords are flavor cues, not mandatory literal scene directions.
- Niche cues should usually be subtle: wardrobe hints, one prop, one gesture, one environmental clue.
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

CRITICAL VISUAL RULES:
- Do not overfit the visual identity to speculative activities that may not happen in most hero images.
- visual.imageryMood, visual.lightingStyle, and visual.compositionNotes must describe an enduring travel atmosphere, not a busy scene treatment.
- The best hero direction is cruise-first, ocean-first, ship-first, with niche identity expressed through subtle believable cues.
- Avoid writing visual guidance that requires groups, workshops, signage, whiteboards, crowded tables, or multi-step activities.
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

const VIDEO_DELIVERABLES = VIDEO_DELIVERABLE_SPECS;

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
Your ONE job: make someone watching this campaign stop scrolling and think "I NEED to be on that ship."

You are building a Production Bible — a scene library and storyboard package for a niche cruise campaign.

## THE VACATION REFRAME RULE (MOST IMPORTANT)
No matter what the campaign theme is — science, photography, wellness, cooking, history — you MUST reframe every activity as a VACATION EXPERIENCE.
The viewer is NOT signing up for work, a class, or a job. They are signing up for the most magical vacation of their life.
If the theme is "citizen science," the scenes show people HAVING FUN while casually doing something science-adjacent — NOT conducting research.
If the theme is "photography," the scenes show people capturing breathtaking moments — NOT attending a workshop.
Every single scene must pass this test: "Would I post this on Instagram to make my friends jealous?" If no, rewrite it.

## EMOTIONAL TARGETS
Every scene must evoke ONE of these feelings: wonder, FOMO, joy, serenity, intimacy, awe, belonging, thrill, magic, freedom.
NO scene should evoke: obligation, seriousness, focus, concentration, rigor, professionalism, or productivity.

## WHAT YOU PRODUCE
1. A SCENE LIBRARY of 10 distinct scenes — each a different emotional moment that makes the viewer want to BE THERE
2. STORYBOARDS for each video deliverable — ordered shot sequences that build desire

## SCENE RULES
- mood field: name the VACATION emotion (e.g. "sunset wonder", "playful discovery", "golden hour magic"), never a work emotion (e.g. "focused", "rigorous", "purposeful")
- subjectAction: describe what the person is EXPERIENCING, not what they are DOING. First-person aspiration format.
  GOOD: "laughing as a dolphin surfaces arm's length away", "eyes wide discovering something incredible through a microscope", "barefoot on teak, wind in hair, pointing at the horizon"
  BAD: "participant adjusts microscope focus", "marine biologist deploys plankton net", "lead scientist underlines transect plan"
- Scenes on deck: the OCEAN is a character — vast, turquoise, cinematic. People are IN the moment, not just near it.
- Interior scenes: must feel like a boutique hotel AT SEA — warm lighting, portholes with ocean visible, polished wood, elegant curves. NEVER a conference room, classroom, or generic office.
- Body language: laughing, arms outstretched, leaning over railings in wonder, toasting, hugging, pointing excitedly. NEVER: hunched over work, writing on clipboards, staring at screens, standing in formal rows.
- Camera angles vary: wide establishing, low-angle hero, overhead crane, eye-level tracking, intimate close-up, dutch angle, POV.
- referenceCategory must be one of: ${SHIP_REFERENCE_CATEGORIES.join(', ')}. Spread scenes across at least 6 different categories.

## IMAGE PROMPT RULES
- Each imagePrompt is the SINGLE MOST IMPORTANT field. It drives the generated image directly.
- Write it as a dreamy, evocative scene description — like the opening line of a luxury travel magazine feature.
- Start with the FEELING and LIGHT, then the setting, then the people:
  GOOD: "Warm golden light spills across a polished teak deck as two friends lean over the rail, laughing at dolphins racing the bow wake, turquoise Caribbean sea stretching to the horizon"
  BAD: "Two participants on the forward deck conduct a marine mammal census using binoculars and tally sheets"
- ALWAYS include: specific lighting quality, emotional energy, the ocean or ship as backdrop, human connection or joy.
- Style suffix to include in every prompt: "dreamy luxury travel editorial, aspirational, warm cinematic color grade, f/1.8 bokeh, golden hour warmth"
- BANNED WORDS in imagePrompt: "participant", "conduct", "deploy", "adjust", "conference", "training", "corporate", "business", "focus", "analyze", "study", "examine", "monitor", "record", "clipboard", "whiteboard", "presentation", "organized", "structured".
- REQUIRED ENERGY: every imagePrompt must feel like a daydream — something you'd see and immediately want to book the trip.

## STORYBOARD RULES
- Each storyboard must follow an emotional arc: intrigue/hook → building desire → peak euphoria → "this could be you" CTA.
- No two CONSECUTIVE shots may use the same sceneId.
- Camera movements vary per shot: dolly forward, dolly back, crane rise, crane drop, orbit left, orbit right, steadicam tracking, push-in, pull-out, handheld follow, whip pan, slow arc.
- transitionIn/transitionOut use film terminology: hard cut, cross-dissolve, whip pan, match cut, fade from black, fade to black, J-cut, L-cut.
- narrationSegment must sound like a luxury travel documentary voiceover — warm, personal, aspirational, making the viewer ache to be there.
- musicCue describes the audio energy: "silence into bass hit", "building synth swell", "full drop", "ambient bed", "fade out".
- avoidDirectives must include: "No slideshow parallax", "No static tripod framing", "No repeated camera movement across consecutive shots", "No empty/unpopulated scenes", "No corporate body language", "No generic interiors without ship identity", "No formal or staged poses", "No work-like activities".
`.trim();

    const contextPrompt = `
CAMPAIGN CONTEXT (use as inspiration, but ALWAYS reframe through the vacation lens):
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

REMINDER: The above describes the campaign THEME. Your job is to turn that theme into VACATION DAYDREAM imagery — artsy, warm, joyful, never formal or serious.
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
