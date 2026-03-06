import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { REPLICATE_CONFIG } from '@/lib/campaigns/media/media-pipeline-config';

export async function POST(request: NextRequest) {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
        return NextResponse.json(
            { error: 'REPLICATE_API_TOKEN is missing from .env.local.' },
            { status: 400 }
        );
    }

    const body = await request.json() as Record<string, unknown>;
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const requestedDuration = typeof body.duration === 'number' ? body.duration : Number(body.duration ?? 30);
    const duration = Number.isFinite(requestedDuration)
        ? Math.max(1, Math.min(REPLICATE_CONFIG.defaultDuration, requestedDuration))
        : REPLICATE_CONFIG.defaultDuration;

    if (!prompt) {
        return NextResponse.json(
            { error: 'Prompt is required.' },
            { status: 400 }
        );
    }

    const replicate = new Replicate({ auth: token });

    try {
        const output = await replicate.run(REPLICATE_CONFIG.musicGenModel, {
            input: {
                prompt,
                model_version: 'melody',
                output_format: REPLICATE_CONFIG.outputFormat,
                normalization_strategy: REPLICATE_CONFIG.normalizationStrategy,
                duration,
            },
        }) as unknown;

        const audioUrl = typeof output === 'string'
            ? output
            : Array.isArray(output) && typeof output[0] === 'string'
                ? output[0]
                : '';

        if (!audioUrl) {
            return NextResponse.json(
                { error: 'MusicGen did not return an audio URL.', output },
                { status: 500 }
            );
        }

        return NextResponse.json({
            prompt,
            duration,
            audioUrl,
            output,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'MusicGen request failed.';
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
