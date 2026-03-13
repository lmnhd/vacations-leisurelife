import type { NextRequest } from 'next/server';
import { getDefaultVideoModelPresetId, normalizeVideoModelPresetId, VIDEO_MODEL_PREFERENCE_COOKIE, type VideoModelPresetId } from './video-models';
import { getPersistedVideoModelPresetId } from './video-model-preference-store';

export async function resolveVideoModelPresetIdFromRequest(
    request: NextRequest,
    explicitPresetId?: string | null
): Promise<VideoModelPresetId> {
    const explicit = normalizeVideoModelPresetId(explicitPresetId);
    if (explicit) {
        return explicit;
    }

    const persisted = await getPersistedVideoModelPresetId();
    if (persisted) {
        return persisted;
    }

    const cookieValue = request.cookies.get(VIDEO_MODEL_PREFERENCE_COOKIE)?.value;
    const fromCookie = normalizeVideoModelPresetId(cookieValue);
    return fromCookie ?? getDefaultVideoModelPresetId();
}

export async function resolveVideoModelPresetId(explicitPresetId?: string | null): Promise<VideoModelPresetId> {
    const explicit = normalizeVideoModelPresetId(explicitPresetId);
    if (explicit) {
        return explicit;
    }

    return (await getPersistedVideoModelPresetId()) ?? getDefaultVideoModelPresetId();
}
