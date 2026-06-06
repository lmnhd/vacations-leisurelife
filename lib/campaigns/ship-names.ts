const CRUISE_LINE_PREFIX_PATTERN =
    /\b(royal caribbean(?: international)?|celebrity cruises?|celebrity|norwegian cruise line|norwegian|ncl|carnival cruise line|carnival|princess cruises?)\b/g;

export const KNOWN_SPECIFIC_SHIP_NAMES = [
    'icon of the seas',
    'star of the seas',
    'utopia of the seas',
    'wonder of the seas',
    'oasis of the seas',
    'allure of the seas',
    'symphony of the seas',
    'harmony of the seas',
    'quantum of the seas',
    'anthem of the seas',
    'ovation of the seas',
    'odyssey of the seas',
    'spectrum of the seas',
    'freedom of the seas',
    'liberty of the seas',
    'independence of the seas',
    'voyager of the seas',
    'explorer of the seas',
    'adventure of the seas',
    'navigator of the seas',
    'mariner of the seas',
    'radiance of the seas',
    'brilliance of the seas',
    'jewel of the seas',
    'serenade of the seas',
    'vision of the seas',
    'enchantment of the seas',
    'grandeur of the seas',
    'rhapsody of the seas',
    'celebrity edge',
    'celebrity apex',
    'celebrity beyond',
    'celebrity ascent',
    'celebrity silhouette',
    'celebrity solstice',
    'celebrity equinox',
    'celebrity eclipse',
    'celebrity reflection',
    'norwegian gem',
    'norwegian joy',
    'norwegian bliss',
    'norwegian escape',
    'norwegian encore',
    'norwegian breakaway',
    'norwegian getaway',
    'carnival celebration',
    'carnival jubilee',
    'carnival mardi gras',
    'caribbean princess',
    'regal princess',
    'royal princess',
] as const;

export function normalizeShipNameText(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
}

export function normalizeSpecificShipName(value?: string | null): string | null {
    const normalized = normalizeShipNameText(value ?? '')
        .replace(CRUISE_LINE_PREFIX_PATTERN, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalized || normalized.includes(' class')) {
        return null;
    }

    return KNOWN_SPECIFIC_SHIP_NAMES.includes(normalized as (typeof KNOWN_SPECIFIC_SHIP_NAMES)[number])
        ? normalized
        : null;
}

export function findMentionedKnownShips(value: string): string[] {
    const normalized = normalizeShipNameText(value).replace(/\s+/g, ' ').trim();
    return KNOWN_SPECIFIC_SHIP_NAMES.filter((shipName) => normalized.includes(shipName));
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function replaceMentionedKnownShips(
    value: string,
    canonicalShipName?: string | null,
): string {
    const canonical = canonicalShipName?.trim();
    if (!value || !canonical) {
        return value;
    }

    const canonicalSpecific = normalizeSpecificShipName(canonical);
    let output = value;

    for (const shipName of KNOWN_SPECIFIC_SHIP_NAMES) {
        if (canonicalSpecific && shipName === canonicalSpecific) {
            continue;
        }

        const pattern = new RegExp(`(^|[^a-zA-Z0-9])(${escapeRegExp(shipName)})(?=$|[^a-zA-Z0-9])`, 'gi');
        output = output.replace(pattern, (_match, prefix: string) => `${prefix}${canonical}`);
    }

    return output;
}
