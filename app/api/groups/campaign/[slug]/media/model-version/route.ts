import { NextRequest, NextResponse } from 'next/server';
import { updateManifestModelVersionSelections } from '@/lib/campaigns/media/media-store';
import { GeneratorServiceEnum } from '@/lib/campaigns/schema';

export const dynamic = 'force-dynamic';

// MULTI_MODEL_IMAGES — choose which model-version is canonical for a variant
// group. Body: { groupId, generator } where generator is a GeneratorService id,
// or { selections: Record<groupId, generator|null> } for batch / clears.

type Body = {
    groupId?: string;
    generator?: string | null;
    selections?: Record<string, string | null>;
};

function isValidGenerator(value: string): boolean {
    return GeneratorServiceEnum.safeParse(value).success;
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    try {
        const body = (await request.json().catch(() => ({}))) as Body;

        const changes: Record<string, string | null> = { ...(body.selections ?? {}) };
        if (typeof body.groupId === 'string' && body.groupId.trim()) {
            changes[body.groupId] = body.generator ?? null;
        }

        if (Object.keys(changes).length === 0) {
            return NextResponse.json({ error: 'No selections provided' }, { status: 400 });
        }

        for (const [groupId, generator] of Object.entries(changes)) {
            if (!groupId.trim()) {
                return NextResponse.json({ error: 'Empty variant group id' }, { status: 400 });
            }
            if (generator !== null && generator !== '' && !isValidGenerator(generator)) {
                return NextResponse.json({ error: `Unknown generator: ${generator}` }, { status: 400 });
            }
        }

        const manifest = await updateManifestModelVersionSelections(slug, changes);
        return NextResponse.json({ modelVersionSelections: manifest.modelVersionSelections ?? {} });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = message.includes('No media manifest') ? 404 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
