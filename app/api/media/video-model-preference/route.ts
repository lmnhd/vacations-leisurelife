import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
    getDefaultVideoModelPresetId,
    listVideoModelPresetOptions,
    normalizeVideoModelPresetId,
    VIDEO_MODEL_PREFERENCE_COOKIE,
} from '@/lib/campaigns/media/video-models';
import { getPersistedVideoModelPresetId, savePersistedVideoModelPresetId } from '@/lib/campaigns/media/video-model-preference-store';

interface PreferenceBody {
    presetId?: string;
}

export async function GET() {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(VIDEO_MODEL_PREFERENCE_COOKIE)?.value;
    const persistedPresetId = await getPersistedVideoModelPresetId();
    const presetId = persistedPresetId ?? normalizeVideoModelPresetId(cookieValue) ?? getDefaultVideoModelPresetId();

    return NextResponse.json({
        presetId,
        presets: listVideoModelPresetOptions(),
    });
}

export async function POST(request: NextRequest) {
    const body = await request.json() as PreferenceBody;
    const presetId = normalizeVideoModelPresetId(body.presetId);

    if (!presetId) {
        return NextResponse.json({ error: 'Invalid presetId' }, { status: 400 });
    }

    await savePersistedVideoModelPresetId(presetId);

    const response = NextResponse.json({
        presetId,
        presets: listVideoModelPresetOptions(),
    });

    response.cookies.set({
        name: VIDEO_MODEL_PREFERENCE_COOKIE,
        value: presetId,
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
    });

    return response;
}