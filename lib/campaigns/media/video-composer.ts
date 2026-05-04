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

const CONTAINED_STILL_FPS = 30;
const CONTAINED_STILL_FEATHER_PX = 32;
const CONTAINED_STILL_BG_TOTAL_ZOOM = 0.05;

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

        const totalFrames = Math.max(2, Math.round(durationSeconds * CONTAINED_STILL_FPS));
        const zoomStep = CONTAINED_STILL_BG_TOTAL_ZOOM / (totalFrames - 1);
        const featherDivisor = CONTAINED_STILL_FEATHER_PX;

        await runFfmpeg([
            '-y',
            '-loop', '1',
            '-i', sourceImagePath,
            '-t', String(durationSeconds),
            '-filter_complex', [
                '[0:v]split=2[bg_src][fg_src]',
                // Backdrop: cover-fit, blurred, color-graded, slow parallax zoom (gives motion without touching foreground truth)
                `[bg_src]scale=2200:2200:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=18:1,eq=brightness=-0.10:saturation=0.78,zoompan=z='zoom+${zoomStep.toFixed(6)}':d=${totalFrames}:s=1080x1920:fps=${CONTAINED_STILL_FPS}[bg]`,
                // Foreground: contained-fit (no crop), feathered alpha edges so the seam against the backdrop is invisible
                `[fg_src]scale=1080:1920:force_original_aspect_ratio=decrease,setsar=1,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='clip(min(min(X,W-X),min(Y,H-Y))*255/${featherDivisor},0,255)'[fg]`,
                '[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1:format=auto[v]',
            ].join(';'),
            '-map', '[v]',
            '-r', String(CONTAINED_STILL_FPS),
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

export interface OverlayComposeOptions {
    /** When true (default), applies a subtle film grain to unify type and photo. */
    applyFilmGrain?: boolean;
    /** ffmpeg `noise` strength, 0-100. Subtle is 4-8. Default 6. */
    grainStrength?: number;
    /**
     * When non-empty, treated as fixed (non-fading) overlays. Use this for brand
     * marks that should persist across the full clip while card overlays fade.
     */
    fixedOverlays?: readonly VideoOverlayCardInput[];
}

export async function composeVideoWithOverlayCards(
    sourceVideoBuffer: Buffer,
    overlayCards: readonly VideoOverlayCardInput[],
    durationSeconds?: number,
    options: OverlayComposeOptions = {},
): Promise<Buffer> {
    const fixedOverlays = options.fixedOverlays ?? [];
    if (overlayCards.length === 0 && fixedOverlays.length === 0) {
        return sourceVideoBuffer;
    }

    const applyFilmGrain = options.applyFilmGrain ?? true;
    const grainStrength = Math.max(0, Math.min(100, options.grainStrength ?? 6));

    const tempDirectory = await mkdtemp(join(tmpdir(), 'lli-overlay-compose-'));
    const sourceVideoPath = join(tempDirectory, 'source.mp4');
    const outputVideoPath = join(tempDirectory, 'output.mp4');
    const fadingPaths = overlayCards.map((_, index) => join(tempDirectory, `overlay_${String(index + 1).padStart(3, '0')}.png`));
    const fixedPaths = fixedOverlays.map((_, index) => join(tempDirectory, `fixed_${String(index + 1).padStart(3, '0')}.png`));

    try {
        await writeFile(sourceVideoPath, toUint8Array(sourceVideoBuffer));
        for (let i = 0; i < overlayCards.length; i++) {
            await writeFile(fadingPaths[i], toUint8Array(overlayCards[i].buffer));
        }
        for (let i = 0; i < fixedOverlays.length; i++) {
            await writeFile(fixedPaths[i], toUint8Array(fixedOverlays[i].buffer));
        }

        const filterParts: string[] = ['[0:v]scale=-2:1920,crop=1080:1920,setsar=1[v0]'];
        const fadeInSeconds = 0.28;
        const fadeOutSeconds = 0.35;
        let videoStepIndex = 0;
        let inputCursor = 1;

        for (let i = 0; i < overlayCards.length; i++) {
            const inputIndex = inputCursor++;
            const overlayLabel = `ov${i + 1}`;
            const nextVideoLabel = `v${videoStepIndex + 1}`;
            const currentVideoLabel = `v${videoStepIndex}`;
            const fadeOutStart = durationSeconds !== undefined
                ? Math.max(0, durationSeconds - fadeOutSeconds)
                : null;
            const overlayFilter = fadeOutStart !== null
                ? `[${inputIndex}:v]format=rgba,fade=t=in:st=0:d=${fadeInSeconds}:alpha=1,fade=t=out:st=${fadeOutStart}:d=${fadeOutSeconds}:alpha=1[${overlayLabel}]`
                : `[${inputIndex}:v]format=rgba,fade=t=in:st=0:d=${fadeInSeconds}:alpha=1[${overlayLabel}]`;

            filterParts.push(overlayFilter);
            filterParts.push(`[${currentVideoLabel}][${overlayLabel}]overlay=${overlayCards[i].x}:${overlayCards[i].y}:format=auto:shortest=1:eof_action=pass[${nextVideoLabel}]`);
            videoStepIndex += 1;
        }

        for (let i = 0; i < fixedOverlays.length; i++) {
            const inputIndex = inputCursor++;
            const overlayLabel = `fx${i + 1}`;
            const nextVideoLabel = `v${videoStepIndex + 1}`;
            const currentVideoLabel = `v${videoStepIndex}`;
            filterParts.push(`[${inputIndex}:v]format=rgba[${overlayLabel}]`);
            filterParts.push(`[${currentVideoLabel}][${overlayLabel}]overlay=${fixedOverlays[i].x}:${fixedOverlays[i].y}:format=auto:shortest=1:eof_action=pass[${nextVideoLabel}]`);
            videoStepIndex += 1;
        }

        const lastVideoLabel = `v${videoStepIndex}`;
        const finalLabel = applyFilmGrain && grainStrength > 0 ? 'vfinal' : lastVideoLabel;
        if (applyFilmGrain && grainStrength > 0) {
            filterParts.push(`[${lastVideoLabel}]noise=alls=${grainStrength}:allf=t+u[${finalLabel}]`);
        }

        await runFfmpeg([
            '-y',
            '-i', sourceVideoPath,
            ...fadingPaths.flatMap((overlayPath) => ['-loop', '1', '-i', overlayPath]),
            ...fixedPaths.flatMap((overlayPath) => ['-loop', '1', '-i', overlayPath]),
            '-filter_complex', filterParts.join(';'),
            '-map', `[${finalLabel}]`,
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

export async function composeVideoSequenceWithTransitions(
    sourceVideoBuffers: readonly Buffer[],
    sourceDurationsSeconds: readonly number[],
    transitionSeconds = 0.28,
): Promise<Buffer> {
    if (sourceVideoBuffers.length === 0) {
        throw new Error('At least one source video buffer is required to compose a transition sequence');
    }

    if (sourceVideoBuffers.length !== sourceDurationsSeconds.length) {
        throw new Error('sourceVideoBuffers and sourceDurationsSeconds must have the same length');
    }

    if (sourceVideoBuffers.length === 1) {
        return sourceVideoBuffers[0];
    }

    const safeTransitionSeconds = Math.max(0.08, Math.min(transitionSeconds, Math.min(...sourceDurationsSeconds) / 3));

    const tempDirectory = await mkdtemp(join(tmpdir(), 'lli-transition-sequence-'));
    const outputVideoPath = join(tempDirectory, 'output.mp4');
    const sourceVideoPaths = sourceVideoBuffers.map((_, index) => join(tempDirectory, `source_${String(index + 1).padStart(3, '0')}.mp4`));

    try {
        for (let i = 0; i < sourceVideoBuffers.length; i++) {
            await writeFile(sourceVideoPaths[i], toUint8Array(sourceVideoBuffers[i]));
        }

        const filterParts: string[] = sourceVideoPaths.map((_, index) => `[${index}:v]setpts=PTS-STARTPTS,format=yuv420p[v${index}]`);
        let currentLabel = 'v0';
        let cumulativeDuration = sourceDurationsSeconds[0];

        for (let i = 1; i < sourceVideoPaths.length; i += 1) {
            const outputLabel = `x${i}`;
            const offsetSeconds = Math.max(0, cumulativeDuration - (safeTransitionSeconds * i));
            filterParts.push(`[${currentLabel}][v${i}]xfade=transition=fade:duration=${safeTransitionSeconds}:offset=${offsetSeconds}[${outputLabel}]`);
            cumulativeDuration += sourceDurationsSeconds[i];
            currentLabel = outputLabel;
        }

        const tailHoldSeconds = safeTransitionSeconds * (sourceVideoPaths.length - 1);
        const finalLabel = tailHoldSeconds > 0 ? 'vout' : currentLabel;
        if (tailHoldSeconds > 0) {
            filterParts.push(`[${currentLabel}]tpad=stop_mode=clone:stop_duration=${tailHoldSeconds}[${finalLabel}]`);
        }

        await runFfmpeg([
            '-y',
            ...sourceVideoPaths.flatMap((sourceVideoPath) => ['-i', sourceVideoPath]),
            '-filter_complex', filterParts.join(';'),
            '-map', `[${finalLabel}]`,
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            outputVideoPath,
        ]);

        return await readFile(outputVideoPath);
    } finally {
        await rm(tempDirectory, { recursive: true, force: true });
    }
}

export async function composeAudioSequence(
    sourceAudioBuffers: readonly Buffer[],
): Promise<Buffer> {
    if (sourceAudioBuffers.length === 0) {
        throw new Error('At least one source audio buffer is required to compose an audio sequence');
    }

    if (sourceAudioBuffers.length === 1) {
        return sourceAudioBuffers[0];
    }

    const tempDirectory = await mkdtemp(join(tmpdir(), 'lli-audio-sequence-'));
    const concatListPath = join(tempDirectory, 'concat.txt');
    const outputAudioPath = join(tempDirectory, 'output.mp3');
    const sourceAudioPaths = sourceAudioBuffers.map((_, index) => join(tempDirectory, `source_${String(index + 1).padStart(3, '0')}.mp3`));

    try {
        for (let i = 0; i < sourceAudioBuffers.length; i++) {
            await writeFile(sourceAudioPaths[i], toUint8Array(sourceAudioBuffers[i]));
        }
        await writeFile(concatListPath, sourceAudioPaths.map((sourceAudioPath) => `file '${sourceAudioPath.replace(/'/g, "'\\''")}'`).join('\n'));

        await runFfmpeg([
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concatListPath,
            '-c:a', 'libmp3lame',
            '-q:a', '4',
            outputAudioPath,
        ]);

        return await readFile(outputAudioPath);
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
    musicVolume: 0.2,
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
