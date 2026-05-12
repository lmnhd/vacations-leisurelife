import sharp from 'sharp';
import { ImageFormat } from '../../schema';

// ────────────────────────────────────────────────────────────────────────────
// Sharp Image Processor
// Server-side resize/crop of source images into all platform formats.
// All output is WebP quality 85.
// ────────────────────────────────────────────────────────────────────────────

interface CropSpec {
    format: ImageFormat;
    width: number;
    height: number;
    suffix: string;
}

const PLATFORM_CROPS: CropSpec[] = [
    { format: 'hero_16x9', width: 1920, height: 1080, suffix: '16x9' },
    { format: 'hero_4x5', width: 1080, height: 1350, suffix: '4x5' },
    { format: 'story_9x16', width: 1080, height: 1920, suffix: '9x16' },
    { format: 'square_1x1', width: 1080, height: 1080, suffix: '1x1' },
    { format: 'banner_3x1', width: 1500, height: 500, suffix: '3x1' },
    { format: 'email_header', width: 600, height: 300, suffix: 'email' },
    { format: 'og_image', width: 1200, height: 630, suffix: 'og' },
    { format: 'thumbnail', width: 400, height: 225, suffix: 'thumb' },
];

export interface CroppedImage {
    buffer: Buffer;
    format: ImageFormat;
    width: number;
    height: number;
    fileName: string;
    assetId: string;
}

/**
 * Generates all platform crop variants from a single source image.
 * Uses Sharp's 'cover' fit strategy (crops to fill exact dimensions).
 */
export async function generatePlatformCrops(
    sourceBuffer: Buffer,
    sourceId: string,
    formats?: readonly ImageFormat[],
): Promise<CroppedImage[]> {
    const results: CroppedImage[] = [];
    const cropsToGenerate = formats && formats.length > 0
        ? PLATFORM_CROPS.filter((crop) => formats.includes(crop.format))
        : PLATFORM_CROPS;

    for (const crop of cropsToGenerate) {
        const croppedBuffer = await sharp(sourceBuffer)
            .resize(crop.width, crop.height, { fit: 'cover', position: 'attention' })
            .webp({ quality: 85 })
            .toBuffer();

        results.push({
            buffer: croppedBuffer,
            format: crop.format,
            width: crop.width,
            height: crop.height,
            fileName: `images/hero/${sourceId}_${crop.suffix}.webp`,
            assetId: `${sourceId}_${crop.suffix}`,
        });
    }

    return results;
}

/**
 * Isolates a design on a white background — used for merch print-readiness.
 * Flattens alpha channel onto pure white.
 */
export async function isolateOnWhiteBackground(sourceBuffer: Buffer): Promise<Buffer> {
    return sharp(sourceBuffer)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .webp({ quality: 95 })
        .toBuffer();
}

/**
 * Converts any image buffer to WebP format.
 */
export async function toWebp(sourceBuffer: Buffer, quality: number = 85): Promise<Buffer> {
    return sharp(sourceBuffer)
        .webp({ quality })
        .toBuffer();
}
