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
    const docDirection = brief.productionBible?.globalDirectionNotes ?? compositionNotes;

    // Use Production Bible scene library as examples if available
    const scenes = brief.productionBible?.sceneLibrary.slice(0, 5).map(scene => ({
        description: scene.subjectAction,
        location: scene.location,
        mood: scene.mood,
    })) ?? [
        { description: 'hands-on activity with deck backdrop', location: `${shipName} exterior deck`, mood: 'authentic engagement' },
        { description: 'focused participant work or discovery moment', location: `${shipName} observation area`, mood: 'genuine curiosity' },
        { description: 'community moment around shared activity', location: `${shipName} social gathering space`, mood: 'collaborative energy' },
        { description: 'individual against horizon or landscape', location: `${shipName} observation point`, mood: 'personal connection' },
        { description: 'detailed work in progress, hands or tools visible', location: `${shipName} activity deck`, mood: 'unvarnished focus' },
    ];

    return scenes.map(scene =>
        [
            `On ${shipName}`,
            `Scene: ${scene.description} at ${scene.location}`,
            `Mood: ${scene.mood}, ${imageryMood}`,
            `Atmosphere: ${docDirection}`,
            `Lighting: ${lightingStyle}`,
            `Composition: ${compositionNotes}`,
            `Style: Documentary-authentic photography, photorealistic, grounded reality (not cinematic fantasy), 8k`,
            `Avoid: generic cruise imagery, over-polished styling, empty luxury, staged poses`,
        ].join('. ')
    );
}

function buildConceptPrompts(brief: CampaignAestheticBrief): string[] {
    const { aestheticLabel, imageryMood, colorPalette, lightingStyle, avoidList } = brief.visual;
    const docDirection = brief.productionBible?.globalDirectionNotes ?? '';

    const concepts = [
        `${aestheticLabel}: authentic activity moment on deck with ${colorPalette.primary} accents and ${imageryMood} atmosphere; documentary style`,
        `${aestheticLabel} lifestyle essence through ${colorPalette.secondary} and ${colorPalette.accent} tones; hands-on activity, genuine engagement`,
        `${aestheticLabel} scene atmosphere, ${imageryMood}, grounded reality; ${lightingStyle}; human-centered composition`,
        `${aestheticLabel} visual identity through color and mood: ${colorPalette.primary} dominant with ${colorPalette.background} clarity; documentary authenticity`,
    ];

    return concepts.map(concept =>
        [
            concept,
            `Direction: ${docDirection.slice(0, 100)}...`,
            `Style: Photorealistic, documentary-authentic, grounded in reality`,
            `Avoid: generic luxury imagery, over-designed concept art, fantasy elements, loss of authenticity`,
        ].join('. ')
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
    const { aestheticLabel, imageryMood, lightingStyle, compositionNotes, colorPalette, avoidList } = brief.visual;
    const toneKeywords = brief.messaging.toneKeywords.join(', ');
    const heroSlogan = brief.messaging.heroSlogan;
    
    // Extract Production Bible direction if available
    const docDirection = brief.productionBible?.globalDirectionNotes ?? '';
    const avoidDirectives = brief.productionBible?.avoidDirectives ?? [];
    const sceneExamples = brief.productionBible?.sceneLibrary.slice(0, 3).map(s => 
        `${s.location}: ${s.subjectAction} (${s.mood})`
    ).join('; ') ?? '';

    const avoidText = [...(avoidList ?? []), ...avoidDirectives].join(', ').slice(0, 150);

    return [
        `Transform this photo of ${shipName} into an authentic campaign hero image preserving ship identity, architecture, deck geometry, and photographic realism`,
        `Use ${candidate.category.replace(/_/g, ' ')} as the anchor scene`,
        `Campaign identity: ${aestheticLabel}`,
        `Slogan energy: "${heroSlogan}"`,
        `Visual direction from scene library:`,
        `  ${sceneExamples}`,
        `Overall production direction: ${docDirection}`,
        `Mood and tone: ${imageryMood}, ${lightingStyle}; ${toneKeywords}`,
        `Art direction: Feature real activity, hands-on work, genuine human moments, clear subject engagement`,
        `Apply campaign palette through lighting and atmosphere: ${colorPalette.primary}, ${colorPalette.secondary}, ${colorPalette.accent}`,
        `Wardrobe, props, and environment should reflect the niche identity naturally—not through over-designed set dressing`,
        `Style: Documentary-authentic photography; grounded reality; photorealistic; depth and natural composition`,
        `Critical: The image must feel like a moment captured from real life on this ship, not a fantasy render or over-styled editorial shoot`,
        `AVOID: ${avoidText}; fantasy sci-fi props; cinematic color grades; empty luxury; generic cruise tourism; loss of ship authenticity`,
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
            // Style + emotional framing FIRST — highest weight for image gen
            'Luxury travel editorial photography, dreamy and aspirational, warm cinematic color grade, shallow depth of field, golden-hour warmth, Condé Nast Traveler aesthetic',
            `Mood: ${scene.mood}`,
            // Primary creative direction from Production Bible
            scene.imagePrompt,
            // Atmosphere context (no task descriptions)
            `Setting: ${scene.location}`,
            `Time: ${scene.timeOfDay}`,
            `Light: ${scene.lighting}`,
            `Framing: ${scene.cameraAngle}`,
            shipName !== 'TBD' ? `Aboard the ${shipName}` : '',
            // Reinforce: vacation, not work
            'People enjoying themselves, relaxed and joyful, vacation energy, NOT posed or corporate, NOT staged or formal',
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

// ────────────────────────────────────────────────────────────────────────────
// Prompt-driven single image generation — used by revision regeneration
// ────────────────────────────────────────────────────────────────────────────

export async function generateImageFromPrompt(prompt: string): Promise<Buffer> {
    return generateNanoBananaImage(
        prompt,
        NANO_BANANA_CONFIG.heroAspectRatio,
        NANO_BANANA_CONFIG.heroImageSize
    );
}
