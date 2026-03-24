import { VIDEO_DELIVERABLE_SPECS } from './media/video-deliverable-specs';
import { z } from 'zod';
import { Campaign } from './types';
import { ModelName, modelForTask } from '@/lib/ai/llm-gateway';
import { callGlobalGenerateObject } from '@/lib/chat/llm-call';
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
    LandingStillBibleSchema,
    LandingStillBible,
    normalizeVisualPlausibilityFramework,
    normalizeHumanRepresentationGuidance,
} from './schema';

function buildMerchDallePrompt(productType: string, themeName: string, conceptStatement: string, tagline: string, printStyle: string, designDescription: string, colorway: string): string {
    return [
        `Create a print-ready ${productType} graphic concept for the cruise theme "${themeName}"`,
        `Cute ${productType} concept with cruise humor or theme-specific charm`,
        `Primary slogan/tagline: ${tagline}`,
        `Concept direction: ${conceptStatement}`,
        `Design direction: ${designDescription}`,
        `Print style: ${printStyle}`,
        `Colorway: ${colorway}`,
        `Output a feasible apparel graphic for a real printable ${productType} design`,
        'Use flat graphic composition, clean edges, limited print-friendly colors, and screen-print-friendly styling',
        'Do not depict bags, leather goods, impossible accessories, product mockups, or non-apparel objects as the primary concept',
    ].join('. ');
}

function normalizeMerchItem(themeName: string, conceptStatement: string, tagline: string, printStyle: string, item: z.infer<typeof Pass1Schema>['merch']['coreItem'], forceShirt: boolean = false): z.infer<typeof Pass1Schema>['merch']['coreItem'] {
    const productType = forceShirt ? 'T-Shirt' : (item.productType.trim() || 'T-Shirt');
    const normalizedColorway = item.colorway.trim() || 'soft pastel cruise colors';
    const normalizedDesignDescription = item.designDescription.trim() || `${tagline} cute cruise slogan graphic`;
    return {
        ...item,
        productType,
        designDescription: normalizedDesignDescription,
        colorway: normalizedColorway,
        dallePrompt: buildMerchDallePrompt(productType, themeName, conceptStatement, tagline, printStyle, normalizedDesignDescription, normalizedColorway),
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
        coreItem: normalizeMerchItem(themeName, normalizedConceptStatement, normalizedTagline, normalizedPrintStyle, merch.coreItem, true),
        practicalItem: normalizeMerchItem(themeName, normalizedConceptStatement, normalizedTagline, normalizedPrintStyle, merch.practicalItem, false),
        nicheSpecificItems: merch.nicheSpecificItems.map((item) => normalizeMerchItem(themeName, normalizedConceptStatement, normalizedTagline, normalizedPrintStyle, item, false)),
    };
}

// Helper Schema for Pass 1 (Excludes heavy platform concepts)
const Pass1Schema = CampaignAestheticBriefSchema.omit({
    socialConcepts: true,
    videoConcepts: true,
    productionBible: true,
    landingStillBible: true,
    productionBuildLint: true,
    productionBuildStatus: true,
    productionBuildEvaluatedAt: true,
    modificationHistory: true,
    issueLedger: true,
    activeRemediationPlan: true,
    generatedAt: true,
    generatedBy: true,
    humanReviewStatus: true,
    revisionNotes: true,
    redTeamReview: true,
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

const RefinementSchema = CampaignAestheticBriefSchema.omit({
    slug: true,
    themeName: true,
    productionBible: true,
    landingStillBible: true,
    productionBuildLint: true,
    productionBuildStatus: true,
    productionBuildEvaluatedAt: true,
    modificationHistory: true,
    issueLedger: true,
    activeRemediationPlan: true,
    generatedAt: true,
    generatedBy: true,
    humanReviewStatus: true,
    revisionNotes: true,
    redTeamReview: true,
});

function checkSloganQuality(heroSlogan: string, subSlogan: string, nicheKeywords: string[] = []): string[] {
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

    if (heroWords > 6) failures.push(`Hero slogan too long (${heroWords} words, max 6)`);
    if (subWords > 12) failures.push(`Sub slogan too long (${subWords} words, max 12)`);

    // Check 3: Decisiveness — reject purely ambient adjective-noun slogans with no hook
    const ambientOnlyWords = new Set(['soft', 'gentle', 'calm', 'quiet', 'open', 'easy', 'warm', 'slow', 'still', 'light', 'deep']);
    const genericNouns = new Set(['greens', 'seas', 'waters', 'days', 'time', 'skies', 'air', 'light', 'winds', 'waves', 'horizons']);
    const heroTokens = heroSlogan.toLowerCase().replace(/[^a-z\s]/g, '').split(' ').filter(w => w.length > 0);
    const meaningfulTokens = heroTokens.filter(w => !ambientOnlyWords.has(w) && !genericNouns.has(w) && w.length > 2);
    if (meaningfulTokens.length === 0 && heroTokens.length > 0) {
        failures.push('Hero slogan is too ambient — needs a verb, contrast, or identity anchor beyond soft adjectives');
    }

    // Check 4: Niche anchor — at least one keyword or synonym should appear in combined slogans
    if (nicheKeywords.length > 0) {
        const lowerKeywords = nicheKeywords.map(k => k.toLowerCase());
        const hasNicheAnchor = lowerKeywords.some(keyword => lowerSlogans.includes(keyword));
        if (!hasNicheAnchor) {
            failures.push(`Slogan does not anchor to niche identity — expected at least one of: ${lowerKeywords.slice(0, 5).join(', ')}`);
        }
    }

    return failures;
}

export function joinCampaignList(values?: string[]): string {
    if (!values || values.length === 0) {
        return 'None provided';
    }

    return values.join(', ');
}

function sanitizePromptText(value?: string): string {
    if (!value) {
        return 'Not provided';
    }

    return value
        .replace(/leave[- ]one\/?take[- ]one shelf/gi, 'guest-to-guest book passing')
        .replace(/book[- ]swap shelf/gi, 'guest-to-guest book passing')
        .replace(/shared shelf/gi, 'guest-to-guest recommendation flow')
        .replace(/curated shelf/gi, 'personal recommendation flow')
        .replace(/book[- ]swap station/gi, 'casual guest book exchange')
        .replace(/book swap/gi, 'casual guest book exchange')
        .replace(/optional salons/gi, 'optional after-dinner conversation')
        .replace(/salon-style/gi, 'easy conversational')
        .replace(/\bsalons\b/gi, 'after-dinner conversations')
        .replace(/\bsalon\b/gi, 'after-dinner conversation')
        .replace(/listening room/gi, 'window-side listening mood')
        .replace(/hosted talk/gi, 'easy conversation')
        .replace(/teach-and-play/gi, 'easy guest-led play')
        .trim();
}

export function sanitizePromptList(values?: string[]): string[] {
    if (!values || values.length === 0) {
        return [];
    }

    return values.map((value) => sanitizePromptText(value));
}

export function getCanonicalShipName(campaign: Campaign): string {
    const shipTarget = campaign.shipTarget?.trim();
    if (shipTarget) {
        return shipTarget;
    }

    const matchedShipName = campaign.matchedShipName?.trim();
    if (matchedShipName) {
        return matchedShipName;
    }

    return 'TBD';
}

export function buildShipContext(campaign: Campaign): string {
    const canonicalShip = getCanonicalShipName(campaign);
    const matchedShipName = campaign.matchedShipName?.trim();

    if (matchedShipName && campaign.shipTarget?.trim() && matchedShipName !== campaign.shipTarget.trim()) {
        return `${canonicalShip} | Inventory metadata conflict: ${matchedShipName} (do not use conflicting ship name in outward copy)`;
    }

    if (matchedShipName) {
        return `${canonicalShip} | Inventory matched ship: ${matchedShipName}`;
    }

    return canonicalShip;
}

function buildRouteContext(campaign: Campaign): string {
    const routeParts = [
        campaign.targetDestination,
        campaign.matchedDeparturePort ? `Departure Port: ${campaign.matchedDeparturePort}` : undefined,
        campaign.matchedNights ? `Duration: ${campaign.matchedNights}` : undefined,
        campaign.matchedSailDate ? `Matched Sail Date: ${campaign.matchedSailDate}` : undefined,
    ].filter(Boolean);

    return routeParts.length > 0 ? routeParts.join(' | ') : 'No route context provided';
}

export function buildEventFramingGuidance(campaign: Campaign): string {
    const highlightEvents = sanitizePromptList(campaign.highlightEvents);

    if (highlightEvents.length === 0) {
        return 'No highlight events provided. Do not invent event-specific spectacle, themed operations, or special-viewing infrastructure.';
    }

    return [
        `Highlight events provided: ${joinCampaignList(highlightEvents)}.`,
        'Treat real itinerary-timed events, seasonal phenomena, holidays, and cultural moments as backdrop context unless the campaign is explicitly being sold as that event experience.',
        'Let those events influence lighting, sky color, timing, destination mood, emotional cadence, or shared atmosphere rather than turning them into onboard programming.',
        'Do not let a secondary event silently hijack the campaign identity, hero slogan, or repeated social/video beats.',
        'Avoid language that implies ceremony, viewing rituals, special gear, or hosted infrastructure unless that operation is genuinely part of the product.'
    ].join(' ');
}

function buildRefinementContext(campaign: Campaign): string {
    return [
        `Theme: ${campaign.name}`,
        `Canonical Ship: ${getCanonicalShipName(campaign)}`,
        `Ship Context: ${buildShipContext(campaign)}`,
        `Destination: ${campaign.targetDestination || 'TBD'}`,
        `Route Context: ${buildRouteContext(campaign)}`,
        `Highlight Events: ${joinCampaignList(sanitizePromptList(campaign.highlightEvents))}`,
        `Event Framing Guidance: ${buildEventFramingGuidance(campaign)}`,
        `Vacation Fit Rationale: ${sanitizePromptText(campaign.vacationFitRationale)}`,
        `Cruise-Native Moments: ${joinCampaignList(sanitizePromptList(campaign.cruiseNativeMoments))}`,
        `Niche Expression Mode: ${sanitizePromptText(campaign.nicheExpressionMode)}`,
        `Allowed Theme Signals: ${joinCampaignList(sanitizePromptList(campaign.allowedThemeSignals))}`,
        `Discouraged Theme Signals: ${joinCampaignList(sanitizePromptList(campaign.discouragedThemeSignals))}`,
        `Implausible Literalizations: ${joinCampaignList(sanitizePromptList(campaign.implausibleLiteralizations))}`,
        `Community Fit Rationale: ${sanitizePromptText(campaign.communityFitRationale)}`,
        `Optional Gathering Moments: ${joinCampaignList(sanitizePromptList(campaign.optionalGatheringMoments))}`,
        `Optionality Style: ${sanitizePromptText(campaign.optionalityStyle)}`,
        `Solitude Risks: ${joinCampaignList(sanitizePromptList(campaign.solitudeRisks))}`,
    ].join('\n');
}

async function refineAestheticBrief(
    campaign: Campaign,
    draftBrief: CampaignAestheticBrief,
    instructions?: string,
): Promise<CampaignAestheticBrief> {
    const refinementPrompt = `
You are GitHub Copilot using GPT-5.4 in a dedicated aesthetic refinement phase.

Review the draft aesthetic brief and polish it like a senior creative director performing a final quality pass.
Preserve what is already strong. Make the smallest set of changes needed to improve precision, plausibility, specificity, and emotional truth.

REFINEMENT OBJECTIVES:
- Keep the campaign cruise-first, ship-first, and horizon-first.
- Keep the niche as a soft social flavor layer, not an onboard event architecture.
- Keep the new community layer intact: the trip should feel socially alive, but every group beat should remain optional, ambient, and easy to step into or out of.
- Preserve the exact provided ship identity when one exists. Do not rename the ship, substitute a sister ship, or swap classes.
- Remove residual organized-program language such as hosted hours, sessions, activations, library cart energy, sign-up energy, or managed social mechanics.
- Replace those with ambient, human, low-pressure, real-cruise phrasing.
- Avoid drifting into exclusivity-coded lifestyle language such as quiet-luxe, elevated salon, collector-grade curation, or other wording that makes the trip sound like a rarefied cultural program instead of a welcoming vacation.
- Reduce repetitive micro-prop dependence across the brief; vary between interpersonal chemistry, wardrobe/detail cues, object cues, and environmental cues.
- Keep off-ship or destination sentiment light but meaningful when route context exists.
- Do not invent excursions, exact ports, or shore claims that are unsupported by the route context.
- Keep hero and social concepts photogenic, restrained, and realistic.
- Remove anything that makes the campaign feel like a convention, meetup operations plan, or themed program schedule.
- Remove anything that makes the campaign feel lonely, socially vacant, or like a premium solo retreat with decorative group language.
- Do not let a real itinerary event, holiday, or seasonal phenomenon overpower the campaign unless it is explicitly the core product.
- If an event is referenced, keep it proportional and backdrop-oriented: atmosphere, light, timing, destination mood, or emotional cadence rather than ceremony, viewing ritual, special gear, or onboard programming.
- Remove repeated named-event phrasing if it starts to sound like the campaign is secretly an event-specific cruise.
- Prefer passing-recommendation, shared-table, rail-side-friendship, and window-seat companionship language over browseable-cart, shelf infrastructure, table-tent, lanyard, or explicit matching mechanics.
- If a destination is referenced, make it feel like sail-away atmosphere, waterfront wandering, harbor light, market texture, or hillside distance rather than excursion copy.

SPECIFIC CLEANUP TARGETS:
- Avoid phrases like borrow shelf, browseable nook, teach-as-you-go, looking for players, host table, or borrow cart unless they are fully dissolved into background ambiance.
- Prefer spontaneous friend-to-friend phrasing like a recommendation passed across the table, a game someone brought along, a pocket deck appearing between coffees, or an easy shared turn.
- De-emphasize trays, pencil cups, table tents, scorepads, and other semi-system props unless they are truly incidental and not the conceptual center of the moment.
- If in doubt, choose social softness over tabletop infrastructure.
- For music, listening, or audio-forward campaigns, avoid phrasing like curated plays, full-room listen, listening room, rare pressing moment, or the room leans in when it implies a semi-hosted onboard activation.
- For those campaigns, prefer soundtrack-to-the-view language: a favorite side by the window, a recommendation passed between guests, a song that fits sailaway, or a cabin/lounging mood that happens naturally.
- Also avoid language that implies control of the venue soundtrack or public playback as the signature event: lounge system takeover, side played through the room, spotlight listening, collector showcase, or featured pressing moment.
- For those campaigns, prefer low-pressure discovery language over collector prestige language: favorite record, song recommendation, sleeve edge, track note, deep cut, after-dinner drift, or something good quietly shared.
- For reading/literary campaigns, avoid phrasing like salon-style conversation, influencer guest session, curated shelf, shared shelf, leave-one/take-one shelf, book-swap station, literary activation, or hosted discussion if it implies infrastructure or a formal recurring program.
- For those campaigns, prefer guest-native reading language: a recommendation passed along, a closed book on a lounger, a ribbon mark at the window, a casual after-dinner chat, or a novel-in-your-bag atmosphere.
- If a reading campaign references books changing hands, frame it as one guest passing a recommendation or lending a book directly to another guest, not as shelf-based infrastructure.
- For reading/literary campaigns, do not mention shelves, shared shelves, tucked spines, browsing shelves, or leave-one/take-one setups anywhere in the final brief, even as incidental background texture.

NON-OBJECT DIVERSITY RULES:
- Diversify niche expression across the brief. Do not let the same object family carry every section.
- Lean on non-object cues such as posture, shared attention, eye contact, seat choice, pacing, wardrobe texture, color accents, carry-on styling, and environmental framing.
- At least half of the social and video concepts should communicate the niche without requiring a visible tabletop object as the central beat.
- If cards, dice, tokens, pencils, pads, or pins appear in one concept, rotate the next concepts toward human chemistry, wardrobe, architecture, harbor atmosphere, or horizon-led framing.
- Do not let any single cue family dominate the moodboard, carousel, and video concepts all at once.

SPECIFIC QUALITY BAR:
- Hero slogan must be 6 words or fewer — a true hook, not a headline-plus-descriptor.
- Hero slogan must be decisive and identity-anchoring — it should make the target audience feel named and pulled.
- It must contain a verb, contrast, or identity marker beyond soft adjectives.
- A slogan like "Soft greens, open seas" is too ambient. "Sail first, spot the green." is the benchmark.
- The slogan must be ownable by this exact campaign and not interchangeable with generic cruise marketing.
- Sub-slogan must sell fast. It should read like a one-breath conversion line, not a literary description written for review.
- If the sub-slogan sounds more like a magazine deck than a social-media caption, tighten it.
- ALL SUPPORT COPY (elevator pitch, social captions, ad lines, email subjects) must match the hero line's level of sharpness and ownability. If a phrase could appear in any cruise marketing (e.g., "Botanical vibes, ocean-first"), it is not sharp enough. Rework it until it names or implies this specific audience.
- Elevator pitch should sound like a desirable vacation, not a programming overview.
- communityExpression must stay coherent with the campaign context and should explicitly protect both optionality and togetherness.
- Visual composition and plausibility cues should prioritize ship life, sea, and human presence before any niche prop.
- Social and video concepts should feel varied and platform-native without repeating the same token, die, pouch, tray, or leaflet beat over and over.
- Merch should stay cute and printable, but not dominate the campaign identity or repeat the same icon family across every item.

OUTPUT RULES:
- Return a fully refined brief matching the schema.
- Do not add productionBible.
- Do not change the campaign identity, only sharpen it.
- Keep changes minimal but meaningful.
- If the campaign context provides a ship name, use that exact ship name in copy fields and do not invent another ship.
`.trim();

    const instructionBlock = instructions
        ? `\n\nOPERATOR INSTRUCTIONS:\nHonor these user-supplied instructions unless they conflict with schema validity, safety, or cruise plausibility requirements.\n${instructions}`
        : '';

    const { object } = await callGlobalGenerateObject({
        modelName: ModelName.GPT_5_HIGH,
        schema: RefinementSchema,
        system: refinementPrompt + instructionBlock,
        prompt: `Campaign Context:\n${buildRefinementContext(campaign)}\n\nDraft Brief To Refine:\n${JSON.stringify(draftBrief, null, 2)}`,
        maxOutputTokens: 7000,
        operationName: `aesthetic-refinement:${campaign.id}`,
    });

    const refinedMerch = normalizeMerchBrief(campaign.name, object.merch);
    const refinedBrief: CampaignAestheticBrief = {
        ...draftBrief,
        ...object,
        slug: campaign.id,
        themeName: campaign.name,
        visual: {
            ...object.visual,
            plausibilityFramework: normalizeVisualPlausibilityFramework(object.visual.plausibilityFramework),
            humanRepresentation: normalizeHumanRepresentationGuidance(object.visual.humanRepresentation),
        },
        merch: refinedMerch,
        generatedAt: new Date().toISOString(),
        generatedBy: 'agent',
        humanReviewStatus: 'pending',
        revisionCycleCount: draftBrief.revisionCycleCount,
    };

    return refinedBrief;
}

export async function generateAestheticBrief(
    campaign: Campaign,
    options?: { correctionContext?: string; instructions?: string; recordStageTiming?: (stageName: string, elapsedMs: number) => void },
): Promise<CampaignAestheticBrief> {
    console.log(`[aesthetic-engine] Starting aesthetic brief generation for ${campaign.id}`);
    console.log(`[aesthetic-engine] Structured generation helper selected for ${campaign.id}: model=${ModelName.GPT_5_HIGH}`);

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
Highlight Events: ${joinCampaignList(sanitizePromptList(campaign.highlightEvents))}
Event Framing Guidance: ${buildEventFramingGuidance(campaign)}
Canonical Ship: ${getCanonicalShipName(campaign)}
Ship Context: ${buildShipContext(campaign)}
Destination: ${campaign.targetDestination || 'TBD'}
Route Context: ${buildRouteContext(campaign)}
Vacation Fit Rationale: ${sanitizePromptText(campaign.vacationFitRationale)}
Cruise-Native Moments: ${joinCampaignList(sanitizePromptList(campaign.cruiseNativeMoments))}
Niche Expression Mode: ${sanitizePromptText(campaign.nicheExpressionMode)}
Allowed Theme Signals: ${joinCampaignList(sanitizePromptList(campaign.allowedThemeSignals))}
Discouraged Theme Signals: ${joinCampaignList(sanitizePromptList(campaign.discouragedThemeSignals))}
Implausible Literalizations: ${joinCampaignList(sanitizePromptList(campaign.implausibleLiteralizations))}
Community Fit Rationale: ${sanitizePromptText(campaign.communityFitRationale)}
Optional Gathering Moments: ${joinCampaignList(sanitizePromptList(campaign.optionalGatheringMoments))}
Optionality Style: ${sanitizePromptText(campaign.optionalityStyle)}
Solitude Risks: ${joinCampaignList(sanitizePromptList(campaign.solitudeRisks))}

Visual Priority Rules:
- For visual identity fields, prioritize durable cruise/travel truths that would still feel correct even if no niche activity is happening in frame.
- Hero-safe imagery should read first as travel/cruising at sea, second as niche identity.
- Highlight events and targeting keywords are flavor cues, not mandatory literal scene directions.
- If highlight events contain structured, hosted, or promotional wording, reinterpret them into softer guest-native atmosphere rather than repeating them literally.
- Real itinerary events or seasonal phenomena may shape light, timing, mood, and destination texture, but should not become the campaign's dominant promise unless the campaign is explicitly sold as that event experience.
- If an event is secondary, mention it sparingly and proportionally. Let it tint the mood rather than take over slogans, merch, or repeated concept beats.
- Never imply special onboard ceremony, viewing ritual, gear culture, or hosted infrastructure unless that experience is genuinely part of the product.
- Niche cues should usually be subtle: wardrobe hints, one prop, one gesture, one environmental clue.
- The brief must explicitly distinguish what is cruise-native, what is niche-enhanced but believable, and what would feel like staged promo fiction.
- If ship context is provided, preserve the exact ship name and class context. Never substitute a different ship.
- The brief must define why the group feels real and welcoming even when guests engage lightly.
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
- visual.plausibilityFramework is mandatory and must act like a reality filter for downstream image generation.
- visual.plausibilityFramework.governingPrinciple must articulate the single rule for how the niche shows up within believable cruise life.
- visual.plausibilityFramework.cruiseNativeMoments should name moments that would feel normal and desirable on the ship even without the niche theme.
- visual.plausibilityFramework.nicheEnhancedMoments should name believable ways the niche can lightly modulate those cruise-native moments.
- visual.plausibilityFramework.implausibleLiteralizations should name specific staged, props-heavy, or operationally awkward scenes to avoid.
- visual.plausibilityFramework.allowedProps should be lightweight, plausible, guest-friendly objects.
- visual.plausibilityFramework.discouragedProps should include equipment or setups that make the cruise feel like a lab, classroom, or trade-show demo.
- visual.humanRepresentation is mandatory and must define who appears in the campaign, how diverse the cast should feel across the image set, and how to avoid stereotype-driven casting.
- visual.humanRepresentation.castingGoal should describe the overall human mix the campaign should depict across stills and scenes.
- visual.humanRepresentation.ageRangeGuidance should align the apparent guest ages with the theme while still allowing range and realism.
- visual.humanRepresentation.diversityIntent should call for visible ethnic and skin-tone diversity across the set where plausible to the campaign, without tokenism.
- visual.humanRepresentation.pairingGuidance should vary who appears together across the set instead of repeating one default demographic pairing.
- visual.humanRepresentation.stylingGuidance should connect the theme to believable clothing and grooming without caricature.
- visual.humanRepresentation.antiStereotypeRules should explicitly ban token casting, costume logic, and reductive cultural shortcuts.

CRITICAL MESSAGING AND SOCIAL RULES:
- The niche must remain a social flavor layer, not a scheduled program architecture.
- communityExpression is mandatory and must make the group feel emotionally real without turning the trip into managed programming.
- communityExpression.corePromise should explain what social reward the guest gets from being around their people on this sailing.
- communityExpression.participationStyle must explicitly describe low-pressure, drop-in/drop-out participation.
- communityExpression.socialGravity must explain why strangers in this niche naturally start talking, clustering, or recognizing one another at sea.
- communityExpression.optionalGatherings should name lightweight gatherings or rhythms, not scheduled curriculum.
- communityExpression.belongingSignals should focus on recognizable cues, shared taste, easy social openings, and visual identity rather than event operations.
- communityExpression.solitudeAntiPatterns should guard against lonely, exclusive, emotionally hollow, or premium-solo-retreat drift.
- communityExpression.visualTogethernessNotes should explain how imagery can show togetherness without crowds, choreography, or busy event scenes.
- communityExpression.copyFramingRule should explicitly protect opt-in phrasing for introverts and casual participants.
- Avoid nouns and phrases that imply formal operations or recurring structured programming: classes, sessions, workshops, rotations, sign-up tables, hosted hours, activations, stations, open library, or teaching blocks.
- Avoid exclusivity or lifestyle-marketing language that turns the trip into a luxury-membership fantasy; keep it welcoming, specific, and human instead of rarefied.
- If the campaign source fields contain organized wording, convert it into vacation-native language instead of mirroring it. Never copy source phrases like salon, hosted talk, book swap station, listening room, spotlight, or teach-and-play unless they dissolve into incidental background context.
- Prefer ambient cruise-social phrasing: easy drop-in moment, shared table, passing recommendation, low-pressure evening drift, rail-side chat, café-side laugh.
- At least some niche expression should come from interpersonal chemistry, posture, wardrobe, or tiny carry-on cues, not only handheld props.
- Do not let every visual idea rely on the same object repeated over and over; vary between object cue, wardrobe cue, conversational cue, and environmental cue.
- At least half of the social/video concepts should signal the niche through non-object cues such as seat choice, eye contact, body angle, outfit detail, timing, architecture, or harbor atmosphere rather than a visible game object.
- If an object cue is used in one concept, the next concepts should deliberately pivot to a different signal family instead of repeating cards, dice, tokens, scorepads, or pins.
- Preserve calm and restraint, but do not make the campaign feel emotionally empty or solitary; include believable low-pressure human-togetherness where appropriate.
- If route context exists, lightly use destination or port-day atmosphere where it naturally strengthens the campaign; do not ignore the itinerary completely.
- Off-ship sentiment must remain secondary to ship life, but at least some messaging or content concepts may reference believable shore mood, local café culture, market strolls, waterfront wandering, or region-specific ambiance when it fits the route.
- Do not invent specific excursions or port details unless the provided route context genuinely supports them.
- Do not let a real itinerary event, holiday, or seasonal phenomenon quietly hijack the campaign identity unless it is explicitly the core product. Event context may influence atmosphere, but should not override the niche and cruise promise.
- If an event is referenced, frame it as contextual backdrop rather than a promised onboard experience.
- Keep lanyards, table tents, carts, or explicit matching systems out of the aesthetic center unless they are minimized to near-invisible background texture.
- Avoid naming semi-managed features like borrow shelves, quiet nooks for game selection, or teach-and-play moments as if they are programmed amenities.
- Prefer language where the niche appears through guests, not infrastructure: a game suggested by a friend, a card passed after dessert, a pocket deck surfacing by the window, a soft laugh over one shared turn.
- For music/listening campaigns specifically, do not imply a hosted salon, listening-room program, or collector ritual. The music should feel like atmosphere, recommendation culture, and guest-carried mood rather than a formal room event.
- For music/listening campaigns specifically, avoid making shared public playback the central mechanism of the experience. Use ship soundtrack mood, personal recommendations, side-by-side listening energy, and naturally shared taste rather than room-command or spotlight moments.
- For reading/literary campaigns specifically, do not imply hosted salons, influencer talks, curated swap infrastructure, shared shelves, leave-one/take-one shelves, or reading-club management. Reading should feel self-directed, socially easy, and naturally embedded in sea days and port downtime.
- For reading/literary campaigns specifically, never use shelf-based ambient infrastructure as the mechanism for discovery; recommendations should move person-to-person, book-to-hand, or remain purely atmospheric.
`.trim();

    const correctionSuffix = options?.correctionContext
        ? `\n\nCORRECTIVE REPROMPT — HARD FAILURE CONTEXT:\nThe previous generation produced the following validation blockers. You MUST resolve every one of them in this output.\n${options.correctionContext}`
        : '';
    const instructionSuffix = options?.instructions
        ? `\n\nOPERATOR INSTRUCTIONS:\nHonor these user-supplied instructions unless they conflict with schema validity, safety, or cruise plausibility requirements.\n${options.instructions}`
        : '';

// ── PASS1_TIMEOUT_MS: per-attempt wall-clock cap (ms).
    // If a single callGlobalGenerateObject call exceeds this, we abort the attempt and
    // break with the last accepted result (or use the partial if no attempt passed).
    const PASS1_ATTEMPT_TIMEOUT_MS = 90_000;

    // ── normalizePass1Output: fills nested fields that the model commonly omits.
    // Keeps the live structured-output contract strict while absorbing model gaps in TS.
    function normalizePass1Output(raw: z.infer<typeof Pass1Schema>): z.infer<typeof Pass1Schema> {
        const palette = raw.visual.colorPalette;
        const typography = raw.visual.typographyDirection;
        const messaging = raw.messaging;
        return {
            ...raw,
            visual: {
                ...raw.visual,
                colorPalette: {
                    primary: palette.primary || '#1a2b3c',
                    secondary: palette.secondary || '#4d5e6f',
                    accent: palette.accent || '#f0c040',
                    background: palette.background || '#0a0a0a',
                    textOnDark: palette.textOnDark || '#ffffff',
                    textOnLight: palette.textOnLight || '#111111',
                },
                typographyDirection: {
                    headlineStyle: typography.headlineStyle || 'Bold, uppercase, high-contrast',
                    bodyStyle: typography.bodyStyle || 'Clean sans-serif, generous line height',
                    suggestedFonts: typography.suggestedFonts?.length ? typography.suggestedFonts : ['Inter', 'Outfit'],
                },
                plausibilityFramework: normalizeVisualPlausibilityFramework(raw.visual.plausibilityFramework),
                humanRepresentation: normalizeHumanRepresentationGuidance(raw.visual.humanRepresentation),
            },
            messaging: {
                ...messaging,
                heroSlogan: messaging.heroSlogan || `${raw.visual.aestheticLabel} by sea`,
                subSlogan: messaging.subSlogan || 'Your kind of cruise.',
                ctaVariants: {
                    waitlist: messaging.ctaVariants?.waitlist || 'Join the List',
                    bookNow: messaging.ctaVariants?.bookNow || 'Book Now',
                    merch: messaging.ctaVariants?.merch || 'Shop the Look',
                    share: messaging.ctaVariants?.share || 'Share This',
                },
                toneKeywords: messaging.toneKeywords?.length ? messaging.toneKeywords : ['aspirational', 'specific', 'welcoming'],
                elevatorPitch: messaging.elevatorPitch || '',
                voicePersona: messaging.voicePersona || '',
            },
            merch: normalizeMerchBrief(campaign.name, raw.merch),
        };
    }

    // ── Music/festival Pass 1 enforcement block (injected when campaign type matches).
    const musicFestivalPass1Block: string = isMusicFestivalCampaign(campaign)
        ? [
            '',
            'MUSIC/FESTIVAL/OPEN-DECK CAMPAIGN — PASS 1 HARD REQUIREMENTS:',
            'This campaign is a music, festival, or open-deck community type.',
            'The following rules apply to communityExpression.belongingSignals and the core aesthetic identity:',
            '  - At least 3 of the belonging signals must be explicitly music-cue-bearing (e.g. guests dancing on deck, live performer adjacency, crowd energy at a sound system, vinyl or earbuds as carry props, DJ booth atmosphere).',
            '  - Banned belonging signal families for this campaign type: hosted listening room energy, public-playback control fantasy, collector-prestige salon language, generic luxury leisure with no music proof, managed event infrastructure.',
            '  - The heroSlogan and subSlogan must anchor to music culture — they must NOT be interchangeable with generic premium cruise slogans.',
            '  - communityExpression.socialGravity must name music-specific gravity: shared taste, recognizable fan culture, song-sharing, visible listening energy.',
        ].join('\n')
        : '';

    let pass1Result: { object: z.infer<typeof Pass1Schema>, failures?: string[] } | undefined;
    const pass1Start = Date.now();
    let attempts = 0;
    while (attempts < 3) {
        attempts++;
        const attemptStart = Date.now();
        console.log(`[aesthetic-engine:pass1-attempt] START attempt=${attempts} campaign=${campaign.id}`);
        const feedbackOpt = attempts > 1 ? `\nPREVIOUS ATTEMPT FAILED QUALITY GATE:\n${pass1Result?.failures?.join('\n')}\nFIX THESE ISSUES.` : '';

        let attemptObject: z.infer<typeof Pass1Schema> | undefined;
        try {
            const attemptTimeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(
                    () => reject(new Error(`[aesthetic-engine:pass1-timeout] Attempt ${attempts} for ${campaign.id} exceeded ${PASS1_ATTEMPT_TIMEOUT_MS / 1000}s`)),
                    PASS1_ATTEMPT_TIMEOUT_MS,
                );
            });
            const { object } = await Promise.race([
                callGlobalGenerateObject({
                    modelName: ModelName.GPT_5_HIGH,
                    schema: Pass1Schema,
                    system: systemPromptPass1 + musicFestivalPass1Block + feedbackOpt + instructionSuffix + correctionSuffix,
                    prompt: `Context:\n${baseContext}\n\nBrand Guidelines:\n${brandGuidelines}\n\n${merchGuidelines}`,
                    maxOutputTokens: 9000,
                    operationName: `aesthetic-pass1:${campaign.id}:attempt-${attempts}`,
                }),
                attemptTimeoutPromise,
            ]);
            attemptObject = object;
        } catch (attemptError) {
            const attemptElapsedMs = Date.now() - attemptStart;
            const attemptMessage = attemptError instanceof Error ? attemptError.message : String(attemptError);
            const isTimeout = attemptMessage.includes('[aesthetic-engine:pass1-timeout]');
            console.warn(`[aesthetic-engine:pass1-attempt] ${isTimeout ? 'TIMEOUT' : 'ERROR'} attempt=${attempts} campaign=${campaign.id} elapsedMs=${attemptElapsedMs} msg=${attemptMessage}`);
            options?.recordStageTiming?.(`aesthetic-pass1-attempt-${attempts}-error`, attemptElapsedMs);
            if (isTimeout && pass1Result) {
                // Already have a good prior result; break with it rather than burning more budget.
                console.log(`[aesthetic-engine:pass1-attempt] Using prior accepted result after timeout on attempt ${attempts}`);
                break;
            }
            // No prior good result: rethrow and let outer error handling surface this
            throw attemptError;
        }

        const attemptElapsedMs = Date.now() - attemptStart;
        const normalizedObject = normalizePass1Output(attemptObject);
        options?.recordStageTiming?.(`aesthetic-pass1-attempt-${attempts}`, attemptElapsedMs);
        console.log(`[aesthetic-engine:pass1-attempt] END attempt=${attempts} campaign=${campaign.id} elapsedMs=${attemptElapsedMs}`);

        const sloganFailures = checkSloganQuality(normalizedObject.messaging.heroSlogan, normalizedObject.messaging.subSlogan, campaign.targetingKeywords);
        if (sloganFailures.length < 2) {
            console.log(`[aesthetic-engine] Pass 1 accepted for ${campaign.id} on attempt ${attempts}`);
            pass1Result = { object: normalizedObject };
            break; // Pass!
        } else {
            console.warn(
                `[aesthetic-engine] Pass 1 quality gate failed for ${campaign.id} on attempt ${attempts}: ${sloganFailures.join('; ')}`
            );
            pass1Result = { object: normalizedObject, failures: sloganFailures };
        }
    }

    // Fallback if it failed 3 times, keep last result
    const coreAesthetic = pass1Result!.object;
    options?.recordStageTiming?.('aesthetic-pass1-core', Date.now() - pass1Start);

    // PASS 2: Platform Extrapolations
    const systemPromptPass2 = `
You are the Creative Director for Leisure Life Interactive. 
Based on the finalized core aesthetic identity, expand this campaign into precise, platform-native social media and video concepts.
Return ONLY the socialConcepts and videoConcepts conforming to the schema.

PASS 2 GUARDRAILS:
- Keep every concept cruise-first and atmosphere-first.
- Avoid copy that makes the campaign sound like an organized event program or tabletop convention.
- Do not default to phrases like learn-to-play sessions, hosted hours, open library, programming blocks, workshops, or scheduled activities unless the wording is softened into optional ambient behavior.
- Avoid exclusivity-coded phrasing such as quiet-luxe, elevated salon, collector-grade, or other copy that makes the campaign feel socially gated or culturally precious.
- Preserve the exact provided ship name. Do not swap to another ship, even within the same cruise line.
- Read and honor communityExpression. The concepts must make the group feel real, optional, welcoming, and socially magnetic.
- Vary niche signals across concepts; do not repeat the same die, token, tuckbox, or prop in every asset.
- Some concepts should communicate the niche through two-person chemistry, shared glances, side-by-side lounging, or subtle wardrobe details instead of tabletop objects.
- At least half of the concepts in the total set should not rely on a visible tabletop object as the primary signal.
- Rotate signal families across the set: object cue, wardrobe cue, posture cue, conversational cue, architectural cue, and destination-atmosphere cue.
- If one concept uses cards, dice, tokens, scorepads, or pins, the next concept should pivot away from that family and express the niche through mood, behavior, styling, or framing.
- For music/listening campaigns, keep concepts centered on windows, water, companionship, song-sharing, and ambient atmosphere rather than semi-hosted room-listen setups.
- For music/listening campaigns, do not make public playback, collector status, or featured rare-record moments the hero beat of the concept set.
- For reading/literary campaigns, keep concepts centered on quiet corners, page-turn pauses, direct recommendations between guests, and horizon-led calm rather than shelves, hosted chats, or managed literary environments.
- If route context exists, let a small number of concepts acknowledge believable destination texture or port-day possibility without making the campaign excursion-led.
- Avoid foregrounding borrow shelves, carts, table tents, score systems, or player-matching cues in social/video concepts.
- Prefer spontaneous social moments over any copy that implies a managed onboard tabletop ecosystem.
`.trim();

    console.log(`[aesthetic-engine] Pass 2 platform concepts for ${campaign.id}`);

    const pass2Start = Date.now();
    const { object: platformConcepts } = await callGlobalGenerateObject({
        modelName: ModelName.GPT_5_HIGH,
        schema: Pass2Schema,
        system: systemPromptPass2 + instructionSuffix + correctionSuffix,
        prompt: `Campaign Identity to apply:\n${JSON.stringify(coreAesthetic, null, 2)}`,
        maxOutputTokens: 7000,
        operationName: `aesthetic-pass2:${campaign.id}`,
    });
    options?.recordStageTiming?.('aesthetic-pass2-platform', Date.now() - pass2Start);

    // Assemble the core brief. The default generate route now immediately follows
    // with visual-planning generation so saved briefs include production artifacts.
    const draftBrief: CampaignAestheticBrief = {
        slug: campaign.id,
        themeName: campaign.name,
        ...coreAesthetic,
        socialConcepts: platformConcepts.socialConcepts,
        videoConcepts: platformConcepts.videoConcepts,
        generatedAt: new Date().toISOString(),
        generatedBy: 'agent',
        humanReviewStatus: 'pending',
        revisionCycleCount: 0,
    };

    console.log(`[aesthetic-engine] Refinement pass for ${campaign.id}`);
    const refinementStart = Date.now();
    const refinedBrief = await refineAestheticBrief(campaign, draftBrief, options?.instructions);
    options?.recordStageTiming?.('aesthetic-refinement', Date.now() - refinementStart);
    return refinedBrief;
}

// ────────────────────────────────────────────────────────────────────────────
// Pass 3: Production Bible Generation
// Generates the Scene Library and Storyboards for multi-shot video production.
// ────────────────────────────────────────────────────────────────────────────

const SHIP_REFERENCE_CATEGORIES = [
    'exterior', 'pool_deck', 'dining', 'stateroom', 'atrium',
    'nightclub', 'spa', 'destination_port', 'theater', 'sports_deck',
    'offboard_excursion'
] as const;

const VIDEO_DELIVERABLES = VIDEO_DELIVERABLE_SPECS;

const VisualPlanningBundleSchema = z.object({
    landingStillBible: LandingStillBibleSchema,
    productionBible: ProductionBibleSchema,
});

type VisualPlanningBundle = z.infer<typeof VisualPlanningBundleSchema>;

// Public entry point for explicit production-bible refreshes.
// The default /media/aesthetic generate route also calls visual planning automatically.
export async function generateProductionBibleFromBrief(
    campaign: Campaign,
    brief: CampaignAestheticBrief
): Promise<ProductionBible> {
    const visualPlanning = await generateVisualPlanningFromBrief(campaign, brief);
    return visualPlanning.productionBible;
}

export async function generateVisualPlanningFromBrief(
    campaign: Campaign,
    brief: CampaignAestheticBrief
): Promise<VisualPlanningBundle> {
    const coreAesthetic = {
        visual: brief.visual,
        messaging: brief.messaging,
        communityExpression: brief.communityExpression,
        audio: brief.audio,
        merch: brief.merch,
    } as z.infer<typeof Pass1Schema>;

    const platformConcepts = {
        socialConcepts: brief.socialConcepts,
        videoConcepts: brief.videoConcepts,
    } as z.infer<typeof Pass2Schema>;

    const remediationContext = buildVisualPlanningRemediationContext(brief);

    return generateVisualPlanningBundle(campaign, coreAesthetic, platformConcepts, remediationContext);
}

function buildVisualPlanningRemediationContext(brief: CampaignAestheticBrief): string {
    const openIssues = (brief.issueLedger ?? []).filter(issue =>
        (issue.status === 'open' || issue.status === 'failed')
        && ['brief', 'production_bible', 'landing_still_bible', 'cross_artifact'].includes(issue.owningArtifact),
    );

    const dedupedIssues = Array.from(new Map(
        openIssues.map(issue => [`${issue.title}::${issue.summary}`, issue]),
    ).values());

    const lines: string[] = [];

    if (brief.redTeamReview?.requiredFixes?.length) {
        lines.push('Prior required fixes that remain binding until explicitly closed:');
        brief.redTeamReview.requiredFixes.forEach((fix, index) => {
            lines.push(`${index + 1}. ${fix}`);
        });
    }

    if (dedupedIssues.length) {
        lines.push('Open issue-ledger constraints to close in this generation pass:');
        dedupedIssues.forEach((issue, index) => {
            const targetPaths = issue.targetPaths.length > 0 ? ` | Target paths: ${issue.targetPaths.join(', ')}` : '';
            const evidence = issue.evidence[0] ? ` | Evidence: ${issue.evidence[0]}` : '';
            lines.push(`${index + 1}. [${issue.severity}] ${issue.title} -> ${issue.summary}${targetPaths}${evidence}`);
        });
    }

    if (lines.length === 0) {
        return 'No unresolved remediation constraints were provided for visual-planning generation.';
    }

    return [
        'UNRESOLVED REMEDIATION CONSTRAINTS:',
        'Treat every blocker below as a hard failure condition for the new production bible and landing still bible.',
        'Do not reproduce blocked camera moves, blocked venue assumptions, blocked upholstery/stamping logic, empty-scene conflicts, or previously rejected planning language simply because similar text appears elsewhere in the brief.',
        ...lines,
    ].join('\n');
}

// ── Lint compliance block injected into every visual-planning prompt ──────────
// Maps directly to the deterministic rules in production-build-lint.ts so the
// LLM knows the exact fields and exact keywords the machine will scan.

// Detect music/festival/open-deck campaign types from keywords or name so we can
// inject hard niche-identity rules that ban the known generic fallback patterns.
function isMusicFestivalCampaign(campaign: Campaign): boolean {
    const haystack = [
        campaign.name,
        ...(campaign.targetingKeywords ?? []),
        campaign.nicheExpressionMode ?? '',
    ].join(' ').toLowerCase();
    return ['music', 'festival', 'open deck', 'open-deck', 'band', 'concert', 'dj', 'live music', 'vinyl', 'listening'].some(
        term => haystack.includes(term),
    );
}

export function buildLintComplianceBlock(campaign: Campaign, belongingSignals?: string[]): string {
    const nicheKw = (campaign.targetingKeywords ?? []).filter(k => k.trim().length > 0);
    const kwDisplay = nicheKw.length > 0
        ? nicheKw.join(', ')
        : campaign.name.toLowerCase().split(/\s+/).filter(t => t.length > 3).join(', ');

    const vocabularyLines: string[] = belongingSignals && belongingSignals.length > 0
        ? [
            '',
            `   NICHE SIGNAL VOCABULARY — any of the following satisfy the keyword check when present in imagePrompt or subjectAction:`,
            `   Keywords: ${kwDisplay}`,
            '   Campaign belonging signals (observable scene details that also satisfy the scanner):',
            ...belongingSignals.slice(0, 6).map((s, i) => `   ${i + 1}. ${s}`),
            '',
            `   COMPLIANT imagePrompt pattern: "[Atmosphere and light], [ship or port location], [guest experiencing something specific to the ${campaign.name} community — at least one of the above terms embedded here], [ocean or ship as backdrop]"`,
            `   NON-COMPLIANT imagePrompt pattern: "[Atmosphere and light], [any ship location], [generic vacation action — laughing, gazing, couple at rail — no niche term present]" — FAILS scanner`,
        ]
        : [
            '',
            `   COMPLIANT pattern: embed at least one of these: ${kwDisplay} — naturally inside imagePrompt or subjectAction.`,
            '   NON-COMPLIANT pattern: imagePrompt and subjectAction both describe generic vacation activity with no niche-specific term — FAILS scanner.',
        ];

    const musicFestivalNicheBlock: string[] = isMusicFestivalCampaign(campaign)
        ? [
            '',
            '4. MUSIC/FESTIVAL/OPEN-DECK CAMPAIGN — ADDITIONAL HARD RULES (niche identity must be visible on sight):',
            '   This campaign is flagged as a music, festival, or open-deck community. Generic cruise visuals are not sufficient.',
            '   HARD RULES:',
            '   - At least 3 of the 6 stills must show an observable on-image signal of live-music, festival culture, or open-deck community identity.',
            '     Acceptable signals: a guest dancing on deck, a live performer or stage visible in background, guests gathered around a sound system, vinyl records or earbuds as props, crowd energy at an outdoor deck event, a DJ booth visible in scene.',
            '   - The following compositions are BANNED for music/festival campaigns (do not use even as one of 6):',
            '     × deck_sea_wide (couple facing horizon/sunset at wide distance with no music cue)',
            '     × quiet_window_solo (solo guest gazing out porthole or cabin window with no music cue)',
            '     × port_shore_laughing (guests on shore or pier laughing with no music cue in frame)',
            '     × cabin_window_other (any cabin or window setup with no music identity in frame)',
            '   - cueStrength must be "explicit" (not "subtle", not "absent") for at least 3 stills — meaning the niche is immediately legible from the image alone without reading the caption.',
            '   - Do NOT use slogan copy or caption text to carry the music identity — it must be visible in the scene itself.',
        ]
        : [];

    return [
        'LINT COMPLIANCE REQUIREMENTS — MACHINE-CHECKED — NON-COMPLIANCE BLOCKS CAMPAIGN APPROVAL:',
        '',
        '1. NICHE KEYWORD INJECTION (prevents weak_niche_signal and identity_legibility_too_low failures):',
        `   Campaign niche keywords: ${kwDisplay}`,
        '   HARD RULE: At least 4 of the 6 landing stills MUST embed at least one of these keywords (or a direct synonym) inside the "imagePrompt" field OR the "subjectAction" field.',
        '   The remaining 2 stills must include a niche keyword in either "environmentDetails" OR "composition".',
        '   Zero-keyword stills (no niche term in any of the 4 fields) are acceptable for AT MOST 2 of the 6 stills. More than 2 causes a blocking failure.',
        `   Self-check per still: does imagePrompt OR subjectAction contain at least one of: ${kwDisplay}?`,
        ...vocabularyLines,
        '',
        '2. STILL USAGE FIELD DISTRIBUTION (prevents missing_role_coverage failure):',
        '   Produce exactly this distribution across the 6 stills:',
        '   - 2 stills: usage = "hero_primary" or "hero_alt" (wide headline-safe hero compositions)',
        '   - 2 stills: usage = "concept" or "email_header" where the composition field does NOT contain "intimate", "close", "tight", or "detail" (editorial/wide role)',
        '   - 1 still: usage = "concept" where the composition field MUST contain at least one of: "intimate", "close", "tight", "detail" (intimate/tight role)',
        '   - 1 still: any remaining usage value (hero_alt, email_header, social_square, or concept)',
        '   The machine check reads the usage field and composition text directly — comply with exact field values.',
        '',
        '3. COMPOSITION VARIETY (prevents repeated_composition_family and generic_fallback_overuse failures):',
        '   These 4 composition patterns are machine-detected as generic cruise fallbacks. Any pattern appearing 3+ times in the 6 stills is a BLOCKING failure.',
        '   LIMIT EACH TO AT MOST 1 OF THE 6 STILLS:',
        '   - Pattern A (rail_couple_laugh): railing or balcony location + couple laughing or smiling together',
        '   - Pattern B (quiet_window_solo): cabin/porthole/window/stateroom location + solo guest contemplating, gazing, or alone',
        '   - Pattern C (dining_intimacy): dining/restaurant/dinner location + intimate couple or candlelight mood',
        '   - Pattern D (deck_sea_wide): deck/bow/stern/outdoor location + couple facing sea/horizon/sunset at wide distance',
        '   Vary location cluster, subject action, social unit, and mood across all 6 stills so no two stills share both the same location cluster AND the same action cluster.',
        ...musicFestivalNicheBlock,
    ].join('\n');
}

async function generateVisualPlanningBundle(
    campaign: Campaign,
    coreAesthetic: z.infer<typeof Pass1Schema>,
    platformConcepts: z.infer<typeof Pass2Schema>,
    remediationContext: string,
): Promise<VisualPlanningBundle> {
    const { visual, messaging, communityExpression, audio } = coreAesthetic;
    const plausibility = visual.plausibilityFramework;
    const casting = visual.humanRepresentation;
    const tiktokHook = platformConcepts.socialConcepts.tiktokOrganic.hook;
    const tiktokCTA = platformConcepts.socialConcepts.tiktokOrganic.callToAction;

    const systemPromptPass3 = `
You are the Creative Director of an aspirational travel advertising agency commissioned by Leisure Life Interactive.
Your ONE job: make someone watching this campaign stop scrolling and think "I NEED to be on that ship."

You are building TWO linked visual-planning outputs for a niche cruise campaign.

1. A Landing Still Bible for owned-channel still imagery.
2. A Production Bible for scene-library and storyboard-driven motion.

## THE VACATION REFRAME RULE (MOST IMPORTANT)
No matter what the campaign theme is — science, photography, wellness, cooking, history — you MUST reframe every activity as a VACATION EXPERIENCE.
The viewer is NOT signing up for work, a class, or a job. They are signing up for the most magical vacation of their life.
If the theme is "citizen science," the scenes show people HAVING FUN while casually doing something science-adjacent — NOT conducting research.
If the theme is "photography," the scenes show people capturing breathtaking moments — NOT attending a workshop.
Every single scene must pass this test: "Would I post this on Instagram to make my friends jealous?" If no, rewrite it.

## PLAUSIBILITY RULE (EQUALLY IMPORTANT)
Every scene must feel operationally believable on a real cruise ship for real guests.
Depict the niche as a believable modulation of ordinary cruise life, not as a staged demonstration of the niche itself.
If a prop, setup, or behavior feels like it requires a lab, classroom, field station, training room, or formal workshop environment, do not use it.
Prefer lightweight cues, outward-looking behavior, guided noticing, conversation, observation, and emotional reaction over equipment-heavy literalizations.

## AMBIENT COMMUNITY RULE
This campaign must feel like a real group cruise, not a solo luxury escape and not a managed program.
The group should feel emotionally present through easy togetherness, optional gatherings, visual recognition, and low-pressure human chemistry.
Use the campaign community intent below as hard guidance:
- Core promise: ${communityExpression.corePromise}
- Participation style: ${communityExpression.participationStyle}
- Social gravity: ${communityExpression.socialGravity}
- Optional gatherings: ${communityExpression.optionalGatherings.join('; ')}
- Belonging signals: ${communityExpression.belongingSignals.join('; ')}
- Solitude anti-patterns: ${communityExpression.solitudeAntiPatterns.join('; ')}
- Visual togetherness notes: ${communityExpression.visualTogethernessNotes}
- Copy framing rule: ${communityExpression.copyFramingRule}

## HUMAN REPRESENTATION RULE
People shown in this campaign must feel deliberately and naturally varied.
Use these casting instructions as hard guidance across the still set and scene library:
- Casting goal: ${casting.castingGoal}
- Age range guidance: ${casting.ageRangeGuidance}
- Diversity intent: ${casting.diversityIntent}
- Pairing guidance: ${casting.pairingGuidance}
- Styling guidance: ${casting.stylingGuidance}
- Anti-stereotype rules: ${casting.antiStereotypeRules.join('; ')}
Do not default to one repeated age band, one repeated ethnic presentation, or one default couple type across the set.
When people appear, vary visible backgrounds across the campaign while keeping every subject theme-appropriate, cruise-plausible, and natural.
Never use caricature, exoticizing cues, costume shorthand, or token-background casting.
ALL-AGES EMBEDDING: At least 2 of the 16 specs must show multi-generational or family-adjacent groupings (e.g., parent-teen pair, grandparent pointing something out to a child, a mixed-age table laughing together). These moments must feel organic and story-native — not added as proof of demographic coverage. The niche cue should still be present in the frame.

## EVENT FRAMING RULE
If highlight events mention holidays, seasonal phenomena, festivals, or itinerary-timed natural moments, treat them as atmospheric backdrop unless the campaign is explicitly sold as that event experience.
Those events may shape sky color, light quality, timing, destination mood, and emotional cadence.
They must not automatically create ceremonies, viewing rituals, dedicated gear, repeated event-specific hero beats, or implied onboard programming unless that is truly part of the product.
The viewer should feel "this voyage happens during something special," not "this is secretly an event-program cruise," unless the campaign intentionally says so.

## NICHE RETENTION RULE (CRITICAL)
Every scene and still in this campaign must carry at least one specific, visible connection to the campaign's niche identity.
Generic premium-cruise imagery that could belong to any sailing is not acceptable — even if it is beautiful and vacation-first.
The niche does not need to dominate the frame, but it must be present and identifiable.
For this campaign, niche presence means: ${communityExpression.belongingSignals.join('; ')}.
If a scene cannot include at least one of those signals naturally, replace that scene with one that can.
A scene that reads as "any luxury cruise" rather than "this specific community's cruise" has failed.
FIELD-LEVEL REQUIREMENT: For every landing still spec, the niche identity must appear in the "imagePrompt" field OR the "subjectAction" field — not just in supporting fields. An automated scanner reads imagePrompt and subjectAction first; stills that carry niche identity only in supplementary fields still register as weak or absent. Embed a campaign-specific term, behavior, or belonging signal directly in imagePrompt and subjectAction.

## SOCIAL WARMTH FLOOR
- At least 6 of the 10 scenes must show TWO OR MORE people in relaxed proximity — not just silhouettes or tiny figures.
- "Togetherness" means visible social connection: shared glance, side-by-side seating, over-shoulder glimpse, exchanged smile, or quiet adjacency with eye contact potential.
- Lone silhouettes against a horizon are allowed but capped at 2 of 10 scenes maximum.
- If a scene uses "silhouette" or "lone figure," the next scene must pivot to paired or small-group warmth.
- At least 3 of the 6 landing stills must also show paired or small-cluster togetherness.

## SIGNAL VARIETY RULE
- The full set of scenes and stills must use at least 5 different signal families from:
  wardrobe cue, conversational cue, object cue, architectural/environmental cue, posture/gesture cue, destination-atmosphere cue, behavioral cue, spatial-choice cue.
- No single cue (e.g., "leaf pin", "phone photo", "window seat") may appear in more than 2 of the 16 total specs (10 scenes + 6 stills).
- If the same cue appeared in the previous spec, the next spec must use a different signal family.
- At least 3 specs must communicate the niche purely through interpersonal chemistry, timing, spatial choice, or body language — no visible object or accessory at all.
- ANTI-MONOCULTURE: The accessory-recognition cluster (pin, print, lanyard, phone-photo, icon tee) may carry at most 3 of 16 specs total. These are valid cues but they cannot be the campaign's default vocabulary.
- BEHAVIORAL RECOGNITION CUES (use these to replace accessory dependence): someone leaning in to inspect real shipboard greenery, two guests comparing phone screens of their home plants, a guest adjusting a small potted cutting on their cabin balcony shelf, someone photographing a real onboard planting, guests gravitating toward the same window-side seat near living plants, a couple choosing the table closest to real ferns in the dining room.
- SPATIAL RECOGNITION CUES: guests choosing seats near existing ship greenery, a small cluster naturally forming around an atrium planter, choosing the cabin balcony to tend a travel cutting, gravitating toward the promenade deck's tree-lined section.

## SCENE SPECIFICITY FLOOR
- At least 7 of 10 scenes must be set primarily ONBOARD the ship (deck, cabin, dining room, atrium, pool area, library, corridor, elevator lobby, promenade, sports deck). Onboard means the dominant architecture in the frame is recognizably ship infrastructure.
- A maximum of 2 scenes may use shoreline, harbor, tender, or port-adjacent settings. These must still be anchored by visible ship context (gangway, tender with ship behind, dockside with hull in frame) rather than reading as generic tropical travel.
- Scenes dominated by palms, beach, resort pool, or shoreline architecture without visible ship context are banned. If the setting reads as "any Caribbean resort" rather than "this ship in this port," it has failed.
- Spa, lounge, or generic calm-premium interiors must carry a visible niche signal that distinguishes them from any other cruise campaign. If a spa scene cannot plausibly include a niche cue, replace it with a different ship location.
- Generic tranquility scenes — warm teak, soft light, plush seating, glass of wine — are not allowed unless the niche is woven into the frame through wardrobe, conversation topic, carried object, or environmental detail.
- At least 2 of 10 scenes should use ship-native locations that are under-represented: buffet terrace, embarkation atrium, tender boat with ship behind, gangway with port backdrop, jogging track, library nook, elevator lobby with ocean view.

## REALISM ENVELOPE RULE
- Every scene and still must pass the realism test: "Could a real guest on this ship actually look like this, in this spot, doing this thing?"
- Reject scenes that feel more like fashion editorial, perfume advertising, or art-directed metaphor than believable cruise moments.
- Specifically avoid: dramatic scarf-blowing hero poses, dew-tracing or petal-touching macro moments, fog-shrouded contemplative silhouettes, cinematic rain scenes, and any composition where the styling overwhelms the vacation context.
- Specifically avoid: leaf-shaped shadow dances, leaf-shadow drifts over fabric, leaflike reflections skimming glass. One poetic shadow cue may appear across the entire set. More than one reads as generated motif enforcement, not captured reality.
- If a scene reads as "this would win a photography award" but not as "this is what this cruise actually feels like," dial it back toward warmth, spontaneity, and genuine social ease.
- The campaign's realism bar is VACATION SNAPSHOT, not TRAVEL EDITORIAL. The best images should feel like the luckiest candid from a guest's phone, not a styled magazine shoot.
- GREENERY STAGING RULE: Do not add planters, hanging greenery, potted plants, or tropical foliage to scenes as atmospheric props unless that greenery authentically exists in the specified ship location. Non-native greenery staging is the most common way this campaign drifts into resort-generic or set-dressed territory. If a scene needs a botanical cue, it must come from guest wardrobe, carried object, phone screen, or genuinely ship-resident planting — not a convenient nearby planter.

## EMOTIONAL TARGETS
Every scene must evoke ONE of these feelings: wonder, FOMO, joy, serenity, intimacy, awe, belonging, thrill, magic, freedom.
NO scene should evoke: obligation, seriousness, focus, concentration, rigor, professionalism, or productivity.

## WHAT YOU PRODUCE
1. A LANDING STILL BIBLE of 6 still specs for still-image marketing needs.
2. A SCENE LIBRARY of 10 distinct scenes for motion/storyboard generation.
3. STORYBOARDS for each video deliverable — ordered shot sequences that build desire.

## LEGACY FIX CARRY-FORWARD RULE
You are not generating from a blank slate. The unresolved remediation constraints provided in the prompt are binding. If prior review blocked a pattern, location assumption, motion grammar, or production-planning contradiction, you must explicitly remove or replace it in this new output. Do not silently preserve prior failures.

## LANDING STILL BIBLE RULES
- These are NOT storyboard shots. They are conversion-oriented still-image blueprints.
- Every still must read instantly as a desirable cruise vacation image even with no motion and no sequence context.
- Prioritize headline-safe composition, clean focal hierarchy, and breathing room for copy.
- Keep activity density low. One dominant emotional beat only.
- Prefer 1-3 people max. No dense crowds. No multi-action scenes.
- At least half of the stills should communicate paired or small-cluster togetherness rather than pure solitude.
- Across the still set, vary ages, skin tones, facial features, and pairings in a natural way that fits the campaign's intended audience.
- At least 2 stills must be clearly suitable for primary or alternate landing-page hero use. Assign these usage = "hero_primary" or usage = "hero_alt".
- At least 2 stills must be suitable for concept/editorial section imagery with WIDE or MEDIUM editorial framing. Assign these usage = "concept" or usage = "email_header" and do NOT include the words "intimate", "close", "tight", or "detail" in the composition field of these stills.
- At least 1 still must be an intimate or tight composition that captures a different emotional register. Assign this usage = "concept" and the composition field MUST contain at least one of these exact words: "intimate", "close", "tight", or "detail". This is the intimate/tight role and the automated role-coverage check requires exactly one.
- use usage values only from: hero_primary, hero_alt, concept, email_header, social_square.
- Prefer ocean-forward, rail-side, balcony, promenade, or clean ship-interior compositions over busy event scenes.
- Do not let rail-side, balcony, window, cabin, or promenade fallback become the default answer. Across the 6 stills, at least 3 must anchor in a different location family than rail/balcony/window/cabin contemplation.
- Niche cues must appear naturally — not as the focal subject but as an identifiable, observable detail that proves this community's presence without overwhelming the vacation-first feel.
- A landing still may borrow atmosphere from the scene library, but it should not depend on storyboard-style complexity.

## LANDING STILL NICHE COMPLIANCE — MACHINE-ENFORCED BLOCKER

Every landing still bible is scanned by a deterministic rule engine immediately after generation. Violations are blocking failures that prevent campaign approval and require full regeneration.

SCANNER RULE (weak_niche_signal BLOCKER): if 4 or more of the 6 stills have NO niche term in ANY of the four scanned fields (imagePrompt, subjectAction, environmentDetails, composition), the campaign is blocked.

To pass: aim for ALL 6 stills to carry at least one niche cue in imagePrompt or subjectAction. At most 2 stills may be niche-absent across all four fields.

IDENTITY FLOOR (identity_legibility_too_low BLOCKER): a viewer should be able to name this campaign's community from the still set alone. At least 4 stills must contain a clear community-specific term or behavior in BOTH imagePrompt and subjectAction, not just one field.

PER-STILL GENERATION WORKFLOW — follow for every landing still in order:
1. Write imagePrompt first. The first or second sentence must include a niche-specific behavior, term, or belonging signal naturally within the scene. Do not save it for later in the description.
2. Write subjectAction next. Describe what makes this moment specific to THIS community — not generic vacation behavior. A niche term or community-specific behavior must appear here.
3. Confirm both imagePrompt and subjectAction each contain a niche signal before proceeding.
4. Complete remaining fields (composition, environmentDetails, mood, etc.) and ensure the location family, social unit, and emotional register differ from the previous still before moving on.
IMPORTANT: do not write all 6 stills then retroactively patch niche terms. Embed them at generation time, per step 1, for every still.

## LANDING STILL ROLE SCAFFOLD — GENERATE IN THIS SLOT ORDER

Generate exactly 6 landing stills in this slot order. Each slot specifies the required usage value and composition constraint:
- Slot 1 (HERO_PRIMARY): usage="hero_primary" — wide composition — niche term required in imagePrompt and subjectAction — no cabin/window setup
- Slot 2 (HERO_ALT): usage="hero_alt" — wide or medium composition — niche term required in imagePrompt and subjectAction — use a different location family than Slot 1
- Slot 3 (EDITORIAL_WIDE): usage="concept" or "email_header" — composition must NOT contain intimate/close/tight/detail — niche term required in both fields — must NOT use railing, balcony, or horizon-gaze fallback
- Slot 4 (EDITORIAL_WIDE): usage="concept" or "email_header" — composition must NOT contain intimate/close/tight/detail — niche term required in both fields — must use a different location family and social unit than Slot 3
- Slot 5 (INTIMATE): usage="concept" — composition MUST contain "intimate", "close", "tight", or "detail" — niche term required in both fields — must NOT be a candlelit dining fallback
- Slot 6 (FLEX): usage="hero_alt", "email_header", "social_square", or "concept" — niche term required in imagePrompt or subjectAction — choose the least-used location family so far and avoid repeating the dominant composition family

## SCENE RULES
- mood field: name the VACATION emotion (e.g. "sunset wonder", "playful discovery", "golden hour magic"), never a work emotion (e.g. "focused", "rigorous", "purposeful")
- subjectAction: describe what the person is EXPERIENCING, not what they are DOING. First-person aspiration format.
  GOOD: "laughing as a dolphin surfaces arm's length away", "eyes wide discovering something incredible through a microscope", "barefoot on teak, wind in hair, pointing at the horizon"
  BAD: "participant adjusts microscope focus", "marine biologist deploys plankton net", "lead scientist underlines transect plan"
- Scenes on deck: the OCEAN is a character — vast, turquoise, cinematic. People are IN the moment, not just near it.
- Interior scenes: must feel like a boutique hotel AT SEA — warm lighting, portholes with ocean visible, polished wood, elegant curves. NEVER a conference room, classroom, or generic office.
- Body language: laughing, arms outstretched, leaning over railings in wonder, toasting, hugging, pointing excitedly. NEVER: hunched over work, writing on clipboards, staring at screens, standing in formal rows.
- Rotate cue families across the scene library: interpersonal chemistry, posture, wardrobe detail, architectural framing, harbor atmosphere, and only occasional lightweight object cues.
- At least half of the scene library should communicate the niche without requiring a visible niche object as the center of the frame.
- At least half of the scene library should show ambient togetherness, shared attention, or easy companionship rather than isolated solo presence.
- SOLO/PAIR GRAMMAR: The default social unit for this campaign is ONE or TWO people. Solos and pairs are the campaign's natural scale. Trios and larger groups are the exception, not the rule.
- Allow a maximum of 2 scenes across the entire set (scenes + stills combined) to show 3 or more people together. All other specs must use solo or pair framing.
- Specifically ban from scene descriptions: "a small group," "small trio," "a cluster of friends," "cabana-friend-group," "groups smiling and pointing." These read as general vacation marketing, not this campaign's low-pressure recognition system.
- One family-adjacent moment (parent-teen pair, mixed-age pair) is allowed and may count as one of the pair slots. It should feel incidental and organic, not like a demographic inclusion marker.
- Across the scene library, vary who appears in frame so the campaign does not imply one narrow default guest identity.
- If one scene uses a card, die, token, notebook, pin, or similar object cue, the next scene should pivot away from that family and let people, ship space, or destination atmosphere carry the scene.
- Favor easy social recognition, seat choice, timing, clothing texture, rail-side pauses, and window-side intimacy over repeated prop beats.
- Camera angles vary: wide establishing, low-angle hero, overhead crane, eye-level tracking, intimate close-up, dutch angle, POV.
- For VIDEO scene-library use, humans should not be the ONLY subject — ship, sea, and architecture should share or lead the frame.
- However, backgrounded pairs or small clusters of relaxed guests ARE allowed and encouraged. The goal is "people enjoying a ship," not "empty ship."
- Avoid handheld hero props in video-oriented scenes: no mugs, cups, cocktails, glasses, notebooks, binoculars, or small objects held close to camera when the scene is likely to be animated.
- PHONE EXCEPTION: A phone held at mid-distance showing a plant photo to a friend is an allowed still-image cue. For video-oriented scenes, the phone should be static and backgrounded, not animated.
- referenceCategory must be one of: ${SHIP_REFERENCE_CATEGORIES.join(', ')}. Spread scenes across at least 6 different categories.
- DESTINATION OFFBOARD RULE: If the user provided a specific Destination below, YOU MUST include at least one still image and one storyboard scene using 'offboard_excursion' that captures the essence of that specific location (e.g. tourist exploring a ruin, beautiful recognizable beach, local culture, mountain, port city skyline). Do not use 'offboard_excursion' for generic ocean waves - it MUST be land or local culture focused.
- Cruise-native moments to preserve: ${plausibility.cruiseNativeMoments.join('; ') || 'sunset deck observation; rail-side conversation; ocean-facing stillness; shared discovery at the horizon'}.
- Believable niche-enhanced moments: ${plausibility.nicheEnhancedMoments.join('; ') || 'guided noticing; simple field notes; one lightweight sample jar; binocular or notebook level cues'}.
- Implausible literalizations to ban: ${plausibility.implausibleLiteralizations.join('; ') || 'microscope lab on open deck; classroom workshop staging; equipment-heavy field station setups; conference-style demos'}.
- Allowed props: ${plausibility.allowedProps.join('; ') || 'notebook; binoculars; sample jar; map; field guide'}.
- Discouraged props: ${plausibility.discouragedProps.join('; ') || 'microscope; clipboard stacks; lab bench gear; presentation boards; elaborate instruments'}.

## IMAGE PROMPT RULES
- Each imagePrompt is the SINGLE MOST IMPORTANT field. It drives the generated image directly.
- Write it as a dreamy, evocative scene description — like the opening line of a premium travel magazine feature.
- Start with the FEELING and LIGHT, then the setting, then the people:
  GOOD: "Warm golden light spills across a polished teak deck as two friends lean over the rail, laughing at dolphins racing the bow wake, turquoise Caribbean sea stretching to the horizon"
  BAD: "Two participants on the forward deck conduct a marine mammal census using binoculars and tally sheets"
- ALWAYS include: specific lighting quality, emotional energy, the ocean or ship as backdrop, human connection or joy.
- Prefer non-object signals first: eye contact, movement, spacing, clothing detail, architecture, harbor color, sea air, timing, and emotional cadence.
- If an object cue is used, it must be incidental and must not be repeated as the signature beat of consecutive scenes.
- For scene-library prompts intended for storyboard video, avoid foreground hands, close handheld objects, mugs, cups, glasses, and face-dominant portrait framing.
- Style suffix to include in every prompt: "observational travel photography, natural available light, 35mm film grain, Fuji Velvia warmth, casual editorial, mid-distance candid framing"
- Ship-specific visual language: polished teak promenade rails, curved ship-hull portholes with sea light, Windjammer Café window-side seating, Centrum atrium glass elevators, pool deck sun loungers with ocean beyond. Reference these to anchor images in ship reality rather than generic cruise or resort visual language.
- AVOID in style suffix and prompts: "aspirational," "cinematic bokeh," "f/1.8," "golden hour warmth" as defaults. These push output toward generic premium-travel finish. Use natural mid-day ship light, overcast sea light, or late-afternoon deck light instead.
- BANNED WORDS in imagePrompt: "participant", "conduct", "deploy", "adjust", "conference", "training", "corporate", "business", "focus", "analyze", "study", "examine", "monitor", "record", "clipboard", "whiteboard", "presentation", "organized", "structured", "planter", "hanging greenery", "tropical foliage", "resort pool", "palm-lined".
- REQUIRED ENERGY: every imagePrompt must feel like a real moment you would be glad to have captured, not a shot someone planned and lit.

## LANDING STILL PROMPT RULES
- Each landing still imagePrompt must optimize for a single-frame marketing still rather than a sequence beat.
- Favor negative space, clean horizon lines, simple subject grouping, and uncluttered edges.
- Avoid action chains, dense supporting cast, or multiple competing points of interest.
- The prompt should make the still usable for a homepage hero, alternate hero, or editorial section image without requiring motion.
- Avoid spectacle dependency. The image should still work if the viewer sees it for one second.
- CHANNEL DISTINCTION: Landing stills should feel compositionally different from scene-library shots. Stills favor tight framing, clean negative space, and intimate subject scale. Scenes favor wider establishing framing, environmental depth, and architectural context.
- At least 2 of 6 landing stills should use a framing approach that would NOT work as a scene-library cut — for example, tight crop on hands sharing a phone screen, macro detail of a botanical cuff, or a direct-to-camera smile with ocean bokeh.
- GENERIC FALLBACK BAN: do not solve multiple stills with repeated rail-laughing couples, repeated quiet window solos, repeated candlelit dining intimacy, or repeated wide stern/bow horizon gazes. Any of those families repeated 3 times becomes a blocker; aim to use each family no more than once.
- LOCATION SPREAD: the 6 stills should span at least 4 distinct location families such as promenade, pool edge, dining/lounge, cabin threshold, library/game space, spa/solarium, embarkation/port, or offboard destination context when available.
- SOCIAL SPREAD: include at least one pair moment, one solo moment, and one mixed-age or friendship moment across the set so the campaign identity is not reduced to one repeating guest archetype.
- FINAL SELF-CHECK BEFORE RETURNING THE SET: count how many stills contain a niche term in imagePrompt; count how many contain a niche term in subjectAction; count how many distinct location families appear; count how many stills reuse a generic fallback family. If the counts would trigger weak_niche_signal, identity_legibility_too_low, generic_fallback_overuse, missing_role_coverage, or repeated_composition_family, rewrite before returning.

## STORYBOARD RULES
- Each storyboard must follow an emotional arc: intrigue/hook → building desire → peak euphoria → "this could be you" CTA.
- No two CONSECUTIVE shots may use the same sceneId.
- Camera movements vary per shot: dolly forward, dolly back, crane rise, crane drop, orbit left, orbit right, steadicam tracking, push-in, pull-out, handheld follow, whip pan, slow arc.
- transitionIn/transitionOut use film terminology: hard cut, cross-dissolve, whip pan, match cut, fade from black, fade to black, J-cut, L-cut.
- narrationSegment must sound like a premium travel documentary voiceover — warm, personal, aspirational, making the viewer ache to be there.
- musicCue describes the audio energy: "silence into bass hit", "building synth swell", "full drop", "ambient bed", "fade out".
- Assume downstream image-to-video models are weak at ALL human motion, including tiny limb, face, hand, and prop interactions.
- Do NOT build storyboard shots around human performance. The dominant subject should usually be ship, sea, sky, light, architecture, wake, reflections, or destination atmosphere rather than a person.
- If people appear, they should be incidental background figures, silhouettes, or over-the-shoulder accents only. They must not be foreground heroes, must not hold focal props, and must not be asked to animate.
- subjectMotion should default to no human motion at all. The intended output should read as frozen human presence inside a living environment.
- Let cameraMovement and environmentMotion carry the sensation of life: wake texture, sea shimmer, reflections, clouds, steam, flags, foliage drift, and changing light.
- Avoid designing shots around walking cycles toward camera, dancing, clinking, sipping, pouring, hand-offs, page flipping, card dealing, repeated hand-to-object choreography, or any handheld close-up beat.
- If an object cue appears, it must be static, distant, and non-essential. Prefer removing it entirely from video-facing shots.
- Prefer wide, environment-led frames over portrait-led frames. Avoid close-ups of faces, hands, legs, or side-on full-body walking compositions.
- avoidDirectives must include: "No slideshow parallax", "No static tripod framing", "No repeated camera movement across consecutive shots", "No empty/unpopulated scenes", "No corporate body language", "No generic interiors without ship identity", "No formal or staged poses", "No work-like activities".
`.trim();

    const lintComplianceBlock = buildLintComplianceBlock(campaign, coreAesthetic.communityExpression.belongingSignals);

    const contextPrompt = `
CAMPAIGN CONTEXT (use as inspiration, but ALWAYS reframe through the vacation lens):
Campaign: ${campaign.name}
Ship: ${getCanonicalShipName(campaign)}
Ship Context: ${buildShipContext(campaign)}
Destination: ${campaign.targetDestination || 'TBD'}
Highlight Events: ${joinCampaignList(sanitizePromptList(campaign.highlightEvents))}
Event Framing Guidance: ${buildEventFramingGuidance(campaign)}
Aesthetic: ${visual.aestheticLabel}
Imagery Mood: ${visual.imageryMood}
Lighting: ${visual.lightingStyle}
Composition: ${visual.compositionNotes}
Color Palette: Primary ${visual.colorPalette.primary}, Secondary ${visual.colorPalette.secondary}, Accent ${visual.colorPalette.accent}
Casting Goal: ${casting.castingGoal}
Age Range Guidance: ${casting.ageRangeGuidance}
Diversity Intent: ${casting.diversityIntent}
Pairing Guidance: ${casting.pairingGuidance}
Styling Guidance: ${casting.stylingGuidance}
Anti-Stereotype Rules: ${casting.antiStereotypeRules.join('; ')}
Tone: ${messaging.toneKeywords.join(', ')}
Hero Slogan: ${messaging.heroSlogan}
Elevator Pitch: ${messaging.elevatorPitch}
Community Core Promise: ${communityExpression.corePromise}
Participation Style: ${communityExpression.participationStyle}
Social Gravity: ${communityExpression.socialGravity}
Optional Gatherings: ${communityExpression.optionalGatherings.join('; ')}
Belonging Signals: ${communityExpression.belongingSignals.join('; ')}
Solitude Anti-Patterns: ${communityExpression.solitudeAntiPatterns.join('; ')}
Visual Togetherness Notes: ${communityExpression.visualTogethernessNotes}
Copy Framing Rule: ${communityExpression.copyFramingRule}
Music Mood: ${audio.musicMood}

${remediationContext}

${lintComplianceBlock}

REMINDER: The above describes the campaign THEME. Your job is to turn that theme into VACATION DAYDREAM imagery — artsy, warm, joyful, never formal or serious.
Plausibility Governing Principle: ${plausibility.governingPrinciple}
TikTok Hook: ${tiktokHook}
TikTok CTA: ${tiktokCTA}

Video Deliverables to storyboard:
${VIDEO_DELIVERABLES.map(d => `- ${d.id}: "${d.title}" (${d.durationSeconds}s, ${d.shotCount} shots)`).join('\n')}
`.trim();

    const { object: visualPlanning } = await callGlobalGenerateObject({
        modelName: ModelName.GPT_5_HIGH,
        schema: VisualPlanningBundleSchema,
        system: systemPromptPass3,
        prompt: contextPrompt,
        maxOutputTokens: 12000,
        operationName: `visual-planning:${campaign.id}`,
    });

    return visualPlanning;
}
