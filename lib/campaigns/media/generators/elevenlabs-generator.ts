import { CampaignAestheticBrief } from '../../schema';
import type { ElevenLabsVoiceRole } from '../elevenlabs-voices';
import { ELEVENLABS_CONFIG } from '../media-pipeline-config';
import { resolveElevenLabsVoiceForRole } from '../voice-preference';
import { spawn } from 'child_process';
import { access, mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// ────────────────────────────────────────────────────────────────────────────
// ElevenLabs Audio Generator
// Ambient narration + hype clip TTS generation.
// All voice IDs and settings controlled via ELEVENLABS_CONFIG in media-pipeline-config.ts.
// ────────────────────────────────────────────────────────────────────────────

function getApiKey(): string {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new Error('ELEVENLABS_API_KEY not set in environment');
    return key;
}

async function getFfmpegPath(): Promise<string> {
    const candidates = [
        join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
        join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
    ];

    for (const candidate of candidates) {
        try {
            await access(candidate);
            return candidate;
        } catch {
            continue;
        }
    }

    throw new Error(`ffmpeg binary not found. Checked: ${candidates.join(', ')}`);
}

async function runFfmpeg(args: readonly string[]): Promise<void> {
    const ffmpegPath = await getFfmpegPath();
    await new Promise<void>((resolve, reject) => {
        const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`ffmpeg exited with code ${code ?? 'unknown'}: ${stderr}`));
        });
    });
}

async function generateSilenceAudio(durationSeconds: number): Promise<Buffer> {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'lli-elevenlabs-silence-'));
    const outputPath = join(tempDirectory, 'silence.mp3');

    try {
        await runFfmpeg([
            '-y',
            '-f', 'lavfi',
            '-i', 'anullsrc=r=44100:cl=stereo',
            '-t', String(durationSeconds),
            '-q:a', '9',
            '-acodec', 'libmp3lame',
            outputPath,
        ]);

        return await readFile(outputPath);
    } finally {
        await rm(tempDirectory, { recursive: true, force: true });
    }
}

interface ElevenLabsResponse {
    // ElevenLabs returns binary audio; this is the fetch Response, not JSON
}

async function generateSpeech(text: string, voiceId: string): Promise<Buffer> {
    const response = await fetch(
        `${ELEVENLABS_CONFIG.apiBase}/text-to-speech/${voiceId}`,
        {
            method: 'POST',
            headers: {
                'xi-api-key': getApiKey(),
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg',
            },
            body: JSON.stringify({
                text,
                model_id: ELEVENLABS_CONFIG.model,
                voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            }),
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs error ${response.status}: ${errorText}`);
    }

    return Buffer.from(await response.arrayBuffer());
}

export async function generateSpeechClip(
    text: string,
    voiceId: string,
): Promise<Buffer> {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
        return generateSilenceAudio(1);
    }

    return generateSpeech(trimmed, voiceId);
}

export interface GeneratedAudio {
    buffer: Buffer;
    script: string;
    assetId: string;
    fileName: string;
    voiceId: string;
    voiceName: string | null;
    voiceRole: ElevenLabsVoiceRole;
}

/**
 * 30s ambient narration — uses ELEVENLABS_CONFIG.narrationVoiceId.
 * Source script: brief.audio.ambientNarrationScript
 */
export async function generateAmbientNarration(
    brief: CampaignAestheticBrief
): Promise<GeneratedAudio> {
    const script = brief.audio.ambientNarrationScript.slice(0, ELEVENLABS_CONFIG.narrationMaxChars);
    if (script.trim().length === 0) {
        const voice = await resolveElevenLabsVoiceForRole('narration');
        const buffer = await generateSilenceAudio(1);
        return {
            buffer,
            script,
            assetId: 'audio_ambient_narration',
            fileName: 'audio/ambient_narration.mp3',
            voiceId: voice.voiceId,
            voiceName: voice.voiceName,
            voiceRole: voice.role,
        };
    }

    const voice = await resolveElevenLabsVoiceForRole('narration');
    const buffer = await generateSpeech(script, voice.voiceId);
    return {
        buffer,
        script,
        assetId: 'audio_ambient_narration',
        fileName: 'audio/ambient_narration.mp3',
        voiceId: voice.voiceId,
        voiceName: voice.voiceName,
        voiceRole: voice.role,
    };
}

/**
 * 15s hype clip — uses ELEVENLABS_CONFIG.hypeVoiceId.
 * Source script: brief.audio.hypeClipScript
 */
export async function generateHypeClip(
    brief: CampaignAestheticBrief
): Promise<GeneratedAudio> {
    const script = brief.audio.hypeClipScript.slice(0, ELEVENLABS_CONFIG.hypeMaxChars);
    const voice = await resolveElevenLabsVoiceForRole('hype');
    const buffer = await generateSpeech(script, voice.voiceId);
    return {
        buffer,
        script,
        assetId: 'audio_hype_clip',
        fileName: 'audio/hype_clip.mp3',
        voiceId: voice.voiceId,
        voiceName: voice.voiceName,
        voiceRole: voice.role,
    };
}
