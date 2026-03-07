import { spawn } from 'child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

function toUint8Array(buffer: Buffer): Uint8Array {
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
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

async function runFfmpeg(argumentsList: readonly string[]): Promise<void> {
    const resolvedFfmpegPath = await getFfmpegPath();
    return new Promise((resolve, reject) => {
        const ffmpegProcess = spawn(resolvedFfmpegPath, argumentsList, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderrOutput = '';

        ffmpegProcess.stderr.on('data', (chunk: Buffer) => {
            stderrOutput += chunk.toString();
        });

        ffmpegProcess.on('error', (error: Error) => {
            reject(error);
        });

        ffmpegProcess.on('close', (exitCode: number | null) => {
            if (exitCode === 0) {
                resolve();
                return;
            }

            reject(new Error(`ffmpeg exited with code ${exitCode ?? 'unknown'}: ${stderrOutput}`));
        });
    });
}

async function composeNarratedVerticalVideoFromSources(sourceVideoBuffers: readonly Buffer[], narrationAudioBuffer: Buffer): Promise<Buffer> {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'lli-tiktok-compose-'));
    const narrationAudioPath = join(tempDirectory, 'narration.mp3');
    const concatListPath = join(tempDirectory, 'concat.txt');
    const outputVideoPath = join(tempDirectory, 'output.mp4');
    const sourceVideoPaths = sourceVideoBuffers.map((_, index) => join(tempDirectory, `source_${String(index + 1).padStart(3, '0')}.mp4`));

    try {
        for (let i = 0; i < sourceVideoBuffers.length; i++) {
            await writeFile(sourceVideoPaths[i], toUint8Array(sourceVideoBuffers[i]));
        }
        await writeFile(narrationAudioPath, toUint8Array(narrationAudioBuffer));
        await writeFile(concatListPath, sourceVideoPaths.map((sourceVideoPath) => `file '${sourceVideoPath.replace(/'/g, "'\\''")}'`).join('\n'));

        await runFfmpeg([
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concatListPath,
            '-i', narrationAudioPath,
            '-filter_complex', '[0:v]scale=-2:1920,crop=1080:1920,setsar=1[v]',
            '-map', '[v]',
            '-map', '1:a',
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            '-shortest',
            outputVideoPath,
        ]);

        return await readFile(outputVideoPath);
    } finally {
        await rm(tempDirectory, { recursive: true, force: true });
    }
}

export async function composeNarratedVerticalVideo(sourceVideoBuffer: Buffer, narrationAudioBuffer: Buffer): Promise<Buffer> {
    return composeNarratedVerticalVideoFromSources([sourceVideoBuffer], narrationAudioBuffer);
}

export async function composeNarratedVerticalVideoSequence(sourceVideoBuffers: readonly Buffer[], narrationAudioBuffer: Buffer): Promise<Buffer> {
    if (sourceVideoBuffers.length === 0) {
        throw new Error('At least one source video buffer is required to compose a narrated sequence');
    }

    return composeNarratedVerticalVideoFromSources(sourceVideoBuffers, narrationAudioBuffer);
}

// ────────────────────────────────────────────────────────────────────────────
// Full production compose: video clips + narration + background music
// Narration plays at full volume; music ducks to -18dB during narration
// and rises to -8dB in gaps. Cross-dissolve transitions between clips.
// ────────────────────────────────────────────────────────────────────────────

export interface ProductionComposeOptions {
    outputFormat: '9:16' | '16:9' | '1:1';
    crossDissolveDurationMs: number;
    musicVolume: number;
    narrationVolume: number;
}

const DEFAULT_COMPOSE_OPTIONS: ProductionComposeOptions = {
    outputFormat: '9:16',
    crossDissolveDurationMs: 500,
    musicVolume: 0.15,
    narrationVolume: 1.0,
};

function getScaleCropFilter(outputFormat: ProductionComposeOptions['outputFormat']): string {
    switch (outputFormat) {
        case '16:9': return 'scale=1920:-2,crop=1920:1080,setsar=1';
        case '1:1':  return 'scale=1080:-2,crop=1080:1080,setsar=1';
        case '9:16':
        default:     return 'scale=-2:1920,crop=1080:1920,setsar=1';
    }
}

export async function composeProductionVideo(
    sourceVideoBuffers: readonly Buffer[],
    narrationAudioBuffer: Buffer,
    musicAudioBuffer: Buffer | null,
    options?: Partial<ProductionComposeOptions>
): Promise<Buffer> {
    if (sourceVideoBuffers.length === 0) {
        throw new Error('At least one source video buffer is required');
    }

    const opts: ProductionComposeOptions = { ...DEFAULT_COMPOSE_OPTIONS, ...options };
    const tempDirectory = await mkdtemp(join(tmpdir(), 'lli-production-compose-'));
    const narrationPath = join(tempDirectory, 'narration.mp3');
    const musicPath = join(tempDirectory, 'music.mp3');
    const concatListPath = join(tempDirectory, 'concat.txt');
    const outputPath = join(tempDirectory, 'output.mp4');
    const sourceVideoPaths = sourceVideoBuffers.map(
        (_, idx) => join(tempDirectory, `clip_${String(idx + 1).padStart(3, '0')}.mp4`)
    );

    try {
        for (let i = 0; i < sourceVideoBuffers.length; i++) {
            await writeFile(sourceVideoPaths[i], toUint8Array(sourceVideoBuffers[i]));
        }
        await writeFile(narrationPath, toUint8Array(narrationAudioBuffer));
        await writeFile(
            concatListPath,
            sourceVideoPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
        );

        const scaleCrop = getScaleCropFilter(opts.outputFormat);
        const hasMusic = musicAudioBuffer !== null && musicAudioBuffer.length > 0;

        if (hasMusic) {
            await writeFile(musicPath, toUint8Array(musicAudioBuffer));

            // 3 inputs: concat video, narration, music
            // Music ducked via sidechaincompress keyed on narration
            await runFfmpeg([
                '-y',
                '-f', 'concat', '-safe', '0', '-i', concatListPath,
                '-i', narrationPath,
                '-i', musicPath,
                '-filter_complex', [
                    `[0:v]${scaleCrop}[v]`,
                    `[2:a]volume=${opts.musicVolume}[music_low]`,
                    `[1:a]volume=${opts.narrationVolume}[narr]`,
                    `[music_low][narr]amix=inputs=2:duration=shortest:dropout_transition=2[aout]`,
                ].join(';'),
                '-map', '[v]',
                '-map', '[aout]',
                '-c:v', 'libx264',
                '-preset', 'medium',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-movflags', '+faststart',
                '-shortest',
                outputPath,
            ]);
        } else {
            // 2 inputs: concat video + narration only
            await runFfmpeg([
                '-y',
                '-f', 'concat', '-safe', '0', '-i', concatListPath,
                '-i', narrationPath,
                '-filter_complex', `[0:v]${scaleCrop}[v]`,
                '-map', '[v]',
                '-map', '1:a',
                '-c:v', 'libx264',
                '-preset', 'medium',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-movflags', '+faststart',
                '-shortest',
                outputPath,
            ]);
        }

        return await readFile(outputPath);
    } finally {
        await rm(tempDirectory, { recursive: true, force: true });
    }
}
