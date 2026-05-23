import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const SlotDescriptorSchema = z.object({
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

const TemplateEntrySchema = z.object({
    templated_id: z.string().min(1),
    templated_id_previous: z.string().nullable(),
    dimensions: z.object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
    }),
    layout: z.object({
        description: z.string().min(10),
        slotDescriptors: z.array(SlotDescriptorSchema).min(1),
    }),
    pages: z.number().int().positive().optional(),
});

const PutRequestSchema = z.object({
    workflow: z.enum(['group_campaign', 'cb_deal']),
    visualFlavor: z.string().min(1),
    format: z.enum(['ig_square', 'fb_google_display', 'story_reel', 'carousel']),
    entry: TemplateEntrySchema,
    mode: z.enum(['append', 'update']).default('append'),
});

const registryPath = path.join(process.cwd(), 'lib', 'ads', 'template-registry', 'templates.json');

export async function GET() {
    try {
        const raw = await fs.readFile(registryPath, 'utf8');
        return NextResponse.json({ registry: JSON.parse(raw) });
    } catch (error) {
        console.error('[ads:templates:registry:get]', error);
        const message = error instanceof Error ? error.message : 'Unable to read templates.json.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const body = PutRequestSchema.parse(await req.json());
        const raw = await fs.readFile(registryPath, 'utf8');
        const registry = JSON.parse(raw) as Record<string, Record<string, Record<string, unknown>>>;

        registry[body.workflow] ??= {};
        registry[body.workflow][body.visualFlavor] ??= {};

        const existing = registry[body.workflow][body.visualFlavor][body.format];
        if (existing && body.mode === 'append') {
            return NextResponse.json({
                error: `Template already exists for (${body.workflow}, ${body.visualFlavor}, ${body.format}). Choose update to overwrite it.`,
            }, { status: 409 });
        }

        registry[body.workflow][body.visualFlavor][body.format] = body.entry;
        await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 4)}\n`, 'utf8');

        return NextResponse.json({
            ok: true,
            workflow: body.workflow,
            visualFlavor: body.visualFlavor,
            format: body.format,
            mode: existing ? 'update' : 'append',
            entry: body.entry,
        });
    } catch (error) {
        console.error('[ads:templates:registry:put]', error);
        const message = error instanceof Error ? error.message : 'Unable to update templates.json.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
