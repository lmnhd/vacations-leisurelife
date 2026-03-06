import { CampaignAestheticBrief, ShipReferenceCandidate } from '../../schema';
import { STABILITY_CONFIG } from '../media-pipeline-config';

// ────────────────────────────────────────────────────────────────────────────
// Stability AI Image Generator
// Primary hero image + aesthetic concept art generation.
// All settings controlled via STABILITY_CONFIG in media-pipeline-config.ts.
// ────────────────────────────────────────────────────────────────────────────

function getApiKey(): string {
    const key = process.env.STABILITY_API_KEY;
    if (!key) throw new Error('STABILITY_API_KEY not set in environment');
    return key;
}

function buildHeroPrompts(brief: CampaignAestheticBrief, shipName: string): string[] {
    const { imageryMood, lightingStyle, compositionNotes } = brief.visual;

    const scenes = [
        `Wide exterior deck shot on ${shipName}, panoramic ocean view, ship architecture prominent`,
        `${brief.themeName} themed event happening on deck of ${shipName}, participants engaged in niche activity`,
        `Intimate luxury stateroom interior on ${shipName}, aspirational lifestyle, premium cabin details`,
        `Social gathering of ${brief.themeName} enthusiasts on ${shipName}, group energy, community connection`,
        `Destination port arrival from deck of ${shipName}, exotic port in background, golden hour`,
    ];

    return scenes.map(scene =>
        `${imageryMood}, ${scene}, ${lightingStyle}, ${compositionNotes}, editorial travel photography, photorealistic, 8k`
    );
}

function buildConceptPrompts(brief: CampaignAestheticBrief): string[] {
    const { aestheticLabel, imageryMood, colorPalette, lightingStyle } = brief.visual;

    const concepts = [
        `${aestheticLabel} aesthetic mood, abstract representation, ${colorPalette.primary} dominant palette`,
        `${aestheticLabel} lifestyle essence, aspirational feeling, ${colorPalette.secondary} and ${colorPalette.accent} tones`,
        `${aestheticLabel} atmosphere, ethereal quality, ${imageryMood}`,
        `${aestheticLabel} design elements, pattern and texture study, ${colorPalette.primary} and ${colorPalette.background}`,
    ];

    return concepts.map(concept =>
        `${concept}, ${lightingStyle}, conceptual editorial, high contrast, artistic composition`
    );
}

function buildNicheHeroDetails(brief: CampaignAestheticBrief): string {
    const instagramVisual = brief.socialConcepts.instagramFeed.singlePostConcept;
    const reelVisual = brief.socialConcepts.instagramReels.visualConcept;
    const adVisual = brief.socialConcepts.facebookAd.visualDescription;
    const heroExplainerBackground = brief.videoConcepts.heroExplainer.backgroundDescription;
    const merchAesthetic = brief.merch.conceptStatement;

    return [
        `Niche visual world: ${instagramVisual}`,
        `Motion-inspired atmosphere: ${reelVisual}`,
        `Ad-surface styling cues: ${adVisual}`,
        `Hero scene background language: ${heroExplainerBackground}`,
        `Merch and group identity styling: ${merchAesthetic}`,
    ].join('. ');
}

function buildReferenceGroundedHeroPrompt(brief: CampaignAestheticBrief, shipName: string, candidate: ShipReferenceCandidate): string {
    const { aestheticLabel, imageryMood, lightingStyle, compositionNotes, colorPalette } = brief.visual;
    const toneKeywords = brief.messaging.toneKeywords.join(', ');
    const heroSlogan = brief.messaging.heroSlogan;
    const nicheHeroDetails = buildNicheHeroDetails(brief);
    return [
        `Transform this real photo of ${shipName} into a premium niche campaign hero image while preserving the ship identity, architecture, deck geometry, and believable photographic realism`,
        `Use ${candidate.category.replace(/_/g, ' ')} as the anchor scene and keep the vessel clearly recognizable`,
        `Apply ${aestheticLabel} atmosphere, ${imageryMood}, ${lightingStyle}, ${compositionNotes}`,
        nicheHeroDetails,
        `Embellish the scene with bold niche-coded art direction, immersive themed set dressing, wardrobe cues, props, signage, lighting treatments, and refined surreal environmental storytelling that make the community identity obvious at a glance`,
        `Incorporate the campaign palette through lighting and atmosphere only: ${colorPalette.primary}, ${colorPalette.secondary}, ${colorPalette.accent}, ${colorPalette.background}`,
        `Reflect the campaign slogan energy: ${heroSlogan}`,
        `Tone direction: ${toneKeywords}`,
        `Create a luxurious, polished, aspirational hero frame with depth, spectacle, stylized atmosphere, and emotional resonance` ,
        `The final image must feel like a branded campaign key art frame for a very specific subculture gathering at sea, not a generic cruise brochure photo`,
        `Avoid cartoon fantasy, generic tourism visuals, plain documentary realism, and loss of ship fidelity`,
    ].join('. ');
}

async function generateImage(
    prompt: string,
    negativePrompt: string,
    aspectRatio: typeof STABILITY_CONFIG.heroAspectRatio | typeof STABILITY_CONFIG.conceptAspectRatio
): Promise<Buffer> {
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('negative_prompt', negativePrompt);
    formData.append('aspect_ratio', aspectRatio);
    formData.append('output_format', STABILITY_CONFIG.outputFormat);

    const response = await fetch(
        `${STABILITY_CONFIG.apiBase}${STABILITY_CONFIG.endpoint}`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getApiKey()}`,
                'Accept': 'image/*',
            },
            body: formData,
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Stability AI error ${response.status}: ${errorText}`);
    }

    return Buffer.from(await response.arrayBuffer());
}

async function generateImageFromReference(
    prompt: string,
    negativePrompt: string,
    referenceImage: Buffer,
    aspectRatio: typeof STABILITY_CONFIG.heroAspectRatio | typeof STABILITY_CONFIG.conceptAspectRatio
): Promise<Buffer> {
    const referenceImageBytes = new Uint8Array(referenceImage);
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('negative_prompt', negativePrompt);
    formData.append('aspect_ratio', aspectRatio);
    formData.append('output_format', STABILITY_CONFIG.outputFormat);
    formData.append('strength', String(STABILITY_CONFIG.referenceTransformStrength));
    formData.append('image', new Blob([referenceImageBytes], { type: 'image/jpeg' }), 'reference.jpg');

    const response = await fetch(
        `${STABILITY_CONFIG.apiBase}${STABILITY_CONFIG.endpoint}`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getApiKey()}`,
                'Accept': 'image/*',
            },
            body: formData,
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Stability AI error ${response.status}: ${errorText}`);
    }

    return Buffer.from(await response.arrayBuffer());
}

export interface GeneratedImage {
    buffer: Buffer;
    prompt: string;
    assetId: string;
    fileName: string;
}

export async function generateHeroImages(
    brief: CampaignAestheticBrief,
    shipName: string,
    count: number = STABILITY_CONFIG.heroCount
): Promise<GeneratedImage[]> {
    const prompts = buildHeroPrompts(brief, shipName).slice(0, count);
    const negativePrompt = brief.visual.avoidList.join(', ');
    const results: GeneratedImage[] = [];

    for (let i = 0; i < prompts.length; i++) {
        const buffer = await generateImage(prompts[i], negativePrompt, STABILITY_CONFIG.heroAspectRatio);
        const idx = String(i + 1).padStart(3, '0');
        results.push({
            buffer,
            prompt: prompts[i],
            assetId: `img_hero_${idx}`,
            fileName: `images/hero/hero_${idx}_source.webp`,
        });
    }

    return results;
}

export async function generateReferenceGroundedHeroImages(
    brief: CampaignAestheticBrief,
    shipName: string,
    referenceCandidate: ShipReferenceCandidate,
    count: number = 1
): Promise<GeneratedImage[]> {
    const prompt = buildReferenceGroundedHeroPrompt(brief, shipName, referenceCandidate);
    const negativePrompt = [...brief.visual.avoidList, 'cartoon', 'illustration', 'diagram', 'floor plan', 'logo', 'deformed ship', 'wrong ship'].join(', ');
    const referenceResponse = await fetch(referenceCandidate.imageUrl);
    if (!referenceResponse.ok) {
        throw new Error(`Failed to fetch hero reference image (${referenceResponse.status}): ${referenceCandidate.imageUrl}`);
    }
    const referenceBuffer = Buffer.from(await referenceResponse.arrayBuffer());
    const results: GeneratedImage[] = [];

    for (let index = 0; index < count; index += 1) {
        const transformedBuffer = await generateImageFromReference(
            prompt,
            negativePrompt,
            referenceBuffer,
            STABILITY_CONFIG.heroAspectRatio
        );
        const itemIndex = String(index + 1).padStart(3, '0');
        results.push({
            buffer: transformedBuffer,
            prompt,
            assetId: `img_hero_${itemIndex}`,
            fileName: `images/hero/hero_${itemIndex}_embellished.${STABILITY_CONFIG.outputFormat}`,
        });
    }

    return results;
}

export async function generateAestheticConcepts(
    brief: CampaignAestheticBrief,
    count: number = STABILITY_CONFIG.conceptCount
): Promise<GeneratedImage[]> {
    const prompts = buildConceptPrompts(brief).slice(0, count);
    const negativePrompt = brief.visual.avoidList.join(', ');
    const results: GeneratedImage[] = [];

    for (let i = 0; i < prompts.length; i++) {
        const buffer = await generateImage(prompts[i], negativePrompt, STABILITY_CONFIG.conceptAspectRatio);
        const idx = String(i + 1).padStart(3, '0');
        results.push({
            buffer,
            prompt: prompts[i],
            assetId: `img_concept_${idx}`,
            fileName: `images/concepts/concept_${idx}.webp`,
        });
    }

    return results;
}
