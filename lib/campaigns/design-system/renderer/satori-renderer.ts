import React from 'react';
import satori from 'satori';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import sharp from 'sharp';

interface FontFace {
    name: string;
    weight?: SatoriWeight;
    style?: 'normal' | 'italic';
    data: Buffer;
}

export type FontFamily = 'Sans' | 'Serif' | 'Mono' | 'Hand' | 'Marker';

const FONT_REGISTRY: Record<FontFamily, { candidates: string[]; weight: number; style: 'normal' | 'italic' }[]> = {
    Sans: [
        { candidates: [path.join(process.cwd(), 'public', 'fonts', 'Geist-Regular.ttf'), path.join(process.cwd(), 'public', 'fonts', 'Inter-Regular.ttf')], weight: 400, style: 'normal' },
        { candidates: [path.join(process.cwd(), 'public', 'fonts', 'Geist-Bold.ttf'), path.join(process.cwd(), 'public', 'fonts', 'Inter-Bold.ttf')], weight: 700, style: 'normal' },
        { candidates: [path.join(process.cwd(), 'public', 'fonts', 'Geist-Black.ttf'), path.join(process.cwd(), 'public', 'fonts', 'Inter-Black.ttf')], weight: 900, style: 'normal' },
    ],
    Serif: [
        { candidates: [path.join(process.cwd(), 'public', 'fonts', 'Newsreader-Regular.ttf')], weight: 400, style: 'normal' },
        { candidates: [path.join(process.cwd(), 'public', 'fonts', 'Newsreader-Italic.ttf')], weight: 400, style: 'italic' },
        { candidates: [path.join(process.cwd(), 'public', 'fonts', 'Newsreader-Bold.ttf')], weight: 700, style: 'normal' },
    ],
    Mono: [
        { candidates: [path.join(process.cwd(), 'public', 'fonts', 'JetBrainsMono-Regular.ttf')], weight: 400, style: 'normal' },
    ],
    Hand: [
        { candidates: [path.join(process.cwd(), 'public', 'fonts', 'Caveat-Regular.ttf'), path.join(process.cwd(), 'public', 'fonts', 'Kalam-Regular.ttf')], weight: 400, style: 'normal' },
    ],
    Marker: [
        { candidates: [path.join(process.cwd(), 'public', 'fonts', 'PermanentMarker-Regular.ttf')], weight: 400, style: 'normal' },
    ],
};

const FALLBACK_CANDIDATES = [
    path.join(process.cwd(), 'public', 'fonts', 'Inter-Regular.ttf'),
    path.join(process.cwd(), 'public', 'fonts', 'Geist-Regular.ttf'),
    'C:\\Windows\\Fonts\\arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];

const fontCache = new Map<string, Buffer>();

function findFontFile(candidates: string[]): string | null {
    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate;
    }
    return null;
}

function loadFontFile(path: string): Buffer {
    const cached = fontCache.get(path);
    if (cached) return cached;
    const data = readFileSync(path);
    fontCache.set(path, data);
    return data;
}

type SatoriWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

function toSatoriWeight(w: number): SatoriWeight {
    if (w <= 100) return 100;
    if (w <= 200) return 200;
    if (w <= 300) return 300;
    if (w <= 400) return 400;
    if (w <= 500) return 500;
    if (w <= 600) return 600;
    if (w <= 700) return 700;
    if (w <= 800) return 800;
    return 900;
}

function buildFontFaces(requestedFamilies?: FontFamily[]): FontFace[] {
    const families = requestedFamilies ?? ['Sans'];
    const faces: FontFace[] = [];

    for (const family of families) {
        const entries = FONT_REGISTRY[family] ?? [];
        for (const entry of entries) {
            const filePath = findFontFile(entry.candidates);
            if (filePath) {
                faces.push({
                    name: family,
                    data: loadFontFile(filePath),
                    weight: toSatoriWeight(entry.weight),
                    style: entry.style,
                });
            }
        }
    }

    // Always include Sans fallback if no Sans face was resolved
    if (!faces.some((f) => f.name === 'Sans')) {
        const fallbackPath = findFontFile(FALLBACK_CANDIDATES);
        if (fallbackPath) {
            faces.push({ name: 'Sans', data: loadFontFile(fallbackPath), weight: 400, style: 'normal' });
        }
    }

    if (faces.length === 0) {
        throw new Error('No usable fonts found for Satori rendering. Add public/fonts/Inter-Regular.ttf or run on a host with Arial/DejaVu Sans.');
    }

    return faces;
}

export interface RenderPngOptions {
    width: number;
    height: number;
    fonts?: FontFamily[];
}

export async function renderPngFromElement(
    element: React.ReactElement,
    options: RenderPngOptions,
): Promise<Buffer> {
    const { width, height, fonts } = options;
    const svg = await satori(element, {
        width,
        height,
        fonts: buildFontFaces(fonts),
    });

    // Rasterize the Satori SVG via Sharp to avoid native platform/runtime issues
    // from direct Resvg imports during route module evaluation.
    return sharp(Buffer.from(svg))
        .resize(width, height, { fit: 'fill' })
        .png()
        .toBuffer();
}

export function imageBufferToDataUri(buffer: Buffer, mimeType = 'image/png'): string {
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
}
