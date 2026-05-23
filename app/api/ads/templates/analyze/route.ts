import { NextResponse } from 'next/server';
import { z } from 'zod';
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

const TemplateAnalysisSchema = z.object({
    layoutDescription: z.string().min(20),
    suggestedFormat: z.enum(['ig_square', 'fb_google_display', 'story_reel', 'carousel']).optional(),
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
  "suggestedFormat": "story_reel | ig_square | fb_google_display | carousel",
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
- Make text budgets conservative based on visual size.
- For image slots, include copyRole, copyInstruction, and preferredAssetTypes.
- For text slots, include maxChars, maxWords, maxLines, copyRole, copyInstruction, and disallow where relevant.

Operator context:
${JSON.stringify(body.context ?? {}, null, 2)}`;

        const response = await callLLM(modelForTask('creative'), prompt, {
            systemPrompt: 'You extract structured reusable ad template metadata from screenshots. Return valid JSON only.',
            temperature: 0.1,
            maxTokens: 2500,
            images: [body.image],
        });

        const parsed = TemplateAnalysisSchema.parse(extractJsonObject(response.content));
        return NextResponse.json({ analysis: parsed, modelId: response.model });
    } catch (error) {
        console.error('[ads:templates:analyze]', error);
        const message = error instanceof Error ? error.message : 'Template screenshot analysis failed.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
