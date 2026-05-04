import React from 'react';
import { renderPngFromElement } from '../../../design-system/renderer/satori-renderer';

export type BoardGamesTemplatePresetId = 'hook' | 'social' | 'cta';
export type BoardGamesCardVariant = 'tag' | 'statement' | 'cta';

export interface BoardGamesOverlayCardSpec {
    badge: string;
    headline: string;
    subline: string;
    spokenText?: string;
    accentColor: string;
    accentMuted: string;
    variant: BoardGamesCardVariant;
    placement: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

export interface BoardGamesBrandLockupSpec {
    wordmark: string;
    tagline: string;
    accentColor: string;
    placement: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

export interface BoardGamesTemplatePreset {
    id: BoardGamesTemplatePresetId;
    label: string;
    description: string;
    overlayCards: BoardGamesOverlayCardSpec[];
    brandLockup: BoardGamesBrandLockupSpec;
}

export const BOARD_GAMES_TEMPLATE_SEQUENCE: readonly BoardGamesTemplatePresetId[] = ['hook', 'social', 'cta'];

export const BOARD_GAMES_BRAND_LOCKUP_DEFAULT: BoardGamesBrandLockupSpec = {
    wordmark: 'Leisure Life',
    tagline: 'Cruises that fit',
    accentColor: '#F2C450',
    placement: { x: 70, y: 138, width: 420, height: 50 },
};

export const BOARD_GAMES_TEMPLATE_PRESETS: readonly BoardGamesTemplatePreset[] = [
    {
        id: 'hook',
        label: 'Hook opener',
        description: 'One tag at top, image owns the frame. First-beat punch.',
        overlayCards: [
            {
                badge: 'OPENING',
                headline: 'Board games\nat sea.',
                subline: 'Social, warm, playable from the first frame.',
                spokenText: 'Board games at sea.',
                accentColor: '#F2C450',
                accentMuted: '#8A6E2A',
                variant: 'tag',
                placement: { x: 70, y: 220, width: 940, height: 220 },
            },
        ],
        brandLockup: { ...BOARD_GAMES_BRAND_LOCKUP_DEFAULT, accentColor: '#F2C450' },
    },
    {
        id: 'social',
        label: 'Social proof',
        description: 'Tag hook + statement payoff. The two-card workhorse.',
        overlayCards: [
            {
                badge: 'GROUP ENERGY',
                headline: 'People first.\nGames second.',
                subline: 'The right crowd makes the whole deck feel alive.',
                spokenText: 'People first. Games second.',
                accentColor: '#8AD1C2',
                accentMuted: '#3F6E66',
                variant: 'tag',
                placement: { x: 70, y: 220, width: 940, height: 200 },
            },
            {
                badge: 'PROOF',
                headline: 'This is what travel\nlooks like now.',
                subline: 'A quieter, better kind of cruise social life.',
                spokenText: 'This is what travel looks like now.',
                accentColor: '#8AD1C2',
                accentMuted: '#3F6E66',
                variant: 'statement',
                placement: { x: 70, y: 1180, width: 940, height: 320 },
            },
        ],
        brandLockup: { ...BOARD_GAMES_BRAND_LOCKUP_DEFAULT, accentColor: '#8AD1C2' },
    },
    {
        id: 'cta',
        label: 'CTA close',
        description: 'Statement + pill button. The closer.',
        overlayCards: [
            {
                badge: 'BOOK NOW',
                headline: 'Your next game night\nhas an ocean view.',
                subline: 'Ship truth. Table energy. Clear CTA.',
                spokenText: 'Your next game night has an ocean view.',
                accentColor: '#F39A5B',
                accentMuted: '#7A4A2C',
                variant: 'statement',
                placement: { x: 70, y: 1100, width: 940, height: 320 },
            },
            {
                badge: 'RESERVE',
                headline: 'Reserve your seat',
                subline: '',
                spokenText: 'Reserve your seat.',
                accentColor: '#F39A5B',
                accentMuted: '#7A4A2C',
                variant: 'cta',
                placement: { x: 140, y: 1480, width: 800, height: 110 },
            },
        ],
        brandLockup: { ...BOARD_GAMES_BRAND_LOCKUP_DEFAULT, accentColor: '#F39A5B' },
    },
];

function normalizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

export function buildBoardGamesBeatSpokenText(preset: BoardGamesTemplatePreset): string {
    const spokenCards = preset.overlayCards.map((card) => {
        if (typeof card.spokenText === 'string' && card.spokenText.trim().length > 0) {
            return card.spokenText.trim();
        }

        return [card.headline, card.subline].filter(Boolean).join(' ');
    });

    return spokenCards
        .join(' ')
        .replace(/\bclear cta\b/ig, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function getBoardGamesTemplatePreset(presetId: BoardGamesTemplatePresetId): BoardGamesTemplatePreset {
    return BOARD_GAMES_TEMPLATE_PRESETS.find((entry) => entry.id === presetId) ?? BOARD_GAMES_TEMPLATE_PRESETS[0];
}

function withAlpha(hex: string, alpha: number): string {
    const trimmed = hex.trim();
    if (!trimmed.startsWith('#')) return trimmed;
    const raw = trimmed.slice(1);
    const expanded = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.padEnd(6, '0').slice(0, 6);
    const r = parseInt(expanded.slice(0, 2), 16);
    const g = parseInt(expanded.slice(2, 4), 16);
    const b = parseInt(expanded.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildTagCardNode(spec: BoardGamesOverlayCardSpec): React.ReactElement {
    const { width, height } = spec.placement;
    const accent = spec.accentColor || '#F2C450';
    const accentBorder = withAlpha(accent, 0.55);

    return React.createElement(
        'div',
        {
            style: {
                width,
                height,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 14,
                padding: '22px 28px 22px',
                backgroundImage: 'linear-gradient(180deg, rgba(8, 10, 16, 0.62) 0%, rgba(8, 10, 16, 0.40) 100%)',
                border: `1px solid ${accentBorder}`,
                color: '#F6F1E5',
            },
        },
        React.createElement('div', {
            style: {
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 4,
                backgroundColor: accent,
                opacity: 0.95,
            },
        }),
        React.createElement(
            'div',
            {
                style: {
                    fontFamily: 'Mono',
                    fontSize: 14,
                    lineHeight: 1,
                    letterSpacing: '0.18em',
                    color: accent,
                    marginBottom: 10,
                    textTransform: 'uppercase',
                    fontWeight: 700,
                },
            },
            normalizeText(spec.badge)
        ),
        React.createElement(
            'div',
            {
                style: {
                    fontFamily: 'Sans',
                    fontSize: 34,
                    lineHeight: 1.02,
                    fontWeight: 800,
                    letterSpacing: '-0.01em',
                    marginBottom: 8,
                    whiteSpace: 'pre-line',
                    color: 'rgba(246, 241, 229, 0.96)',
                },
            },
            spec.headline
        ),
        spec.subline ? React.createElement(
            'div',
            {
                style: {
                    fontFamily: 'Sans',
                    fontSize: 18,
                    lineHeight: 1.22,
                    color: 'rgba(246, 241, 229, 0.78)',
                    whiteSpace: 'pre-line',
                },
            },
            spec.subline
        ) : null
    );
}

function buildStatementCardNode(spec: BoardGamesOverlayCardSpec): React.ReactElement {
    const { width, height } = spec.placement;
    const accent = spec.accentColor || '#F2C450';
    const accentBorder = withAlpha(accent, 0.45);

    return React.createElement(
        'div',
        {
            style: {
                width,
                height,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 22,
                padding: '36px 38px 36px',
                backgroundImage: 'linear-gradient(180deg, rgba(6, 8, 14, 0.78) 0%, rgba(6, 8, 14, 0.62) 100%)',
                border: `1px solid ${accentBorder}`,
                boxShadow: '0 22px 52px rgba(0, 0, 0, 0.36)',
                color: '#F6F1E5',
            },
        },
        React.createElement('div', {
            style: {
                position: 'absolute',
                left: 0,
                top: 0,
                right: 0,
                height: 6,
                backgroundColor: accent,
                opacity: 0.95,
            },
        }),
        React.createElement(
            'div',
            {
                style: {
                    fontFamily: 'Mono',
                    fontSize: 18,
                    lineHeight: 1,
                    letterSpacing: '0.22em',
                    color: accent,
                    marginBottom: 14,
                    textTransform: 'uppercase',
                    fontWeight: 700,
                },
            },
            normalizeText(spec.badge)
        ),
        React.createElement(
            'div',
            {
                style: {
                    fontFamily: 'Sans',
                    fontSize: 64,
                    lineHeight: 0.98,
                    fontWeight: 900,
                    letterSpacing: '-0.015em',
                    marginBottom: 16,
                    whiteSpace: 'pre-line',
                },
            },
            spec.headline
        ),
        spec.subline ? React.createElement(
            'div',
            {
                style: {
                    fontFamily: 'Sans',
                    fontSize: 24,
                    lineHeight: 1.2,
                    color: 'rgba(246, 241, 229, 0.92)',
                    whiteSpace: 'pre-line',
                },
            },
            spec.subline
        ) : null
    );
}

function buildCtaCardNode(spec: BoardGamesOverlayCardSpec): React.ReactElement {
    const { width, height } = spec.placement;
    const accent = spec.accentColor || '#F2C450';
    const accentDeep = withAlpha(accent, 0.92);

    return React.createElement(
        'div',
        {
            style: {
                width,
                height,
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                position: 'relative',
                overflow: 'hidden',
                borderRadius: Math.round(height / 2),
                padding: '0 28px 0 32px',
                backgroundColor: accentDeep,
                border: `1px solid ${withAlpha(accent, 0.95)}`,
                boxShadow: '0 18px 46px rgba(0, 0, 0, 0.34)',
                color: '#0A0C12',
            },
        },
        React.createElement(
            'div',
            { style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: width - 130 } },
            React.createElement(
                'div',
                {
                    style: {
                        fontFamily: 'Mono',
                        fontSize: 16,
                        lineHeight: 1,
                        letterSpacing: '0.2em',
                        color: 'rgba(10, 12, 18, 0.78)',
                        marginBottom: 6,
                        textTransform: 'uppercase',
                        fontWeight: 700,
                    },
                },
                normalizeText(spec.badge)
            ),
            React.createElement(
                'div',
                {
                    style: {
                        fontFamily: 'Sans',
                        fontSize: 38,
                        lineHeight: 1.0,
                        fontWeight: 900,
                        letterSpacing: '-0.01em',
                        whiteSpace: 'pre-line',
                        color: '#0A0C12',
                    },
                },
                spec.headline
            ),
            spec.subline ? React.createElement(
                'div',
                {
                    style: {
                        fontFamily: 'Sans',
                        fontSize: 20,
                        lineHeight: 1.18,
                        color: 'rgba(10, 12, 18, 0.74)',
                        marginTop: 4,
                        whiteSpace: 'pre-line',
                    },
                },
                spec.subline
            ) : null
        ),
        React.createElement(
            'div',
            {
                style: {
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: '#0A0C12',
                    color: accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'Sans',
                    fontSize: 30,
                    fontWeight: 900,
                    flexShrink: 0,
                    marginLeft: 18,
                },
            },
            '→'
        )
    );
}

function buildOverlayCardNode(spec: BoardGamesOverlayCardSpec): React.ReactElement {
    const inner = (() => {
        switch (spec.variant) {
            case 'tag':
                return buildTagCardNode(spec);
            case 'cta':
                return buildCtaCardNode(spec);
            case 'statement':
            default:
                return buildStatementCardNode(spec);
        }
    })();

    return React.createElement(
        'div',
        {
            style: {
                position: 'absolute',
                left: spec.placement.x,
                top: spec.placement.y,
                width: spec.placement.width,
                height: spec.placement.height,
                display: 'flex',
                flexDirection: 'column',
            },
        },
        inner
    );
}

function buildBrandLockupNode(spec: BoardGamesBrandLockupSpec): React.ReactElement {
    const { width, height } = spec.placement;
    const accent = spec.accentColor || '#F2C450';

    return React.createElement(
        'div',
        {
            style: {
                position: 'absolute',
                left: spec.placement.x,
                top: spec.placement.y,
                width,
                height,
                display: 'flex',
                flexDirection: 'row',
            },
        },
        React.createElement(
            'div',
            {
                style: {
                    width,
                    height,
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    position: 'relative',
                    overflow: 'hidden',
                    color: '#F6F1E5',
                },
            },
            React.createElement('div', {
                style: {
                    width: 4,
                    height: Math.min(28, height - 8),
                    backgroundColor: accent,
                    marginRight: 12,
                    borderRadius: 2,
                },
            }),
            React.createElement(
                'div',
                { style: { display: 'flex', flexDirection: 'column', justifyContent: 'center' } },
                React.createElement(
                    'div',
                    {
                        style: {
                            fontFamily: 'Sans',
                            fontSize: 20,
                            lineHeight: 1,
                            fontWeight: 800,
                            letterSpacing: '0.02em',
                            color: 'rgba(246, 241, 229, 0.96)',
                            textShadow: '0 2px 8px rgba(0, 0, 0, 0.55)',
                            textTransform: 'uppercase',
                        },
                    },
                    spec.wordmark.toUpperCase()
                ),
                spec.tagline
                    ? React.createElement(
                          'div',
                          {
                              style: {
                                  fontFamily: 'Mono',
                                  fontSize: 12,
                                  lineHeight: 1,
                                  letterSpacing: '0.24em',
                                  color: 'rgba(246, 241, 229, 0.66)',
                                  marginTop: 6,
                                  textTransform: 'uppercase',
                                  textShadow: '0 1px 4px rgba(0, 0, 0, 0.65)',
                              },
                          },
                          spec.tagline
                      )
                    : null
            )
        )
    );
}

export async function renderBoardGamesTemplateOverlay(preset: BoardGamesTemplatePreset): Promise<Buffer> {
    const element = React.createElement(
        'div',
        {
            style: {
                width: 1080,
                height: 1920,
                backgroundColor: 'transparent',
                position: 'relative',
                display: 'flex',
                overflow: 'hidden',
            },
        },
        buildBrandLockupNode(preset.brandLockup),
        ...preset.overlayCards.map((card) => buildOverlayCardNode(card))
    );

    return renderPngFromElement(element, {
        width: 1080,
        height: 1920,
        fonts: ['Sans', 'Mono'],
    });
}
