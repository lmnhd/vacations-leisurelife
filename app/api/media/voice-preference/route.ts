import { NextRequest, NextResponse } from 'next/server';
import {
    getDefaultElevenLabsVoicePreferences,
    getElevenLabsVoiceNameById,
    listElevenLabsVoices,
    normalizeElevenLabsVoiceId,
    type ElevenLabsVoicePreferences,
} from '@/lib/campaigns/media/elevenlabs-voices';
import { resolveElevenLabsVoicePreferences } from '@/lib/campaigns/media/voice-preference';
import { savePersistedElevenLabsVoicePreferences } from '@/lib/campaigns/media/voice-preference-store';

interface VoicePreferenceBody {
    narrationVoiceId?: string;
    hypeVoiceId?: string;
}

function normalizeVoiceName(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

function enrichVoicePreferences(
    preferences: ElevenLabsVoicePreferences,
    voices: Awaited<ReturnType<typeof listElevenLabsVoices>>['voices']
): ElevenLabsVoicePreferences {
    const defaults = getDefaultElevenLabsVoicePreferences();

    return {
        narrationVoiceId: preferences.narrationVoiceId,
        narrationVoiceName: getElevenLabsVoiceNameById(voices, preferences.narrationVoiceId)
            ?? normalizeVoiceName(preferences.narrationVoiceName)
            ?? defaults.narrationVoiceName,
        hypeVoiceId: preferences.hypeVoiceId,
        hypeVoiceName: getElevenLabsVoiceNameById(voices, preferences.hypeVoiceId)
            ?? normalizeVoiceName(preferences.hypeVoiceName)
            ?? defaults.hypeVoiceName,
    };
}

async function buildResponse(preferences: ElevenLabsVoicePreferences) {
    const voiceList = await listElevenLabsVoices();
    const enrichedPreferences = enrichVoicePreferences(preferences, voiceList.voices);

    return NextResponse.json({
        preferences: enrichedPreferences,
        voices: voiceList.voices,
        source: voiceList.source,
        warning: voiceList.warning,
    });
}

export async function GET() {
    return buildResponse(await resolveElevenLabsVoicePreferences());
}

export async function POST(request: NextRequest) {
    const body = await request.json() as VoicePreferenceBody;
    const currentPreferences = await resolveElevenLabsVoicePreferences();

    const nextPreferences: ElevenLabsVoicePreferences = {
        ...currentPreferences,
        ...(normalizeElevenLabsVoiceId(body.narrationVoiceId) ? {
            narrationVoiceId: normalizeElevenLabsVoiceId(body.narrationVoiceId) as string,
        } : {}),
        ...(normalizeElevenLabsVoiceId(body.hypeVoiceId) ? {
            hypeVoiceId: normalizeElevenLabsVoiceId(body.hypeVoiceId) as string,
        } : {}),
    };

    const voiceList = await listElevenLabsVoices();
    const enrichedPreferences = enrichVoicePreferences(nextPreferences, voiceList.voices);
    await savePersistedElevenLabsVoicePreferences(enrichedPreferences);

    return NextResponse.json({
        preferences: enrichedPreferences,
        voices: voiceList.voices,
        source: voiceList.source,
        warning: voiceList.warning,
    });
}
