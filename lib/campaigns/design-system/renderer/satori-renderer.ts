import React from 'react';
import satori from 'satori';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import sharp from 'sharp';

const FONT_CANDIDATES = [
    path.join(process.cwd(), 'public', 'fonts', 'Inter-Regular.ttf'),
    path.join(process.cwd(), 'public', 'fonts', 'Geist-Regular.ttf'),
    'C:\\Windows\\Fonts\\arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];

let cachedFont: Buffer | null = null;

function loadFont(): Buffer {
    if (cachedFont) {
        return cachedFont;
    }

    const fontPath = FONT_CANDIDATES.find((candidate) => existsSync(candidate));
    if (!fontPath) {
        throw new Error('No usable font found for Satori rendering. Add public/fonts/Inter-Regular.ttf or run on a host with Arial/DejaVu Sans.');
    }

    cachedFont = readFileSync(fontPath);
    return cachedFont;
}

export async function renderPngFromElement(
    element: React.ReactElement,
    dimensions: { width: number; height: number },
): Promise<Buffer> {
    const svg = await satori(element, {
        ...dimensions,
        fonts: [
            {
                name: 'AdSans',
                data: loadFont(),
                weight: 400,
                style: 'normal',
            },
        ],
    });

    // Rasterize the Satori SVG via Sharp to avoid native platform/runtime issues
    // from direct Resvg imports during route module evaluation.
    return sharp(Buffer.from(svg))
        .resize(dimensions.width, dimensions.height, { fit: 'fill' })
        .png()
        .toBuffer();
}

export function imageBufferToDataUri(buffer: Buffer, mimeType = 'image/png'): string {
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
}
