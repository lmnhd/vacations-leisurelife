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

// ────────────────────────────────────────────────────────────────────────────
// Duration control helpers
//
// When targetDurationSeconds is provided:
//   - Audio is padded with silence to reach the target (apad)
//   - Output is hard-trimmed to target with -t
//   This prevents narration from being cut when video clips sum to less than
//   the storyboard's totalDurationSeconds, and prevents open-ended output
//   when video outlasts narration.
//
// When targetDurationSeconds is omitted:
//   - Falls back to -shortest (legacy behaviour, safe for non-TikTok paths)
// ────────────────────────────────────────────────────────────────────────────

function buildDurationArgs(targetDurationSeconds: number | undefined): readonly string[] {
    return targetDurationSeconds !== undefined ? ['-t', String(targetDurationSeconds)] : ['-shortest'];
}

function buildAudioPadFilter(targetDurationSeconds: number | undefined): string | null {
    return targetDurationSeconds !== undefined ? `apad=pad_dur=${targetDurationSeconds}` : null;
}

export interface VideoOverlayCardInput {
    buffer: Buffer;
    x: number;
    y: number;
}

export async function createStillVerticalClip(
    imageBuffer: Buffer,
    durationSeconds: number,
): Promise<Buffer> {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        throw new Error(`Invalid still clip duration: ${durationSeconds}`);
    }

    const tempDirectory = await mkdtemp(join(tmpdir(), 'lli-still-clip-'));
    const sourceImagePath = join(tempDirectory, 'source.png');
    const outputVideoPath = join(tempDirectory, 'output.mp4');

    try {
        await writeFile(sourceImagePath, toUint8Array(imageBuffer));

        await runFfmpeg([
            '-y',
            '-loop', '1',
            '-i', sourceImagePath,
            '-t', String(durationSeconds),
            '-vf', 'scale=-2:1920,crop=1080:1920,setsar=1',
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-an',
            outputVideoPath,
        ]);

        return await readFile(outputVideoPath);
    } finally {
        await rm(tempDirectory, { recursive: true, force: true });
    }
}

export async function createContainedStillVerticalClip(
    imageBuffer: Buffer,
    durationSeconds: number,
): Promise<Buffer> {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        throw new Error(`Invalid still clip duration: ${durationSeconds}`);
    }

    const tempDirectory = await mkdtemp(join(tmpdir(), 'lli-contained-still-clip-'));
    const sourceImagePath = join(tempDirectory, 'source.png');
    const outputVideoPath = join(tempDirectory, 'output.mp4');

    try {
        await writeFile(sourceImagePath, toUint8Array(imageBuffer));

        await runFfmpeg([
            '-y',
            '-loop', '1',
            '-i', sourceImagePath,
            '-t', String(durationSeconds),
            '-filter_complex', [
                '[0:v]split=2[bg_src][fg_src]',
                '[bg_src]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:1,eq=brightness=-0.12:saturation=0.78[bg]',
                '[fg_src]scale=1080:1920:force_original_aspect_ratio=decrease,setsar=1[fg]',
                '[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1:format=auto[v]',
            ].join(';'),
            '-map', '[v]',
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-an',
            outputVideoPath,
        ]);

        return await readFile(outputVideoPath);
    } finally {
        await rm(tempDirectory, { recursive: true, force: true });
    }
}

export async function composeVideoWithOverlayCards(
    sourceVideoBuffer: Buffer,
    overlayCards: readonly VideoOverlayCardInput[],
    durationSeconds?: number,
): Promise<Buffer> {
    if (overlayCards.length === 0) {
        return sourceVideoBuffer;
    }

    const tempDirectory = await mkdtemp(join(tmpdir(), 'lli-overlay-compose-'));
    const sourceVideoPath = join(tempDirectory, 'source.mp4');
    const outputVideoPath = join(tempDirectory, 'output.mp4');
    const overlayPaths = overlayCards.map((_, index) => join(tempDirectory, `overlay_${String(index + 1).padStart(3, '0')}.png`));

    try {
        await writeFile(sourceVideoPath, toUint8Array(sourceVideoBuffer));
        for (let i = 0; i < overlayCards.length; i++) {
            await writeFile(overlayPaths[i], toUint8Array(overlayCards[i].buffer));
        }

        const filterParts: string[] = ['[0:v]scale=-2:1920,crop=1080:1920,setsar=1[v0]'];
        const fadeInSeconds = 0.28;
        const fadeOutSeconds = 0.35;
        for (let i = 0; i < overlayCards.length; i++) {
            const inputIndex = i + 1;
            const overlayLabel = `ov${i + 1}`;
            const nextVideoLabel = `v${i + 1}`;
            const currentVideoLabel = i === 0 ? 'v0' : `v${i}`;
            const fadeOutStart = durationSeconds !== undefined
                ? Math.max(0, durationSeconds - fadeOutSeconds)
                : null;
            const overlayFilter = durationSeconds !== undefined
                ? `[${inputIndex}:v]format=rgba,fade=t=in:st=0:d=${fadeInSeconds}:alpha=1,fade=t=out:st=${fadeOutStart}:d=${fadeOutSeconds}:alpha=1[${overlayLabel}]`
                : `[${inputIndex}:v]format=rgba,fade=t=in:st=0:d=${fadeInSeconds}:alpha=1[${overlayLabel}]`;

            filterParts.push(overlayFilter);
            filterParts.push(`[${currentVideoLabel}][${overlayLabel}]overlay=${overlayCards[i].x}:${overlayCards[i].y}:format=auto:shortest=1:eof_action=pass[${nextVideoLabel}]`);
        }

        await runFfmpeg([
            '-y',
            '-i', sourceVideoPath,
            ...overlayPaths.flatMap((overlayPath) => ['-loop', '1', '-i', overlayPath]),
            '-filter_complex', filterParts.join(';'),
            '-map', `[v${overlayCards.length}]`,
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            ...(durationSeconds !== undefined ? ['-t', String(durationSeconds)] : ['-shortest']),
            outputVideoPath,
        ]);

        return await readFile(outputVideoPath);
    } finally {
        await rm(tempDirectory, { recursive: true, force: true });
    }
}

export async function composeVideoSequence(
    sourceVideoBuffers: readonly Buffer[],
    durationSeconds?: number,
): Promise<Buffer> {
    if (sourceVideoBuffers.length === 0) {
        throw new Error('At least one source video buffer is required to compose a sequence');
    }

    const tempDirectory = await mkdtemp(join(tmpdir(), 'lli-sequence-compose-'));
    const concatListPath = join(tempDirectory, 'concat.txt');
    const outputVideoPath = join(tempDirectory, 'output.mp4');
    const sourceVideoPaths = sourceVideoBuffers.map((_, index) => join(tempDirectory, `source_${String(index + 1).padStart(3, '0')}.mp4`));

    try {
        for (let i = 0; i < sourceVideoBuffers.length; i++) {
            await writeFile(sourceVideoPaths[i], toUint8Array(sourceVideoBuffers[i]));
        }
        await writeFile(concatListPath, sourceVideoPaths.map((sourceVideoPath) => `file '${sourceVideoPath.replace(/'/g, "'\\''")}'`).join('\n'));

        await runFfmpeg([
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concatListPath,
            '-c', 'copy',
            '-movflags', '+faststart',
            ...(durationSeconds !== undefined ? ['-t', String(durationSeconds)] : []),
            outputVideoPath,
        ]);

        return await readFile(outputVideoPath);
    } finally {
        await rm(tempDirectory, { recursive: true, force: true });
    }
}

async function composeNarratedVerticalVideoFromSources(
    sourceVideoBuffers: readonly Buffer[],
    narrationAudioBuffer: Buffer,
    targetDurationSeconds?: number,
): Promise<Buffer> {
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

        const audioPadFilter = buildAudioPadFilter(targetDurationSeconds);
        const filterComplex = audioPadFilter
            ? `[0:v]scale=-2:1920,crop=1080:1920,setsar=1[v];[1:a]${audioPadFilter}[aout]`
            : '[0:v]scale=-2:1920,crop=1080:1920,setsar=1[v]';
        const audioMap = audioPadFilter ? '[aout]' : '1:a';

        await runFfmpeg([
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concatListPath,
            '-i', narrationAudioPath,
            '-filter_complex', filterComplex,
            '-map', '[v]',
            '-map', audioMap,
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            ...buildDurationArgs(targetDurationSeconds),
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
    /**
     * When set, the output is hard-trimmed to this duration and audio is padded
     * with silence to reach it. Prevents narration truncation when clip total
     * is shorter than the storyboard's target, and prevents runaway output
     * when video outlasts narration. Omit to use legacy -shortest behaviour.
     */
    targetDurationSeconds?: number;
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

function isRecoverableMusicInputFailure(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    const message = error.message.toLowerCase();
    return message.includes('error opening input file')
        || message.includes('error opening input files')
        || message.includes('failed to read frame size')
        || message.includes('invalid argument');
}

async function runNarrationOnlyCompose(
    concatListPath: string,
    narrationPath: string,
    outputPath: string,
    scaleCrop: string,
    targetDurationSeconds?: number,
): Promise<void> {
    const audioPadFilter = buildAudioPadFilter(targetDurationSeconds);
    const filterComplex = audioPadFilter
        ? `[0:v]${scaleCrop}[v];[1:a]${audioPadFilter}[aout]`
        : `[0:v]${scaleCrop}[v]`;
    const audioMap = audioPadFilter ? '[aout]' : '1:a';

    await runFfmpeg([
        '-y',
        '-f', 'concat', '-safe', '0', '-i', concatListPath,
        '-i', narrationPath,
        '-filter_complex', filterComplex,
        '-map', '[v]',
        '-map', audioMap,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        ...buildDurationArgs(targetDurationSeconds),
        outputPath,
    ]);
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
        const { targetDurationSeconds } = opts;
        const audioPadFilter = buildAudioPadFilter(targetDurationSeconds);

        if (hasMusic) {
            await writeFile(musicPath, toUint8Array(musicAudioBuffer));

            // 3 inputs: concat video, narration, music
            // Narration and music are mixed; if targetDurationSeconds is set both
            // streams are padded to that length and output is hard-trimmed.
            try {
                const narrFilter = audioPadFilter ? `[1:a]volume=${opts.narrationVolume},${audioPadFilter}[narr]` : `[1:a]volume=${opts.narrationVolume}[narr]`;
                const musicFilter = audioPadFilter ? `[2:a]volume=${opts.musicVolume},${audioPadFilter}[music_padded]` : `[2:a]volume=${opts.musicVolume}[music_padded]`;

                await runFfmpeg([
                    '-y',
                    '-f', 'concat', '-safe', '0', '-i', concatListPath,
                    '-i', narrationPath,
                    '-i', musicPath,
                    '-filter_complex', [
                        `[0:v]${scaleCrop}[v]`,
                        narrFilter,
                        musicFilter,
                        '[music_padded][narr]amix=inputs=2:duration=longest:dropout_transition=2[aout]',
                    ].join(';'),
                    '-map', '[v]',
                    '-map', '[aout]',
                    '-c:v', 'libx264',
                    '-preset', 'medium',
                    '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-movflags', '+faststart',
                    ...buildDurationArgs(targetDurationSeconds),
                    outputPath,
                ]);
            } catch (error) {
                if (!isRecoverableMusicInputFailure(error)) {
                    throw error;
                }

                console.warn('[video-composer] Background music input failed validation. Retrying narrated compose without music.', error);
                await runNarrationOnlyCompose(concatListPath, narrationPath, outputPath, scaleCrop, targetDurationSeconds);
            }
        } else {
            await runNarrationOnlyCompose(concatListPath, narrationPath, outputPath, scaleCrop, targetDurationSeconds);
        }

        return await readFile(outputPath);
    } finally {
        await rm(tempDirectory, { recursive: true, force: true });
    }
}
