import { CampaignAestheticBrief } from '../../schema';
import { GeneratedAudio } from './elevenlabs-generator';

// ────────────────────────────────────────────────────────────────────────────
// Suno AI Theme Music Generator
// Campaign theme music / background audio (60–120s instrumental loop).
// NOTE: Suno API is in limited beta. This module provides the correct
// integration shape but will throw "Not Implemented" until API access
// is confirmed and SUNO_API_KEY is provisioned.
// ────────────────────────────────────────────────────────────────────────────

function getApiKey(): string {
    const key = process.env.SUNO_API_KEY;
    if (!key) {
        throw new Error(
            'SUNO_API_KEY not set. Suno AI music generation is not yet available. ' +
            'Set SUNO_API_KEY in .env.local when API access is provisioned.'
        );
    }
    return key;
}

/**
 * Generate campaign theme music (60–120s instrumental loop).
 * Prompt derived from brief.audio.musicMood.
 *
 * TODO: Wire to Suno API when access is available.
 * Current status: Not Implemented — throws with clear message.
 */
export async function generateThemeMusic(
    brief: CampaignAestheticBrief
): Promise<GeneratedAudio> {
    // Validate API key exists (will throw with clear message if not)
    getApiKey();

    const prompt = [
        brief.audio.musicMood,
        'instrumental only',
        'no lyrics',
        'loop-friendly',
        'upbeat but not frantic',
    ].join(', ');

    // TODO: Implement Suno API call when available
    // POST to Suno API with prompt, receive audio URL, download buffer
    throw new Error(
        `Suno AI music generation not yet implemented. ` +
        `Prompt ready: "${prompt}". ` +
        `Wire to Suno API when /v1/generate endpoint is available.`
    );
}
