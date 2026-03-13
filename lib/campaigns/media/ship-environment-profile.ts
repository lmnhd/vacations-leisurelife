const SHIP_FAMILY_PROFILES = [
    {
        ships: [
            'celebrity silhouette',
            'celebrity solstice',
            'celebrity equinox',
            'celebrity eclipse',
            'celebrity reflection',
        ],
        familyKeywords: ['solstice class', 'solstice-class', 'lawn club'],
        supportsRealGrassDeck: true,
        supportsBotanicalGardenDeck: false,
    },
    {
        ships: [
            'celebrity edge',
            'celebrity apex',
            'celebrity beyond',
            'celebrity ascent',
            'celebrity xcel',
        ],
        familyKeywords: ['edge class', 'edge-class', 'rooftop garden'],
        supportsRealGrassDeck: false,
        supportsBotanicalGardenDeck: true,
    },
] as const;

function normalizeShipText(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getShipFamilyProfile(shipName: string) {
    const normalizedShipName = normalizeShipText(shipName);
    return SHIP_FAMILY_PROFILES.find((profile) =>
        profile.ships.includes(normalizedShipName)
        || profile.familyKeywords.some((keyword) => normalizedShipName.includes(keyword))
    ) ?? null;
}

function includesAnyTerm(haystack: string, terms: readonly string[]): boolean {
    return terms.some((term) => haystack.includes(term));
}

export function getSiblingShipNames(shipName: string): string[] {
    const normalizedShipName = normalizeShipText(shipName);
    const profile = getShipFamilyProfile(shipName);
    if (!profile) {
        return [];
    }

    return profile.ships.filter((candidate) => candidate !== normalizedShipName);
}

export function getShipFamilyKeywords(shipName: string): string[] {
    return [...(getShipFamilyProfile(shipName)?.familyKeywords ?? [])];
}

export function shipSupportsRealGrassDeck(shipName: string): boolean {
    return getShipFamilyProfile(shipName)?.supportsRealGrassDeck === true;
}

export function shipSupportsBotanicalGardenDeck(shipName: string): boolean {
    return getShipFamilyProfile(shipName)?.supportsBotanicalGardenDeck === true;
}

export function metadataSupportsShipLandscapeFeature(shipName: string, metadataText: string): boolean {
    const normalizedMetadata = normalizeShipText(metadataText);

    if (shipSupportsRealGrassDeck(shipName)) {
        const hasGrassCue = includesAnyTerm(normalizedMetadata, ['lawn club', 'real grass', 'grass deck', 'grass']);
        const hasShipCue = includesAnyTerm(normalizedMetadata, ['cruise', 'ship', 'deck', normalizeShipText(shipName)]);
        return hasGrassCue && hasShipCue;
    }

    if (shipSupportsBotanicalGardenDeck(shipName)) {
        const hasGardenCue = includesAnyTerm(normalizedMetadata, ['rooftop garden', 'garden deck', 'botanical deck', 'botanical garden']);
        const hasShipCue = includesAnyTerm(normalizedMetadata, ['cruise', 'ship', 'deck', normalizeShipText(shipName)]);
        return hasGardenCue && hasShipCue;
    }

    return false;
}

export function metadataContainsKnownShipLandscapeFeature(metadataText: string): boolean {
    const normalizedMetadata = normalizeShipText(metadataText);

    return SHIP_FAMILY_PROFILES.some((profile) => {
        const mentionsKnownShipOrFamily = includesAnyTerm(normalizedMetadata, profile.ships)
            || includesAnyTerm(normalizedMetadata, profile.familyKeywords);

        if (!mentionsKnownShipOrFamily) {
            return false;
        }

        if (profile.supportsRealGrassDeck) {
            return includesAnyTerm(normalizedMetadata, ['lawn club', 'real grass', 'grass deck', 'grass']);
        }

        if (profile.supportsBotanicalGardenDeck) {
            return includesAnyTerm(normalizedMetadata, ['rooftop garden', 'garden deck', 'botanical deck', 'botanical garden']);
        }

        return false;
    });
}

export function buildShipLandscapeGuardrails(shipName?: string): { reality: string; avoid: string } {
    if (!shipName) {
        return {
            reality: 'Landscape rule: stay clearly shipboard; any greenery must remain secondary to marine architecture, railings, deck edges, glazing, or open sea context',
            avoid: 'invented resort lawns, generic grass fields, hedges, flower beds, backyard patios, hotel courtyards, villa terraces, or land-based garden drift',
        };
    }

    if (shipSupportsRealGrassDeck(shipName)) {
        return {
            reality: 'Landscape rule: real shipboard grass is allowed only when it reads as a genuine Lawn Club-style deck with visible railings, deck edges, marine materials, or open sea context',
            avoid: 'generic land-resort lawns, hedges, flower beds, backyard patios, hotel courtyards, villa terraces, or invented grass decks detached from real ship architecture',
        };
    }

    if (shipSupportsBotanicalGardenDeck(shipName)) {
        return {
            reality: 'Landscape rule: shipboard greenery is allowed only when it reads as a real rooftop-garden or deck installation with unmistakable marine context and vessel architecture',
            avoid: 'land-based courtyards, backyard patios, villa terraces, generic lawn fields, or botanical scenes that read like a resort instead of a ship',
        };
    }

    return {
        reality: 'Landscape rule: stay clearly shipboard; marine materials, railings, deck edges, glazing, and open sea context must dominate over any soft landscaping',
        avoid: 'lawns, grass fields, hedges, flower beds, backyard patios, hotel courtyards, villa terraces, or any landscaped open-deck fantasy that reads land-based',
    };
}