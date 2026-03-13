"use client";

import { useCallback, useEffect, useState } from 'react';
import type { ElevenLabsVoiceOption, ElevenLabsVoicePreferences } from './elevenlabs-voices';

interface VoicePreferenceResponse {
    preferences: ElevenLabsVoicePreferences;
    voices: ElevenLabsVoiceOption[];
    source: 'api' | 'fallback';
    warning?: string;
}

export function useVoicePreference() {
    const [preferences, setPreferences] = useState<ElevenLabsVoicePreferences | null>(null);
    const [voices, setVoices] = useState<ElevenLabsVoiceOption[]>([]);
    const [source, setSource] = useState<'api' | 'fallback'>('fallback');
    const [warning, setWarning] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/media/voice-preference', { cache: 'no-store' });
            const data = await response.json() as VoicePreferenceResponse;
            setPreferences(data.preferences);
            setVoices(data.voices);
            setSource(data.source);
            setWarning(data.warning ?? null);
        } finally {
            setLoading(false);
        }
    }, []);

    const updatePreference = useCallback(async (nextPreferences: Partial<ElevenLabsVoicePreferences>) => {
        const response = await fetch('/api/media/voice-preference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nextPreferences),
        });
        const data = await response.json() as VoicePreferenceResponse;
        setPreferences(data.preferences);
        setVoices(data.voices);
        setSource(data.source);
        setWarning(data.warning ?? null);
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return {
        preferences,
        voices,
        source,
        warning,
        loading,
        refresh,
        updatePreference,
    };
}
