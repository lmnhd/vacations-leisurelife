import { CampaignAestheticBrief, ShipReferenceCandidate, SceneSpec } from '../../schema';
import { NANO_BANANA_CONFIG } from '../media-pipeline-config';

// ────────────────────────────────────────────────────────────────────────────
// Stability AI Image Generator
// Primary hero image + aesthetic concept art generation.
// All settings controlled via STABILITY_CONFIG in media-pipeline-config.ts.
// ────────────────────────────────────────────────────────────────────────────

function getApiKey(): string {
    const key = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY not set in environment');
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

async function generateNanoBananaImage(
    prompt: string,
    aspectRatio: typeof NANO_BANANA_CONFIG.heroAspectRatio | typeof NANO_BANANA_CONFIG.conceptAspectRatio | typeof NANO_BANANA_CONFIG.merchAspectRatio,
    imageSize: typeof NANO_BANANA_CONFIG.heroImageSize | typeof NANO_BANANA_CONFIG.conceptImageSize | typeof NANO_BANANA_CONFIG.merchImageSize,
    referenceImage?: Buffer,
    referenceMimeType?: string
): Promise<Buffer> {
    const parts = referenceImage
        ? [
            { text: prompt },
            {
                inline_data: {
                    mime_type: referenceMimeType ?? 'image/jpeg',
                    data: referenceImage.toString('base64'),
                },
            },
        ]
        : [{ text: prompt }];

    const response = await fetch(
        `${NANO_BANANA_CONFIG.apiBase}/models/${NANO_BANANA_CONFIG.model}:generateContent`,
        {
            method: 'POST',
            headers: {
                'x-goog-api-key': getApiKey(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{ role: 'user', parts }],
                generationConfig: {
                    responseModalities: ['TEXT', 'IMAGE'],
                    imageConfig: {
                        aspectRatio,
                        imageSize,
                    },
                },
            }),
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Nano-Banana error ${response.status}: ${errorText}`);
    }

    const payload = await response.json() as {
        candidates?: Array<{
            content?: {
                parts?: Array<{
                    text?: string;
                    inlineData?: { data?: string; mimeType?: string };
                    inline_data?: { data?: string; mime_type?: string };
                }>;
            };
        }>;
    };
    const contentParts = payload.candidates?.[0]?.content?.parts ?? [];
    const imagePart = contentParts.find((part) => part.inlineData?.data || part.inline_data?.data);
    const imageData = imagePart?.inlineData?.data ?? imagePart?.inline_data?.data;

    if (!imageData) {
        throw new Error('Nano-Banana did not return an image payload');
    }

    return Buffer.from(imageData, 'base64');
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
    count: number = 5
): Promise<GeneratedImage[]> {
    const prompts = buildHeroPrompts(brief, shipName).slice(0, count);
    const results: GeneratedImage[] = [];

    for (let i = 0; i < prompts.length; i++) {
        const buffer = await generateNanoBananaImage(
            prompts[i],
            NANO_BANANA_CONFIG.heroAspectRatio,
            NANO_BANANA_CONFIG.heroImageSize
        );
        const idx = String(i + 1).padStart(3, '0');
        results.push({
            buffer,
            prompt: prompts[i],
            assetId: `img_hero_${idx}`,
            fileName: `images/hero/hero_${idx}_source.png`,
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
    const referenceResponse = await fetch(referenceCandidate.imageUrl);
    if (!referenceResponse.ok) {
        throw new Error(`Failed to fetch hero reference image (${referenceResponse.status}): ${referenceCandidate.imageUrl}`);
    }
    const referenceBuffer = Buffer.from(await referenceResponse.arrayBuffer());
    const referenceMimeType = referenceResponse.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
    const results: GeneratedImage[] = [];

    for (let index = 0; index < count; index += 1) {
        const transformedBuffer = await generateNanoBananaImage(
            prompt,
            NANO_BANANA_CONFIG.heroAspectRatio,
            NANO_BANANA_CONFIG.heroImageSize,
            referenceBuffer,
            referenceMimeType
        );
        const itemIndex = String(index + 1).padStart(3, '0');
        results.push({
            buffer: transformedBuffer,
            prompt,
            assetId: `img_hero_${itemIndex}`,
            fileName: `images/hero/hero_${itemIndex}_embellished.png`,
        });
    }

    return results;
}

export async function generateAestheticConcepts(
    brief: CampaignAestheticBrief,
    count: number = 4
): Promise<GeneratedImage[]> {
    const prompts = buildConceptPrompts(brief).slice(0, count);
    const results: GeneratedImage[] = [];

    for (let i = 0; i < prompts.length; i++) {
        const buffer = await generateNanoBananaImage(
            prompts[i],
            NANO_BANANA_CONFIG.conceptAspectRatio,
            NANO_BANANA_CONFIG.conceptImageSize
        );
        const idx = String(i + 1).padStart(3, '0');
        results.push({
            buffer,
            prompt: prompts[i],
            assetId: `img_concept_${idx}`,
            fileName: `images/concepts/concept_${idx}.png`,
        });
    }

    return results;
}

// ────────────────────────────────────────────────────────────────────────────
// Scene-Driven Image Generation (Production Bible)
// Each scene in the library gets its own distinct source image.
// ────────────────────────────────────────────────────────────────────────────

export interface GeneratedSceneImage extends GeneratedImage {
    sceneId: string;
}

export async function generateSceneImages(
    scenes: readonly SceneSpec[],
    shipReferences: readonly ShipReferenceCandidate[],
    shipName: string
): Promise<GeneratedSceneImage[]> {
    const results: GeneratedSceneImage[] = [];

    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const matchedReference = shipReferences.find(
            (ref) => ref.category === scene.referenceCategory
        );

        const enrichedPrompt = [
            scene.imagePrompt,
            `Scene location: ${scene.location}`,
            `Time of day: ${scene.timeOfDay}`,
            `Lighting: ${scene.lighting}`,
            `Camera angle: ${scene.cameraAngle}`,
            `Subject action: ${scene.subjectAction}`,
            `Environment: ${scene.environmentDetails}`,
            `Mood: ${scene.mood}`,
            shipName !== 'TBD' ? `Ship: ${shipName}` : '',
            'Photorealistic, cinematic, 8K, editorial travel photography',
        ].filter(Boolean).join('. ');

        let buffer: Buffer;
        if (matchedReference) {
            const refResponse = await fetch(matchedReference.imageUrl);
            if (refResponse.ok) {
                const refBuffer = Buffer.from(await refResponse.arrayBuffer());
                const refMime = refResponse.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
                buffer = await generateNanoBananaImage(
                    enrichedPrompt,
                    NANO_BANANA_CONFIG.heroAspectRatio,
                    NANO_BANANA_CONFIG.heroImageSize,
                    refBuffer,
                    refMime
                );
            } else {
                buffer = await generateNanoBananaImage(
                    enrichedPrompt,
                    NANO_BANANA_CONFIG.heroAspectRatio,
                    NANO_BANANA_CONFIG.heroImageSize
                );
            }
        } else {
            buffer = await generateNanoBananaImage(
                enrichedPrompt,
                NANO_BANANA_CONFIG.heroAspectRatio,
                NANO_BANANA_CONFIG.heroImageSize
            );
        }

        const idx = String(i + 1).padStart(3, '0');
        results.push({
            buffer,
            prompt: enrichedPrompt,
            assetId: `img_scene_${scene.sceneId}_${idx}`,
            fileName: `images/scenes/${scene.sceneId}_${idx}.png`,
            sceneId: scene.sceneId,
        });
    }

    return results;
}
