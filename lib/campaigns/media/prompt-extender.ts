export interface PromptExtenderCategory {
    readonly id: string;
    readonly label: string;
    /**
     * Append this extender to every Nth image in the batch.
     * 1 = every image, 2 = every other image, 3 = every third, etc.
     * Images that don't receive this extender get nothing from this category —
     * the main prompt carries the frame on its own.
     */
    readonly applyToEveryN: number;
    readonly options: readonly string[];
}

export const DEFAULT_PROMPT_EXTENDERS: readonly PromptExtenderCategory[] = [
    {
        id: 'time_of_day',
        label: 'Time of Day',
        applyToEveryN: 1,
        options: [
            'Time of day: early morning golden hour; warm low-angle light, long soft shadows, calm unhurried atmosphere',
            'Time of day: late morning; bright but not harsh, sea sparkle, clear visibility across the full deck',
            'Time of day: midday overcast; flat diffuse light, clean whites, no dramatic shadows — suits glass and interior spaces',
            'Time of day: late afternoon; warm directional side-light, amber tones building toward the horizon',
            'Time of day: dusk blue hour; deep indigo sky, warm interior lamps glowing against the darkening sea',
        ],
    },
    {
        id: 'crowd_composition',
        label: 'Crowd Composition',
        applyToEveryN: 1,
        options: [
            'Group of 3–4 adults, mixed gender, ages mid-30s to mid-50s, casually dressed and self-directed',
            'Small cluster of 4–5; majority women, relaxed and engaged with each other rather than the camera',
            'Intergenerational group: one or two people visibly in their 60s alongside others in their 40s',
            'Intimate foreground pair with one or two background figures; the pair share clear focus and easy chemistry',
            'Wider social group of 5–6 spread naturally across the space; no posed or symmetrical arrangement',
        ],
    },
    {
        id: 'ethnic_diversity',
        label: 'Ethnic Diversity',
        applyToEveryN: 2,
        options: [
            'Ethnically diverse group; at least one person of color clearly visible in the foreground or mid-ground',
            'Mixed heritage across the group; diversity reads naturally, not as a staged stock-photo arrangement',
            'Visibly multiracial; no single ethnicity dominates the frame; representation feels incidental and real',
        ],
    },
    {
        id: 'energy_level',
        label: 'Energy Level',
        applyToEveryN: 2,
        options: [
            'Energy: calm and settled; people at rest, quiet conversation, no urgency or motion',
            'Energy: engaged but low-key; leaning in, pointing outward, sharing attention — focused but unhurried',
            'Energy: gently animated; a laugh mid-exchange or a gesture toward the horizon; spontaneous, not performative',
        ],
    },
];

/**
 * Assigns prompt extender strings to each image position in a batch.
 *
 * Returns an array of length `batchSize`. Each entry is an array of extender
 * strings to append to that image's prompt. Entries may be empty when no
 * category fires for that position.
 *
 * Each category cycles through its options independently, round-robin by
 * fire-count. Assignment is purely positional — same batchSize always produces
 * the same distribution, which is the point.
 */
export function assignExtendersToBatch(
    batchSize: number,
    categories: readonly PromptExtenderCategory[] = DEFAULT_PROMPT_EXTENDERS,
): string[][] {
    const result: string[][] = Array.from({ length: batchSize }, () => []);

    for (const category of categories) {
        let fireCount = 0;
        for (let i = 0; i < batchSize; i++) {
            if (i % category.applyToEveryN === 0) {
                result[i].push(category.options[fireCount % category.options.length]);
                fireCount += 1;
            }
        }
    }

    return result;
}
