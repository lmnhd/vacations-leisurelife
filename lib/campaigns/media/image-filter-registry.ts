import sharp from 'sharp';

export interface ImageFilter {
    readonly id: string;
    readonly label: string;
    apply(buffer: Buffer): Promise<Buffer>;
}

// ── Grain overlay ─────────────────────────────────────────────────────────────
// sharp has no native grain API. We generate a random-noise buffer and
// composite it over the image using soft-light blend, which adds texture
// without significantly shifting the overall exposure.

async function applyGrain(buffer: Buffer, intensity: number): Promise<Buffer> {
    const { width = 1920, height = 1080 } = await sharp(buffer).metadata();
    const pixelCount = width * height;
    const raw = Buffer.allocUnsafe(pixelCount * 3);

    for (let i = 0; i < raw.length; i++) {
        raw[i] = Math.max(0, Math.min(255, 128 + Math.round((Math.random() - 0.5) * intensity * 255)));
    }

    const grainBuffer = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();

    return sharp(buffer)
        .composite([{ input: grainBuffer, blend: 'soft-light' }])
        .toBuffer();
}

// ── Filter definitions ────────────────────────────────────────────────────────

const kodachrome70sFilter: ImageFilter = {
    id: 'kodachrome_70s',
    label: 'Kodachrome 70s',
    async apply(buffer) {
        // Warm reds/ambers, gentle highlight rolloff, fine grain
        const graded = await sharp(buffer)
            .recomb([
                [1.08,  0.02, -0.05],
                [-0.02, 1.00,  0.00],
                [-0.03, -0.02, 0.95],
            ])
            .modulate({ saturation: 1.1, brightness: 1.02 })
            .gamma(1.05)
            .toBuffer();
        return applyGrain(graded, 0.08);
    },
};

const ektachrome80sFilter: ImageFilter = {
    id: 'ektachrome_80s',
    label: 'Ektachrome 80s',
    async apply(buffer) {
        // Crisp blue-cyan, punchy slide-film contrast
        const graded = await sharp(buffer)
            .recomb([
                [ 0.95, 0.00,  0.02],
                [ 0.00, 1.00,  0.05],
                [-0.05, 0.05,  1.12],
            ])
            .modulate({ saturation: 1.18, brightness: 1.04 })
            .linear(1.06, -4)
            .toBuffer();
        return applyGrain(graded, 0.05);
    },
};

const polaroidExpiredFilter: ImageFilter = {
    id: 'polaroid_expired',
    label: 'Expired Polaroid',
    async apply(buffer) {
        // Creamy warm cast, softened blacks, subtle diffusion
        const graded = await sharp(buffer)
            .tint({ r: 245, g: 238, b: 220 })
            .modulate({ saturation: 0.82, brightness: 1.05 })
            .blur(0.4)
            .linear(0.88, 18)  // compress contrast + lift black floor — achieves milky Polaroid shadows
            .toBuffer();
        return applyGrain(graded, 0.12);
    },
};

const crossProcessFilter: ImageFilter = {
    id: 'cross_process',
    label: 'Cross Process',
    async apply(buffer) {
        // Restrained cyan shadows, warm highlights, compressed tonal range
        const graded = await sharp(buffer)
            .recomb([
                [ 1.00, -0.04,  0.08],
                [-0.06,  1.02,  0.04],
                [ 0.08,  0.06,  0.88],
            ])
            .modulate({ saturation: 1.15 })
            .linear(1.08, -8)
            .toBuffer();
        return applyGrain(graded, 0.07);
    },
};

// ── Registry ──────────────────────────────────────────────────────────────────
// Add new filters here. The registry is the only place that needs to change
// when a new filter is introduced — selectFiltersForBatch picks from this list.

export const IMAGE_FILTER_REGISTRY: readonly ImageFilter[] = [
    kodachrome70sFilter,
    ektachrome80sFilter,
    polaroidExpiredFilter,
    crossProcessFilter,
];

// ── Batch selection ───────────────────────────────────────────────────────────

function seededShuffle<T>(array: readonly T[], seed: string): T[] {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
        hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619) >>> 0;
    }
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        hash = Math.imul(hash ^ i, 16777619) >>> 0;
        const j = hash % (i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

/**
 * Returns an array of length `batchSize`.
 * Exactly `filterCount` entries are distinct ImageFilter instances.
 * The remaining entries are null (no filter applied — clean AI output).
 *
 * Which positions are filtered and which filter each receives is derived
 * deterministically from `seed`, so the same campaign always produces the
 * same assignment across re-runs.
 *
 * Throws if filterCount exceeds the registry size (would require repeating a
 * filter) or exceeds the batch size.
 */
export function selectFiltersForBatch(
    batchSize: number,
    filterCount: number,
    seed: string,
): Array<ImageFilter | null> {
    if (filterCount > IMAGE_FILTER_REGISTRY.length) {
        throw new Error(
            `filterCount (${filterCount}) exceeds IMAGE_FILTER_REGISTRY size ` +
            `(${IMAGE_FILTER_REGISTRY.length}). Add more filters or reduce filterCount.`,
        );
    }
    if (filterCount > batchSize) {
        throw new Error(
            `filterCount (${filterCount}) cannot exceed batchSize (${batchSize}).`,
        );
    }

    const filteredPositions = new Set(
        seededShuffle(Array.from({ length: batchSize }, (_, i) => i), seed).slice(0, filterCount),
    );
    const assignedFilters = seededShuffle(IMAGE_FILTER_REGISTRY, `${seed}_filters`).slice(0, filterCount);

    const result: Array<ImageFilter | null> = Array(batchSize).fill(null);
    let filterIdx = 0;
    for (const pos of filteredPositions) {
        result[pos] = assignedFilters[filterIdx++];
    }
    return result;
}
