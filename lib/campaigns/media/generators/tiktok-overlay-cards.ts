import React from 'react';
import { imageBufferToDataUri, renderPngFromElement } from '../../design-system/renderer/satori-renderer';

export type TikTokOverlayPlacement = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type TikTokOverlayVariant = 'tag' | 'statement' | 'cta';

export interface TikTokOverlayCardSpec {
    badge: string;
    headline: string;
    subline: string;
    spokenText?: string;
    accentColor: string;
    accentMuted?: string;
    variant?: TikTokOverlayVariant;
    placement: TikTokOverlayPlacement;
}

export interface TikTokBrandLockupSpec {
    wordmark: string;
    tagline?: string;
    accentColor: string;
    placement: TikTokOverlayPlacement;
}

const TYPE = {
    badge:           { sizeTag: 14, sizeStatement: 18, sizeCta: 16 },
    headline:        { sizeTag: 34, sizeStatement: 64, sizeCta: 38 },
    subline:         { sizeTag: 18, sizeStatement: 24, sizeCta: 20 },
    wordmark:        20,
    tagline:         12,
} as const;

function normalizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function normalizeLineBreaks(value: string): string {
    return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function shorten(value: string, maxChars: number): string {
    const normalized = normalizeText(value);
    if (normalized.length <= maxChars) return normalized;
    if (maxChars <= 1) return normalized.slice(0, maxChars);
    return `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}...`;
}

function splitLines(value: string, maxLines: number): string[] {
    return normalizeLineBreaks(value)
        .split(/\n|[\/|]/)
        .map((part) => normalizeText(part))
        .filter(Boolean)
        .slice(0, maxLines);
}

function withAlpha(hexOrRgb: string, alpha: number): string {
    const trimmed = hexOrRgb.trim();
    if (trimmed.startsWith('#')) {
        const hex = trimmed.slice(1);
        const expanded = hex.length === 3
            ? hex.split('').map((c) => c + c).join('')
            : hex.padEnd(6, '0').slice(0, 6);
        const r = parseInt(expanded.slice(0, 2), 16);
        const g = parseInt(expanded.slice(2, 4), 16);
        const b = parseInt(expanded.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return trimmed;
}

function buildTagCardNode(spec: TikTokOverlayCardSpec): React.ReactElement {
    const { width, height } = spec.placement;
    const accent = spec.accentColor || '#F2C450';
    const accentBorder = withAlpha(accent, 0.55);
    const headlineLines = splitLines(spec.headline, 2);
    const sublineLines = splitLines(spec.subline, 2);

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
                left: 0, top: 0, bottom: 0,
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
                    fontSize: TYPE.badge.sizeTag,
                    lineHeight: 1,
                    letterSpacing: '0.18em',
                    color: accent,
                    marginBottom: 10,
                    textTransform: 'uppercase',
                    fontWeight: 700,
                },
            },
            shorten(spec.badge, 20)
        ),
        React.createElement(
            'div',
            {
                style: {
                    fontFamily: 'Sans',
                    fontSize: TYPE.headline.sizeTag,
                    lineHeight: 1.02,
                    fontWeight: 800,
                    letterSpacing: '-0.01em',
                    marginBottom: sublineLines.length ? 8 : 0,
                    maxWidth: width - 60,
                    whiteSpace: 'pre-line',
                    color: 'rgba(246, 241, 229, 0.96)',
                },
            },
            headlineLines.length > 0 ? headlineLines.join('\n') : shorten(spec.headline, 34)
        ),
        sublineLines.length > 0
            ? React.createElement(
                  'div',
                  {
                      style: {
                          fontFamily: 'Sans',
                          fontSize: TYPE.subline.sizeTag,
                          lineHeight: 1.22,
                          color: 'rgba(246, 241, 229, 0.78)',
                          maxWidth: width - 60,
                          whiteSpace: 'pre-line',
                      },
                  },
                  sublineLines.join('\n')
              )
            : null
    );
}

function buildStatementCardNode(spec: TikTokOverlayCardSpec): React.ReactElement {
    const { width, height } = spec.placement;
    const accent = spec.accentColor || '#F2C450';
    const accentBorder = withAlpha(accent, 0.45);
    const headlineLines = splitLines(spec.headline, 3);
    const sublineLines = splitLines(spec.subline, 3);

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
                    fontSize: TYPE.badge.sizeStatement,
                    lineHeight: 1,
                    letterSpacing: '0.22em',
                    color: accent,
                    marginBottom: 14,
                    textTransform: 'uppercase',
                    fontWeight: 700,
                },
            },
            shorten(spec.badge, 22)
        ),
        React.createElement(
            'div',
            {
                style: {
                    fontFamily: 'Sans',
                    fontSize: TYPE.headline.sizeStatement,
                    lineHeight: 0.98,
                    fontWeight: 900,
                    letterSpacing: '-0.015em',
                    marginBottom: sublineLines.length ? 16 : 0,
                    maxWidth: width - 76,
                    whiteSpace: 'pre-line',
                },
            },
            headlineLines.length > 0 ? headlineLines.join('\n') : shorten(spec.headline, 36)
        ),
        sublineLines.length > 0
            ? React.createElement(
                  'div',
                  {
                      style: {
                          fontFamily: 'Sans',
                          fontSize: TYPE.subline.sizeStatement,
                          lineHeight: 1.2,
                          color: 'rgba(246, 241, 229, 0.92)',
                          maxWidth: width - 76,
                          whiteSpace: 'pre-line',
                      },
                  },
                  sublineLines.join('\n')
              )
            : null
    );
}

function buildCtaCardNode(spec: TikTokOverlayCardSpec): React.ReactElement {
    const { width, height } = spec.placement;
    const accent = spec.accentColor || '#F2C450';
    const accentDeep = withAlpha(accent, 0.92);
    const headlineLines = splitLines(spec.headline, 2);
    const sublineLines = splitLines(spec.subline, 1);

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
                        fontSize: TYPE.badge.sizeCta,
                        lineHeight: 1,
                        letterSpacing: '0.2em',
                        color: 'rgba(10, 12, 18, 0.78)',
                        marginBottom: 6,
                        textTransform: 'uppercase',
                        fontWeight: 700,
                    },
                },
                shorten(spec.badge, 18)
            ),
            React.createElement(
                'div',
                {
                    style: {
                        fontFamily: 'Sans',
                        fontSize: TYPE.headline.sizeCta,
                        lineHeight: 1.0,
                        fontWeight: 900,
                        letterSpacing: '-0.01em',
                        whiteSpace: 'pre-line',
                        color: '#0A0C12',
                    },
                },
                headlineLines.length > 0 ? headlineLines.join('\n') : shorten(spec.headline, 28)
            ),
            sublineLines.length > 0
                ? React.createElement(
                      'div',
                      {
                          style: {
                              fontFamily: 'Sans',
                              fontSize: TYPE.subline.sizeCta,
                              lineHeight: 1.18,
                              color: 'rgba(10, 12, 18, 0.74)',
                              marginTop: 4,
                              whiteSpace: 'pre-line',
                          },
                      },
                      sublineLines.join('\n')
                  )
                : null
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

function buildOverlayCardNode(spec: TikTokOverlayCardSpec): React.ReactElement {
    switch (spec.variant ?? 'statement') {
        case 'tag':       return buildTagCardNode(spec);
        case 'cta':       return buildCtaCardNode(spec);
        case 'statement':
        default:          return buildStatementCardNode(spec);
    }
}

export async function renderTikTokOverlayCard(spec: TikTokOverlayCardSpec): Promise<Buffer> {
    return renderPngFromElement(buildOverlayCardNode(spec), {
        width: spec.placement.width,
        height: spec.placement.height,
        fonts: ['Sans', 'Mono'],
    });
}

function buildBrandLockupNode(spec: TikTokBrandLockupSpec): React.ReactElement {
    const { width, height } = spec.placement;
    const accent = spec.accentColor || '#F2C450';

    return React.createElement(
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
                        fontSize: TYPE.wordmark,
                        lineHeight: 1,
                        fontWeight: 800,
                        letterSpacing: '0.02em',
                        color: 'rgba(246, 241, 229, 0.96)',
                        textShadow: '0 2px 8px rgba(0, 0, 0, 0.55)',
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
                              fontSize: TYPE.tagline,
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
    );
}

export async function renderTikTokBrandLockup(spec: TikTokBrandLockupSpec): Promise<Buffer> {
    return renderPngFromElement(buildBrandLockupNode(spec), {
        width: spec.placement.width,
        height: spec.placement.height,
        fonts: ['Sans', 'Mono'],
    });
}

export function getOverlayCardDataUri(buffer: Buffer): string {
    return imageBufferToDataUri(buffer);
}
