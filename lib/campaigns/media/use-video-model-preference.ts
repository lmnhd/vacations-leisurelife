"use client";

import { useCallback, useEffect, useState } from 'react';
import type { VideoModelPresetId, VideoModelPresetOption } from './video-models';

interface PreferenceResponse {
    presetId: VideoModelPresetId;
    presets: VideoModelPresetOption[];
}

export function useVideoModelPreference() {
    const [presetId, setPresetId] = useState<VideoModelPresetId | null>(null);
    const [presets, setPresets] = useState<VideoModelPresetOption[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/media/video-model-preference', { cache: 'no-store' });
            const data = await response.json() as PreferenceResponse;
            setPresetId(data.presetId);
            setPresets(data.presets);
        } finally {
            setLoading(false);
        }
    }, []);

    const updatePreference = useCallback(async (nextPresetId: VideoModelPresetId) => {
        const response = await fetch('/api/media/video-model-preference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ presetId: nextPresetId }),
        });
        const data = await response.json() as PreferenceResponse;
        setPresetId(data.presetId);
        setPresets(data.presets);
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return {
        presetId,
        presets,
        loading,
        refresh,
        updatePreference,
    };
}