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
    VideoBriefSchema
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

    // Assemble final brief
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
