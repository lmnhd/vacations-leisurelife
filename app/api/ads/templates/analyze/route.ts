import { NextResponse } from 'next/server';
import { z } from 'zod/v3';
import { callLLM, modelForTask } from '@/lib/ai/llm-gateway';

const SlotSuggestionSchema = z.object({
    name: z.string().min(1),
    type: z.enum(['text', 'image', 'color']),
    visualOrder: z.number().int().positive(),
    zone: z.enum(['header', 'hero', 'tile_grid', 'body', 'footer', 'overlay']),
    maxChars: z.number().int().positive().optional(),
    maxWords: z.number().int().positive().optional(),
    maxLines: z.number().int().positive().optional(),
    copyRole: z.string().optional(),
    copyInstruction: z.string().optional(),
    disallow: z.array(z.string()).optional(),
    preferredAssetTypes: z.array(z.enum(['scene_image', 'ship_reference', 'hero', 'aesthetic_concept', 'still', 'merch'])).optional(),
});

const ALLOWED_ASSET_TYPES = ['scene_image', 'ship_reference', 'hero', 'aesthetic_concept', 'still', 'merch'] as const;
type AllowedAssetType = (typeof ALLOWED_ASSET_TYPES)[number];

const ASSET_TYPE_ALIASES: Record<string, AllowedAssetType> = {
    action: 'scene_image',
    activity: 'scene_image',
    candid: 'scene_image',
    detail: 'still',
    environment: 'aesthetic_concept',
    landscape: 'aesthetic_concept',
    lifestyle: 'scene_image',
    mood: 'aesthetic_concept',
    object: 'still',
    portrait: 'hero',
    product: 'merch',
    scenery: 'aesthetic_concept',
    scenic: 'aesthetic_concept',
    texture: 'still',
};

function normalizePreferredAssetTypes(value: unknown): AllowedAssetType[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const normalized: AllowedAssetType[] = [];
    for (const item of value) {
        const raw = String(item ?? '').trim().toLowerCase();
        const mapped = ALLOWED_ASSET_TYPES.includes(raw as AllowedAssetType)
            ? raw as AllowedAssetType
            : ASSET_TYPE_ALIASES[raw];
        if (mapped && !normalized.includes(mapped)) {
            normalized.push(mapped);
        }
    }
    return normalized.length > 0 ? normalized : undefined;
}

function normalizeAnalysisPayload(payload: unknown): unknown {
    if (!payload || typeof payload !== 'object') return payload;
    const record = payload as Record<string, unknown>;
    if (!Array.isArray(record.slotDescriptors)) return payload;

    return {
        ...record,
        slotDescriptors: record.slotDescriptors.map((slot) => {
            if (!slot || typeof slot !== 'object') return slot;
            const slotRecord = slot as Record<string, unknown>;
            const preferredAssetTypes = normalizePreferredAssetTypes(slotRecord.preferredAssetTypes);
            if (!preferredAssetTypes) return slot;
            return {
                ...slotRecord,
                preferredAssetTypes,
            };
        }),
    };
}

const TemplateAnalysisSchema = z.object({
    layoutDescription: z.string().min(20),
    suggestedFormat: z.enum([
        'meta_feed_square',
        'meta_feed_portrait',
        'meta_story_reel',
        'meta_carousel_square',
        'google_display_landscape',
        'google_display_square',
        'google_display_vertical',
        'ig_square',
        'fb_google_display',
        'story_reel',
        'carousel',
    ]).optional(),
    suggestedDimensions: z.object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
    }).optional(),
    visualFlavorNotes: z.string().optional(),
    slotDescriptors: z.array(SlotSuggestionSchema).min(1),
    warnings: z.array(z.string()).default([]),
});

const RequestSchema = z.object({
    image: z.object({
        base64: z.string().min(1),
        mimeType: z.string().min(1),
    }),
    context: z.object({
        templateId: z.string().optional(),
        format: z.string().optional(),
        dimensions: z.string().optional(),
        visualFlavor: z.string().optional(),
        notes: z.string().optional(),
    }).optional(),
});

function extractJsonObject(content: string): unknown {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = fenced?.[1] ?? content;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
        throw new Error('The model did not return a JSON object.');
    }
    return JSON.parse(candidate.slice(start, end + 1));
}

export async function POST(req: Request) {
    try {
        const body = RequestSchema.parse(await req.json());
        const prompt = `You are helping register a Canva/Templated.io ad template.

Inspect the screenshot and infer the reusable template metadata. The screenshot may show either the visual design, the Templated.io layer panel, or both.

Return ONLY JSON with this shape:
{
  "layoutDescription": "one plain-English sentence describing the reusable layout anatomy, without campaign-specific niche names",
  "suggestedFormat": "meta_feed_square | meta_feed_portrait | meta_story_reel | meta_carousel_square | google_display_landscape | google_display_square | google_display_vertical",
  "suggestedDimensions": { "width": 1080, "height": 1920 },
  "visualFlavorNotes": "short reusable style notes",
  "slotDescriptors": [
    {
      "name": "exact_or_suggested_layer_name",
      "type": "text | image | color",
      "visualOrder": 1,
      "zone": "header | hero | tile_grid | body | footer | overlay",
      "maxChars": 18,
      "maxWords": 3,
      "maxLines": 2,
      "copyRole": "what this slot does creatively",
      "copyInstruction": "specific instruction for Copy Forge",
      "disallow": ["date", "port", "ship", "route"],
      "preferredAssetTypes": ["hero", "scene_image", "still"]
    }
  ],
  "warnings": ["anything the operator should verify manually"]
}

Rules:
- Do not hardcode a campaign niche like wellness, board games, LGBTQ, food, etc. into the template identity.
- Stable variable names are preferred: headline, subhead, microcopy, cta, background-image, hero_image, tile_image_1.
- If the layer panel shows exact names, use those exact names.
- If exact layer names are not visible, suggest sensible names and add a warning.
- Treat visible placeholder text as intentional sizing guidance. Infer maxChars, maxWords, and maxLines from the placeholder text length, wrapping, font size, and available box size. The placeholder words are sizing examples, not campaign copy to preserve.
- Avoid budgets that are much smaller than the visible placeholder unless the text is visibly overflowing. Avoid budgets that are larger than the placeholder can safely hold.
- Only include slots that the renderer needs to replace: variable text, variable image, or variable color layers.
- Ignore decorative/static template layers such as shapes, page curls/corners, masks, frames, background decorations, overlays, lockups, and other fixed design elements unless they are explicitly intended to be replaced by data.
- Be wary of layer-panel visibility icons. If a layer appears hidden/crossed out, do not include it as a slot unless the operator notes say it should be used.
- If a visible layer name is decorative, such as "shape-1" or "page-corner", do not include it in slotDescriptors; mention it in warnings only if it might confuse the operator.
- Make text budgets conservative based on visual size.
- For image slots, include copyRole, copyInstruction, and preferredAssetTypes.
- preferredAssetTypes must use ONLY these manifest asset pool names: scene_image, ship_reference, hero, aesthetic_concept, still, merch.
- Do not use descriptive labels like landscape, lifestyle, portrait, detail, product, or action in preferredAssetTypes. Put those concepts in copyRole or copyInstruction instead.
- For text slots, include maxChars, maxWords, maxLines, copyRole, copyInstruction, and disallow where relevant.
- Use these precise canvas sizes when inferring format/dimensions:
  - meta_feed_square: 1080 x 1080 (1:1)
  - meta_feed_portrait: 1080 x 1350 (4:5)
  - meta_story_reel: 1080 x 1920 (9:16)
  - meta_carousel_square: 1080 x 1080 (1:1 card)
  - google_display_landscape: 1200 x 628 (1.91:1)
  - google_display_square: 1200 x 1200 (1:1)
  - google_display_vertical: 900 x 1600 (9:16)

Operator context:
${JSON.stringify(body.context ?? {}, null, 2)}`;

        const response = await callLLM(modelForTask('creative'), prompt, {
            systemPrompt: 'You extract structured reusable ad template metadata from screenshots. Return valid JSON only.',
            temperature: 0.1,
            maxTokens: 2500,
            images: [body.image],
        });

        const parsed = TemplateAnalysisSchema.parse(normalizeAnalysisPayload(extractJsonObject(response.content)));
        return NextResponse.json({ analysis: parsed, modelId: response.model });
    } catch (error) {
        console.error('[ads:templates:analyze]', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({
                error: 'Template analysis returned invalid metadata.',
                issues: error.issues,
            }, { status: 400 });
        }
        const message = error instanceof Error ? error.message : 'Template screenshot analysis failed.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
