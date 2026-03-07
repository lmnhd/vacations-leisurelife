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

export async function composeNarratedVerticalVideo(sourceVideoBuffer: Buffer, narrationAudioBuffer: Buffer): Promise<Buffer> {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'lli-tiktok-compose-'));
    const sourceVideoPath = join(tempDirectory, 'source.mp4');
    const narrationAudioPath = join(tempDirectory, 'narration.mp3');
    const outputVideoPath = join(tempDirectory, 'output.mp4');

    try {
        await writeFile(sourceVideoPath, toUint8Array(sourceVideoBuffer));
        await writeFile(narrationAudioPath, toUint8Array(narrationAudioBuffer));

        await runFfmpeg([
            '-y',
            '-stream_loop', '-1',
            '-i', sourceVideoPath,
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
