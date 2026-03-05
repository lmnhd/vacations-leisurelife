import { NextRequest, NextResponse } from 'next/server';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { generateAmbientNarration, generateHypeClip } from '@/lib/campaigns/media/generators/elevenlabs-generator';
import { generateThemeMusic } from '@/lib/campaigns/media/generators/suno-generator';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/test/audio
// Test-only route — runs audio generators individually without R2 upload.
// Returns base64 audio + script metadata.
// Body: { generator: 'elevenlabs_narration' | 'elevenlabs_hype' | 'suno_theme' }
// ────────────────────────────────────────────────────────────────────────────

type AudioTestGenerator = 'elevenlabs_narration' | 'elevenlabs_hype' | 'suno_theme';

interface AudioTestRequestBody {
    generator: AudioTestGenerator;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    const body = await request.json() as AudioTestRequestBody;
    const { generator } = body;

    const brief = await getAestheticBrief(slug);
    if (!brief) {
        return NextResponse.json({ error: `No aesthetic brief found for ${slug}` }, { status: 404 });
    }
    if (brief.humanReviewStatus !== 'approved') {
        return NextResponse.json({
            error: `Brief not approved (status: ${brief.humanReviewStatus}). Approve it first.`
        }, { status: 400 });
    }

    try {
        if (generator === 'elevenlabs_narration') {
            const audio = await generateAmbientNarration(brief);
            return NextResponse.json({
                generator: 'elevenlabs',
                assetId: audio.assetId,
                fileName: audio.fileName,
                script: audio.script,
                sizeBytes: audio.buffer.length,
                preview: `data:audio/mpeg;base64,${audio.buffer.toString('base64')}`,
            });
        }

        if (generator === 'elevenlabs_hype') {
            const audio = await generateHypeClip(brief);
            return NextResponse.json({
                generator: 'elevenlabs',
                assetId: audio.assetId,
                fileName: audio.fileName,
                script: audio.script,
                sizeBytes: audio.buffer.length,
                preview: `data:audio/mpeg;base64,${audio.buffer.toString('base64')}`,
            });
        }

        if (generator === 'suno_theme') {
            // Will throw Not Implemented — that's the expected result for now
            await generateThemeMusic(brief);
        }

        return NextResponse.json({ error: `Unknown generator: ${generator}` }, { status: 400 });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Known Not Implemented errors are 501, others are 500
        const status = message.includes('not yet implemented') || message.includes('not set') ? 501 : 500;
        return NextResponse.json({ error: message, notImplemented: status === 501 }, { status });
    }
}
