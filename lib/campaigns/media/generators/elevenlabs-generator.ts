import { CampaignAestheticBrief } from '../../schema';

// ────────────────────────────────────────────────────────────────────────────
// ElevenLabs Voice Generator
// Ambient narration + hype clip from aesthetic brief audio fields.
// API: https://api.elevenlabs.io/v1
// ────────────────────────────────────────────────────────────────────────────

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

/** Pre-selected voice profiles for campaign archetypes (from API_SERVICES_REFERENCE) */
const VOICE_PROFILE_MAP: Record<string, string> = {
    'adam': '21m00Tcm4TlvDq8ikWAM',
    'josh': 'TxGEqnHWrfWFTfGW9XjX',
    'charlotte': 'XB0fDUnXU5powFXDhCwa',
    'dorothy': 'ThT5KcBeYPX3keUQqHPh',
    'elli': 'MF3mGyEYCl7XYWbV9V6O',
    'domi': 'AZnzlk1XvdvUeBnXmlld',
    'antoni': 'ErXwobaYiN019PkySvjV',
    'rachel': '21m00Tcm4TlvDq8ikWAM',
    'serena': 'pMsXgVXv3BLzUgSXRplE',
};

function getApiKey(): string {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new Error('ELEVENLABS_API_KEY not set in environment');
    return key;
}

function resolveVoiceId(voiceProfile: string): string {
    const normalized = voiceProfile.toLowerCase().trim();
    return VOICE_PROFILE_MAP[normalized] || VOICE_PROFILE_MAP['adam'];
}

async function textToSpeech(
    text: string,
    voiceId: string,
    stability: number = 0.65,
    style: number = 0.45
): Promise<Buffer> {
    const apiKey = getApiKey();

    const response = await fetch(`${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
                stability,
                similarity_boost: 0.80,
                style,
                use_speaker_boost: true,
            },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs error ${response.status}: ${errorText}`);
    }

    return Buffer.from(await response.arrayBuffer());
}

export interface GeneratedAudio {
    buffer: Buffer;
    script: string;
    assetId: string;
    fileName: string;
}

/**
 * Ambient narration (30s) — landing page hero audio.
 * Voice settings: stability 0.65, style 0.45 (measured, ambient).
 */
export async function generateAmbientNarration(
    brief: CampaignAestheticBrief
): Promise<GeneratedAudio> {
    const voiceId = resolveVoiceId(brief.audio.voiceProfile);
    const buffer = await textToSpeech(
        brief.audio.ambientNarrationScript,
        voiceId,
        0.65,
        0.45
    );

    return {
        buffer,
        script: brief.audio.ambientNarrationScript,
        assetId: 'aud_ambient_narration',
        fileName: 'audio/ambient_narration.mp3',
    };
}

/**
 * Threshold hype clip (15s) — high-energy SMS/email hook.
 * Voice settings: stability 0.45, style 0.70 (more expressive).
 */
export async function generateHypeClip(
    brief: CampaignAestheticBrief
): Promise<GeneratedAudio> {
    const voiceId = resolveVoiceId(brief.audio.voiceProfile);
    const buffer = await textToSpeech(
        brief.audio.hypeClipScript,
        voiceId,
        0.45,
        0.70
    );

    return {
        buffer,
        script: brief.audio.hypeClipScript,
        assetId: 'aud_hype_clip',
        fileName: 'audio/hype_clip.mp3',
    };
}
