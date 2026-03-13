import { ELEVENLABS_CONFIG } from './media-pipeline-config';

export const ELEVENLABS_VOICE_ROLES = ['narration', 'hype'] as const;
export type ElevenLabsVoiceRole = typeof ELEVENLABS_VOICE_ROLES[number];

export interface ElevenLabsVoiceOption {
    id: string;
    name: string;
    category: string;
    description: string | null;
    previewUrl: string | null;
    accent: string | null;
    age: string | null;
    gender: string | null;
    useCase: string | null;
}

export interface ElevenLabsVoicePreferences {
    narrationVoiceId: string;
    narrationVoiceName: string | null;
    hypeVoiceId: string;
    hypeVoiceName: string | null;
}

interface ElevenLabsVoiceApiResponse {
    voices?: ElevenLabsVoiceApiVoice[];
}

interface ElevenLabsVoiceApiVoice {
    voice_id: string;
    name: string;
    category?: string;
    description?: string | null;
    preview_url?: string | null;
    labels?: Record<string, string | undefined>;
}

interface ListedElevenLabsVoices {
    voices: ElevenLabsVoiceOption[];
    source: 'api' | 'fallback';
    warning?: string;
}

const DEFAULT_VOICE_NAMES = {
    narration: 'Adam',
    hype: 'Bella',
} as const satisfies Record<ElevenLabsVoiceRole, string>;

const FALLBACK_VOICE_OPTIONS: ElevenLabsVoiceOption[] = [
    {
        id: ELEVENLABS_CONFIG.narrationVoiceId,
        name: DEFAULT_VOICE_NAMES.narration,
        category: 'premade',
        description: 'Default narration voice',
        previewUrl: null,
        accent: null,
        age: null,
        gender: null,
        useCase: 'narration',
    },
    {
        id: ELEVENLABS_CONFIG.hypeVoiceId,
        name: DEFAULT_VOICE_NAMES.hype,
        category: 'premade',
        description: 'Default hype voice',
        previewUrl: null,
        accent: null,
        age: null,
        gender: null,
        useCase: 'hype',
    },
];

function normalizeName(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

function getApiKeyOrNull(): string | null {
    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    return apiKey ? apiKey : null;
}

function mapVoiceOption(voice: ElevenLabsVoiceApiVoice): ElevenLabsVoiceOption {
    return {
        id: voice.voice_id,
        name: voice.name,
        category: voice.category ?? 'unknown',
        description: normalizeName(voice.description),
        previewUrl: normalizeName(voice.preview_url),
        accent: normalizeName(voice.labels?.accent),
        age: normalizeName(voice.labels?.age),
        gender: normalizeName(voice.labels?.gender),
        useCase: normalizeName(voice.labels?.use_case),
    };
}

function mergeUniqueVoices(voices: ElevenLabsVoiceOption[]): ElevenLabsVoiceOption[] {
    const byId = new Map<string, ElevenLabsVoiceOption>();
    for (const voice of voices) {
        if (!byId.has(voice.id)) {
            byId.set(voice.id, voice);
        }
    }

    return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function slugifyVoiceName(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function getVoiceListFailureWarning(status: number): string {
    if (status === 401) {
        return 'Could not load the live ElevenLabs voice library. The configured ELEVENLABS_API_KEY was rejected with 401. Update the key in .env.local and restart the dev server.';
    }

    if (status === 403) {
        return 'Could not load the live ElevenLabs voice library. ElevenLabs rejected access with 403 for the configured ELEVENLABS_API_KEY.';
    }

    return `Could not load the live ElevenLabs voice library. ElevenLabs voice list failed with ${status}.`;
}

export function normalizeElevenLabsVoiceId(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

export function getDefaultElevenLabsVoicePreferences(): ElevenLabsVoicePreferences {
    return {
        narrationVoiceId: ELEVENLABS_CONFIG.narrationVoiceId,
        narrationVoiceName: DEFAULT_VOICE_NAMES.narration,
        hypeVoiceId: ELEVENLABS_CONFIG.hypeVoiceId,
        hypeVoiceName: DEFAULT_VOICE_NAMES.hype,
    };
}

export function getElevenLabsVoiceRoleLabel(role: ElevenLabsVoiceRole): string {
    return role === 'narration' ? 'Narration / Storyboards' : 'Hype Clips';
}

export function findElevenLabsVoiceOption(voices: ElevenLabsVoiceOption[], voiceId: string): ElevenLabsVoiceOption | undefined {
    return voices.find((voice) => voice.id === voiceId);
}

export function getElevenLabsVoiceNameById(voices: ElevenLabsVoiceOption[], voiceId: string): string | null {
    return findElevenLabsVoiceOption(voices, voiceId)?.name ?? null;
}

export function getFallbackElevenLabsVoices(): ElevenLabsVoiceOption[] {
    return [...FALLBACK_VOICE_OPTIONS];
}

export async function listElevenLabsVoices(): Promise<ListedElevenLabsVoices> {
    const apiKey = getApiKeyOrNull();
    if (!apiKey) {
        return {
            voices: getFallbackElevenLabsVoices(),
            source: 'fallback',
            warning: 'ELEVENLABS_API_KEY is not set. Showing fallback voice defaults only.',
        };
    }

    try {
        const response = await fetch(`${ELEVENLABS_CONFIG.apiBase}/voices`, {
            method: 'GET',
            headers: {
                'xi-api-key': apiKey,
                'Accept': 'application/json',
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            throw new Error(getVoiceListFailureWarning(response.status));
        }

        const payload = await response.json() as ElevenLabsVoiceApiResponse;
        const apiVoices = Array.isArray(payload.voices)
            ? payload.voices.map(mapVoiceOption)
            : [];

        return {
            voices: mergeUniqueVoices([...apiVoices, ...FALLBACK_VOICE_OPTIONS]),
            source: 'api',
        };
    } catch (error) {
        return {
            voices: getFallbackElevenLabsVoices(),
            source: 'fallback',
            warning: error instanceof Error
                ? error.message
                : 'Could not load the live ElevenLabs voice library.',
        };
    }
}

export function buildElevenLabsVoiceTags(role: ElevenLabsVoiceRole, voiceId: string, voiceName?: string | null): string[] {
    const tags = [`voice-role:${role}`, `voice-id:${voiceId}`];
    const normalizedName = normalizeName(voiceName);
    if (normalizedName) {
        const slug = slugifyVoiceName(normalizedName);
        if (slug) {
            tags.push(`voice-name:${slug}`);
        }
    }
    return tags;
}

export function isElevenLabsVoiceTag(tag: string): boolean {
    return tag.startsWith('voice-role:') || tag.startsWith('voice-id:') || tag.startsWith('voice-name:');
}

export function parseElevenLabsVoiceTags(tags: string[]): {
    role: ElevenLabsVoiceRole | null;
    voiceId: string | null;
    voiceName: string | null;
} {
    const roleTag = tags.find((tag) => tag.startsWith('voice-role:'));
    const voiceIdTag = tags.find((tag) => tag.startsWith('voice-id:'));
    const voiceNameTag = tags.find((tag) => tag.startsWith('voice-name:'));

    const roleValue = roleTag?.slice('voice-role:'.length);
    const role = ELEVENLABS_VOICE_ROLES.includes(roleValue as ElevenLabsVoiceRole)
        ? roleValue as ElevenLabsVoiceRole
        : null;

    const voiceNameValue = voiceNameTag?.slice('voice-name:'.length) ?? null;
    const voiceName = voiceNameValue
        ? voiceNameValue.split('-').map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1)).join(' ')
        : null;

    return {
        role,
        voiceId: voiceIdTag?.slice('voice-id:'.length) ?? null,
        voiceName,
    };
}
