/**
 * Static Reference Packs — curated pre-shot reference library.
 *
 * Each pack provides known-good winning examples, known-toxic patterns,
 * required niche signals, and camera/location hints for a niche family.
 *
 * The resolver maps campaign context + slot role to the correct bundle.
 */

import type { Campaign } from './types';
import type {
    ReferencePack,
    NicheFamily,
    SlotReferenceBundle,
    WinningExample,
    ToxicExample,
} from './reference-pack-types';
import type { LandingStillSlotRole } from './schema';
import { isMusicFestivalCampaign } from './aesthetic-engine';

// ── Niche family inference from campaign ─────────────────────────────────────

const NICHE_FAMILY_KEYWORDS: Array<[string[], NicheFamily]> = [
    [['tabletop', 'board game', 'dice', 'game night', 'strategy game', 'card game'], 'tabletop'],
    [['stitch', 'needlework', 'embroidery', 'knitting', 'crochet', 'fiber', 'textile', 'sewing', 'cross-stitch'], 'stitch'],
    [['sketch', 'sketchbook', 'drawing', 'watercolor', 'botanical', 'illustration', 'art journal'], 'sketchbook'],
];

export function inferNicheFamily(campaign: Campaign): NicheFamily | null {
    const searchText = [
        campaign.name,
        campaign.id,
        ...(campaign.targetingKeywords ?? []),
    ].join(' ').toLowerCase();

    for (const [keywords, family] of NICHE_FAMILY_KEYWORDS) {
        if (keywords.some(kw => searchText.includes(kw))) {
            return family;
        }
    }
    return null;
}

// ── Tabletop reference pack ─────────────────────────────────────────────────

const TABLETOP_PACK: ReferencePack = {
    referencePackId: 'ref-tabletop-v1',
    nicheFamily: 'tabletop',
    winningExamples: [
        {
            exampleId: 'tabletop-win-hero-1',
            slotRole: 'HERO_PRIMARY',
            description: 'Wide cinematic shot of the ship promenade at golden hour — a couple walks toward camera with a compact travel board game tucked under one arm, ocean stretching behind them, warm amber light catching the game box edge.',
            shotIntent: {
                shotIntent: 'Establish the tabletop niche as naturally embedded in the cruise vacation moment',
                cameraDistance: 'wide',
                framingMode: 'establishing',
                heroSubject: 'couple with visible board game prop',
                nicheCue: 'board game',
                antiFallbackNote: 'NOT a generic couple-at-railing shot — the board game prop is the differentiator',
                locationFamily: 'promenade',
            },
        },
        {
            exampleId: 'tabletop-win-editorial-1',
            slotRole: 'EDITORIAL_WIDE_A',
            description: 'Medium-wide environmental shot of the ship library — two guests seated at a window-side table with a strategy game spread between them, afternoon light streaming through glass, bookshelves visible in background, relaxed body language suggesting mid-game conversation.',
            shotIntent: {
                shotIntent: 'Show tabletop gaming as a social, location-specific cruise activity',
                cameraDistance: 'medium_wide',
                framingMode: 'environmental_portrait',
                heroSubject: 'two guests with strategy game spread on table',
                nicheCue: 'strategy game',
                antiFallbackNote: 'NOT a generic dining or window-gazing scene — the game components on the table are the anchor',
                locationFamily: 'library',
            },
        },
        {
            exampleId: 'tabletop-win-intimate-1',
            slotRole: 'INTIMATE',
            description: 'Intimate close shot of hands moving game pieces on a small travel set, soft-focus ocean visible through a porthole behind — warm natural light, the tactile texture of wooden tokens and a felt game mat visible, one hand mid-move while the other rests on a coffee cup.',
            shotIntent: {
                shotIntent: 'Capture the tactile, intimate moment of gameplay — the niche at fingertip level',
                cameraDistance: 'close_up',
                framingMode: 'detail_insert',
                heroSubject: 'hands and game pieces in play',
                nicheCue: 'game pieces',
                antiFallbackNote: 'NOT a generic close-up of hands holding drinks — the game components must be the focal subject',
                locationFamily: 'cabin',
            },
        },
        {
            exampleId: 'tabletop-win-editorial-2',
            slotRole: 'EDITORIAL_WIDE_B',
            description: 'Wide environmental shot of the pool deck lounge area — a pair of guests at a shaded table with a colorful card game fanned between them, pool activity soft in the background, tropical light overhead, casual resort-wear suggesting easy afternoon leisure.',
            shotIntent: {
                shotIntent: 'Show tabletop gaming in an unexpected cruise location — poolside, not just indoors',
                cameraDistance: 'medium_wide',
                framingMode: 'two_shot',
                heroSubject: 'pair with card game at poolside table',
                nicheCue: 'card game',
                antiFallbackNote: 'NOT a generic pool deck lounging scene — the card game on the table is what makes this niche-native',
                locationFamily: 'pool_deck',
            },
        },
        {
            exampleId: 'tabletop-win-hero-alt-1',
            slotRole: 'HERO_ALT',
            description: 'Low-angle hero shot of the ship atrium — a guest pauses mid-step holding a compact dice game set, looking up at the glass ceiling with quiet delight, warm afternoon light cascading from above, the atrium architecture framing the moment grandly.',
            shotIntent: {
                shotIntent: 'Hero-scale niche moment — the game prop elevates a standard atrium shot into tabletop territory',
                cameraDistance: 'wide',
                framingMode: 'low_angle_hero',
                heroSubject: 'guest holding dice game set in grand atrium',
                nicheCue: 'dice game',
                antiFallbackNote: 'NOT a generic atrium shot — the dice game prop in hand is the identity anchor',
                locationFamily: 'atrium',
            },
        },
        {
            exampleId: 'tabletop-win-flex-1',
            slotRole: 'FLEX',
            description: 'Medium shot of the spa solarium — a solo guest reclined on a lounger with a pocket-sized puzzle game resting on their lap, warm filtered light through the glass roof, towel draped casually, peaceful expression suggesting a quiet gaming break between spa treatments.',
            shotIntent: {
                shotIntent: 'Show that tabletop gaming fits even the most relaxed cruise moments',
                cameraDistance: 'medium',
                framingMode: 'single_subject',
                heroSubject: 'solo guest with puzzle game in spa setting',
                nicheCue: 'puzzle game',
                antiFallbackNote: 'NOT a generic spa relaxation shot — the puzzle game on the lap is the niche signal',
                locationFamily: 'spa',
            },
        },
    ],
    toxicExamples: [
        {
            exampleId: 'tabletop-toxic-1',
            description: 'Wide shot of a couple leaning on the ship railing at sunset, laughing together with nothing in their hands, ocean horizon behind them.',
            whyToxic: 'Zero niche signal — no game prop, no game reference, no community-native action. This is the #1 generic cruise fallback.',
        },
        {
            exampleId: 'tabletop-toxic-2',
            description: 'Solo guest gazing contemplatively out a cabin window, soft morning light, quiet introspective mood.',
            whyToxic: 'No niche prop or action. Solitude framing with no community signal. This is the #2 generic cruise fallback.',
        },
    ],
    requiredNicheSignals: ['board game', 'dice', 'strategy game', 'card game', 'game piece', 'game token', 'tabletop', 'puzzle game', 'game night'],
    bannedFallbackPatterns: [
        'couple at railing with nothing niche-specific',
        'solo guest gazing at ocean or window',
        'generic candlelit dining with no game props',
        'couple facing horizon at wide distance',
        'empty deck or sea shot with no human+niche interaction',
    ],
    cameraIntentHints: [
        'wide establishing with visible niche prop',
        'medium environmental with game components on table',
        'close detail of game pieces, tokens, or dice in play',
        'two-shot with game as the social anchor between subjects',
    ],
    locationFamilyHints: ['promenade', 'library', 'pool_deck', 'atrium', 'spa', 'cabin', 'dining', 'lounge'],
};

// ── Stitch reference pack ───────────────────────────────────────────────────

const STITCH_PACK: ReferencePack = {
    referencePackId: 'ref-stitch-v1',
    nicheFamily: 'stitch',
    winningExamples: [
        {
            exampleId: 'stitch-win-hero-1',
            slotRole: 'HERO_PRIMARY',
            description: 'Wide cinematic shot of the ship promenade at morning golden hour — a guest walks with a canvas tote that shows embroidery hoops and colorful thread spools peeking out, sea breeze in their hair, the promenade stretching into soft-focus distance.',
            shotIntent: {
                shotIntent: 'Establish the stitch/fiber niche as part of the cruise journey, not separate from it',
                cameraDistance: 'wide',
                framingMode: 'establishing',
                heroSubject: 'guest carrying visible embroidery supplies in tote',
                nicheCue: 'embroidery hoops',
                antiFallbackNote: 'NOT a generic promenade walk — the visible craft supplies in the tote are the identity anchor',
                locationFamily: 'promenade',
            },
        },
        {
            exampleId: 'stitch-win-editorial-1',
            slotRole: 'EDITORIAL_WIDE_A',
            description: 'Medium-wide shot of a sunny pool deck lounge area — two guests sit side by side under shade, one with a small embroidery hoop in hand mid-stitch, the other holding thread up to the light to thread a needle, colorful thread bundles visible on the table between them.',
            shotIntent: {
                shotIntent: 'Show fiber craft as a social, outdoor cruise activity — not hidden indoors',
                cameraDistance: 'medium_wide',
                framingMode: 'two_shot',
                heroSubject: 'two guests stitching together at poolside',
                nicheCue: 'embroidery hoop',
                antiFallbackNote: 'NOT generic poolside lounging — the embroidery hoops and thread are the focal props',
                locationFamily: 'pool_deck',
            },
        },
        {
            exampleId: 'stitch-win-intimate-1',
            slotRole: 'INTIMATE',
            description: 'Intimate close shot of hands pulling a needle through fabric stretched in a wooden embroidery hoop, colorful cross-stitch pattern emerging, soft natural light from a nearby window, a small tin of needles and thread scissors visible at the edge of frame.',
            shotIntent: {
                shotIntent: 'Capture the tactile craft moment — thread, needle, fabric texture at intimate scale',
                cameraDistance: 'close_up',
                framingMode: 'detail_insert',
                heroSubject: 'hands mid-stitch on embroidery hoop',
                nicheCue: 'cross-stitch',
                antiFallbackNote: 'NOT a generic hand close-up — the embroidery hoop, needle, and emerging pattern must be visible',
                locationFamily: 'cabin',
            },
        },
        {
            exampleId: 'stitch-win-editorial-2',
            slotRole: 'EDITORIAL_WIDE_B',
            description: 'Wide environmental shot of the ship library reading nook — a solo guest settled into an armchair with a knitting project in their lap, yarn ball resting on the armrest, warm reading-lamp light, bookshelves framing the background, peaceful mid-afternoon atmosphere.',
            shotIntent: {
                shotIntent: 'Show fiber craft as a quiet, contemplative cruise moment with location-specific character',
                cameraDistance: 'medium_wide',
                framingMode: 'environmental_portrait',
                heroSubject: 'solo guest knitting in library armchair',
                nicheCue: 'knitting',
                antiFallbackNote: 'NOT a generic library reading scene — the knitting project and yarn are the niche signals',
                locationFamily: 'library',
            },
        },
        {
            exampleId: 'stitch-win-hero-alt-1',
            slotRole: 'HERO_ALT',
            description: 'Low-angle hero shot at the ship atrium — a guest ascending the central staircase with a handmade embroidered tote bag over one shoulder, the pattern catching the light from the glass ceiling above, grand atrium architecture framing the ascent.',
            shotIntent: {
                shotIntent: 'Hero-scale moment where the handmade craft object is the identity badge',
                cameraDistance: 'wide',
                framingMode: 'low_angle_hero',
                heroSubject: 'guest with handmade embroidered tote ascending atrium stairs',
                nicheCue: 'embroidered tote',
                antiFallbackNote: 'NOT a generic atrium escalator shot — the handmade embroidered tote is the identity signal',
                locationFamily: 'atrium',
            },
        },
        {
            exampleId: 'stitch-win-flex-1',
            slotRole: 'FLEX',
            description: 'Medium shot of the spa terrace — a guest reclined with a small crochet project resting beside them on a side table, hook tucked into a ball of soft yarn, warm filtered light, relaxed post-treatment glow, the craft project suggesting a gentle return to a favorite hobby.',
            shotIntent: {
                shotIntent: 'Show that fiber craft fits even the most pampered cruise moment',
                cameraDistance: 'medium',
                framingMode: 'single_subject',
                heroSubject: 'guest with crochet project in spa terrace',
                nicheCue: 'crochet',
                antiFallbackNote: 'NOT a generic spa relaxation scene — the crochet project and yarn are the niche anchor',
                locationFamily: 'spa',
            },
        },
    ],
    toxicExamples: [
        {
            exampleId: 'stitch-toxic-1',
            description: 'Wide shot of a couple leaning on the railing at sunset, laughing together, no craft supplies visible anywhere.',
            whyToxic: 'Zero niche signal — no embroidery, no yarn, no needlework. Pure generic cruise fallback.',
        },
        {
            exampleId: 'stitch-toxic-2',
            description: 'Solo guest sitting alone at a dining table with a glass of wine, contemplative expression, soft candlelight.',
            whyToxic: 'No fiber craft props or actions. Generic dining intimacy fallback with no community signal.',
        },
    ],
    requiredNicheSignals: ['embroidery', 'stitch', 'cross-stitch', 'knitting', 'crochet', 'yarn', 'thread', 'needle', 'fiber', 'textile', 'needlework', 'embroidery hoop'],
    bannedFallbackPatterns: [
        'couple at railing with no craft supplies',
        'solo guest gazing at ocean or window with no fiber props',
        'generic dining scene with no needlework context',
        'empty sea/deck/horizon shots',
        'cabin window contemplation with no craft activity',
    ],
    cameraIntentHints: [
        'wide establishing with visible craft supplies in tote or hand',
        'medium environmental with embroidery or knitting in progress',
        'close detail of needle, thread, fabric texture, or emerging pattern',
        'two-shot with craft project as the social object between subjects',
    ],
    locationFamilyHints: ['promenade', 'pool_deck', 'library', 'atrium', 'spa', 'cabin', 'lounge', 'dining'],
};

// ── Sketchbook reference pack ───────────────────────────────────────────────

const SKETCHBOOK_PACK: ReferencePack = {
    referencePackId: 'ref-sketchbook-v1',
    nicheFamily: 'sketchbook',
    winningExamples: [
        {
            exampleId: 'sketch-win-hero-1',
            slotRole: 'HERO_PRIMARY',
            description: 'Wide cinematic shot of the ship bow at golden hour — a guest leans against the forward railing with a leather-bound sketchbook open, pencil in hand, capturing the horizon line, warm light catching the sketchbook pages as they flutter slightly in the sea breeze.',
            shotIntent: {
                shotIntent: 'Establish sketching as naturally embedded in the cruise vista moment',
                cameraDistance: 'wide',
                framingMode: 'establishing',
                heroSubject: 'guest sketching at the bow with open sketchbook',
                nicheCue: 'sketchbook',
                antiFallbackNote: 'NOT a generic bow/railing shot — the open sketchbook and active drawing are the differentiators',
                locationFamily: 'promenade',
            },
        },
        {
            exampleId: 'sketch-win-editorial-1',
            slotRole: 'EDITORIAL_WIDE_A',
            description: 'Medium-wide environmental shot of a botanical garden area on the ship — a guest seated on a bench with a watercolor palette open beside them, painting a small botanical study of a tropical plant, dappled greenhouse light overhead, green foliage framing the scene.',
            shotIntent: {
                shotIntent: 'Show art-making as a location-specific cruise discovery activity',
                cameraDistance: 'medium_wide',
                framingMode: 'environmental_portrait',
                heroSubject: 'guest painting botanical watercolor in ship garden',
                nicheCue: 'watercolor',
                antiFallbackNote: 'NOT a generic garden or nature walk — the watercolor palette and active painting are the niche signals',
                locationFamily: 'spa',
            },
        },
        {
            exampleId: 'sketch-win-intimate-1',
            slotRole: 'INTIMATE',
            description: 'Intimate close shot of a hand drawing a detailed pen sketch of a ship architectural detail, the nib of a fine-point pen tracing a line on textured paper, a small portable ink well and eraser visible at the edge of frame, warm reading-lamp light.',
            shotIntent: {
                shotIntent: 'Capture the tactile art-making moment at intimate scale',
                cameraDistance: 'close_up',
                framingMode: 'detail_insert',
                heroSubject: 'hand drawing pen sketch on textured paper',
                nicheCue: 'sketching',
                antiFallbackNote: 'NOT a generic hand close-up — the pen, paper texture, and emerging drawing must be visible',
                locationFamily: 'library',
            },
        },
        {
            exampleId: 'sketch-win-editorial-2',
            slotRole: 'EDITORIAL_WIDE_B',
            description: 'Wide environmental shot of the pool deck — two guests at a shaded table, one sketching the pool scene in a spiral-bound sketchbook while the other watches with a smile, colored pencils scattered on the table, tropical light and pool activity soft in background.',
            shotIntent: {
                shotIntent: 'Show art-making as a social, outdoor cruise activity',
                cameraDistance: 'medium_wide',
                framingMode: 'two_shot',
                heroSubject: 'two guests with sketchbook and colored pencils at poolside',
                nicheCue: 'sketching',
                antiFallbackNote: 'NOT generic poolside lounging — the sketchbook and colored pencils on the table are the focal props',
                locationFamily: 'pool_deck',
            },
        },
        {
            exampleId: 'sketch-win-hero-alt-1',
            slotRole: 'HERO_ALT',
            description: 'Low-angle hero shot at the ship theater entrance — a guest pauses in the grand doorway holding a hardcover art journal, the ornate theater ceiling visible behind them, warm dramatic lighting from inside casting a glow on the journal cover.',
            shotIntent: {
                shotIntent: 'Hero-scale niche moment where the art journal is the identity badge in a grand location',
                cameraDistance: 'wide',
                framingMode: 'low_angle_hero',
                heroSubject: 'guest holding art journal at theater entrance',
                nicheCue: 'art journal',
                antiFallbackNote: 'NOT a generic theater entrance shot — the art journal in hand is the identity signal',
                locationFamily: 'theater',
            },
        },
        {
            exampleId: 'sketch-win-flex-1',
            slotRole: 'FLEX',
            description: 'Medium shot of the dining terrace — a solo guest at a window table with a small travel watercolor set open beside their coffee, painting a quick color study of the sunrise over the ocean, warm morning light through glass, relaxed breakfast atmosphere.',
            shotIntent: {
                shotIntent: 'Show art-making woven into everyday cruise dining moments',
                cameraDistance: 'medium',
                framingMode: 'single_subject',
                heroSubject: 'solo guest with watercolor set at breakfast table',
                nicheCue: 'watercolor',
                antiFallbackNote: 'NOT a generic breakfast/dining scene — the watercolor set open on the table is the niche prop',
                locationFamily: 'dining',
            },
        },
    ],
    toxicExamples: [
        {
            exampleId: 'sketch-toxic-1',
            description: 'Wide shot of a couple at the ship railing watching the sunset, no art supplies visible, generic travel photography framing.',
            whyToxic: 'Zero niche signal — no sketchbook, no pencils, no art activity. Pure generic cruise fallback.',
        },
        {
            exampleId: 'sketch-toxic-2',
            description: 'Solo guest relaxing in a cabin window seat with a book, quiet contemplative mood, morning light.',
            whyToxic: 'Reading is not the niche. No sketchbook, no art supplies, no drawing activity. Generic cabin fallback.',
        },
    ],
    requiredNicheSignals: ['sketchbook', 'sketching', 'watercolor', 'drawing', 'botanical', 'illustration', 'art journal', 'colored pencils', 'pen sketch'],
    bannedFallbackPatterns: [
        'couple at railing with no art supplies',
        'solo guest gazing at ocean or window with no drawing activity',
        'generic dining scene with no art context',
        'empty deck/sea/horizon shots without an active artist',
        'reading or contemplation without art-making props',
    ],
    cameraIntentHints: [
        'wide establishing with visible sketchbook or art journal in hand',
        'medium environmental with watercolor or drawing in progress',
        'close detail of pen/pencil on paper, emerging sketch, or paint palette',
        'two-shot with art project as the shared object between subjects',
    ],
    locationFamilyHints: ['promenade', 'pool_deck', 'library', 'theater', 'spa', 'cabin', 'dining', 'lounge'],
};

// ── Pack registry ───────────────────────────────────────────────────────────

const REFERENCE_PACKS: Record<NicheFamily, ReferencePack> = {
    tabletop: TABLETOP_PACK,
    stitch: STITCH_PACK,
    sketchbook: SKETCHBOOK_PACK,
};

// ── Public API: resolve reference pack for a campaign ───────────────────────

export function getReferencePack(campaign: Campaign): ReferencePack | null {
    const family = inferNicheFamily(campaign);
    if (!family) return null;
    return REFERENCE_PACKS[family] ?? null;
}

// ── Public API: resolve slot-scoped reference bundle ────────────────────────

export function getSlotReferenceBundle(
    pack: ReferencePack,
    slotRole: LandingStillSlotRole,
): SlotReferenceBundle {
    // Find winning examples matching this slot role (max 2)
    const matchingWins = pack.winningExamples.filter(w => w.slotRole === slotRole);
    const wins: WinningExample[] = matchingWins.length > 0
        ? matchingWins.slice(0, 2)
        : pack.winningExamples.slice(0, 2); // fallback: use first 2 from any role

    // Pick the first toxic example
    const toxic: ToxicExample = pack.toxicExamples[0] ?? {
        exampleId: 'generic-toxic',
        description: 'Couple at railing with nothing niche-specific, gazing at ocean.',
        whyToxic: 'Zero niche signal. Pure generic cruise fallback.',
    };

    return {
        slotRole,
        winningExamples: wins,
        toxicExample: toxic,
        requiredNicheSignals: pack.requiredNicheSignals,
        cameraIntentHints: pack.cameraIntentHints,
        locationFamilyHints: pack.locationFamilyHints,
    };
}

// ── Music/festival niche keyword expansion — applied when no reference pack exists ──

const MUSIC_FESTIVAL_EXPANDED_KEYWORDS = [
    'dancing', 'live music', 'open deck', 'deck party', 'sound system', 'festival',
    'dj', 'bass', 'crowd energy', 'earbuds', 'playlist', 'performer', 'stage',
    'music', 'beat', 'groove', 'rhythm', 'band', 'crowd', 'dancing on deck',
    'live set', 'acoustic', 'deck dancing', 'album art', 'headphones',
];

// ── Public API: expand niche keywords with reference pack signals ────────────

export function getExpandedNicheKeywords(campaign: Campaign): string[] {
    const base = campaign.targetingKeywords ?? [];
    const pack = getReferencePack(campaign);
    if (pack) {
        const merged = new Set([...base.map(k => k.toLowerCase()), ...pack.requiredNicheSignals.map(k => k.toLowerCase())]);
        return [...merged];
    }
    if (isMusicFestivalCampaign(campaign)) {
        const merged = new Set([...base.map(k => k.toLowerCase()), ...MUSIC_FESTIVAL_EXPANDED_KEYWORDS]);
        return [...merged];
    }
    return base;
}

// ── Public API: format reference bundle as prompt text ──────────────────────

export function formatReferenceBundleForPrompt(bundle: SlotReferenceBundle): string {
    const winningLines = bundle.winningExamples.map((w, i) =>
        `  WINNING EXAMPLE ${i + 1} (${w.slotRole}):\n    "${w.description}"\n    Shot intent: ${w.shotIntent.shotIntent}\n    Camera: ${w.shotIntent.cameraDistance} | Framing: ${w.shotIntent.framingMode}\n    Hero subject: ${w.shotIntent.heroSubject}\n    Niche cue: ${w.shotIntent.nicheCue}\n    Anti-fallback: ${w.shotIntent.antiFallbackNote}`
    ).join('\n');

    const toxicLine = `  TOXIC EXAMPLE (FORBIDDEN):\n    "${bundle.toxicExample.description}"\n    Why toxic: ${bundle.toxicExample.whyToxic}`;

    return `REFERENCE PACK for ${bundle.slotRole}:\n${winningLines}\n${toxicLine}\n  Required niche signals: ${bundle.requiredNicheSignals.slice(0, 5).join(', ')}\n  Camera hints: ${bundle.cameraIntentHints.slice(0, 3).join('; ')}`;
}

// ── Public API: format full pack context for the generation prompt ──────────

export function formatReferencePackForGeneration(pack: ReferencePack): string {
    const slotRoles: LandingStillSlotRole[] = [
        'HERO_PRIMARY', 'HERO_ALT', 'EDITORIAL_WIDE_A', 'EDITORIAL_WIDE_B', 'INTIMATE', 'FLEX',
    ];

    const sections = slotRoles.map(role => {
        const bundle = getSlotReferenceBundle(pack, role);
        return formatReferenceBundleForPrompt(bundle);
    });

    const bannedBlock = pack.bannedFallbackPatterns
        .map((p, i) => `  ${i + 1}. ${p}`)
        .join('\n');

    return `\n── REFERENCE GROUNDING ──────────────────────────────────────────────\nNiche family: ${pack.nicheFamily} | Pack: ${pack.referencePackId}\n\n${sections.join('\n\n')}\n\nBANNED FALLBACK PATTERNS (never generate these):\n${bannedBlock}\n── END REFERENCE GROUNDING ─────────────────────────────────────────\n`;
}
