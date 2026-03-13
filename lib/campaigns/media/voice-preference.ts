import {
    getDefaultElevenLabsVoicePreferences,
    normalizeElevenLabsVoiceId,
    type ElevenLabsVoicePreferences,
    type ElevenLabsVoiceRole,
} from './elevenlabs-voices';
import { getPersistedElevenLabsVoicePreferences } from './voice-preference-store';

export interface ElevenLabsVoicePreferenceInput {
    narrationVoiceId?: string | null;
    narrationVoiceName?: string | null;
    hypeVoiceId?: string | null;
    hypeVoiceName?: string | null;
}

function normalizeVoiceName(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

export async function resolveElevenLabsVoicePreferences(
    explicit?: ElevenLabsVoicePreferenceInput
): Promise<ElevenLabsVoicePreferences> {
    const defaults = getDefaultElevenLabsVoicePreferences();
    const persisted = await getPersistedElevenLabsVoicePreferences();

    return {
        narrationVoiceId: normalizeElevenLabsVoiceId(explicit?.narrationVoiceId)
            ?? persisted?.narrationVoiceId
            ?? defaults.narrationVoiceId,
        narrationVoiceName: normalizeVoiceName(explicit?.narrationVoiceName)
            ?? persisted?.narrationVoiceName
            ?? defaults.narrationVoiceName,
        hypeVoiceId: normalizeElevenLabsVoiceId(explicit?.hypeVoiceId)
            ?? persisted?.hypeVoiceId
            ?? defaults.hypeVoiceId,
        hypeVoiceName: normalizeVoiceName(explicit?.hypeVoiceName)
            ?? persisted?.hypeVoiceName
            ?? defaults.hypeVoiceName,
    };
}

export async function resolveElevenLabsVoiceForRole(
    role: ElevenLabsVoiceRole
): Promise<{ role: ElevenLabsVoiceRole; voiceId: string; voiceName: string | null }> {
    const preferences = await resolveElevenLabsVoicePreferences();

    if (role === 'narration') {
        return {
            role,
            voiceId: preferences.narrationVoiceId,
            voiceName: preferences.narrationVoiceName,
        };
    }

    return {
        role,
        voiceId: preferences.hypeVoiceId,
        voiceName: preferences.hypeVoiceName,
    };
}
