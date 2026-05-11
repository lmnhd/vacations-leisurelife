import React from 'react';
import type { NicheTokens } from './types';
import {
    DARK, DEEP, INK, INK_SOFT, MUTED, PAPER, WARM_PAPER, PAPER_INK, PAPER_MUTED,
    h,
    eyebrow,
    pillCta,
    rule,
    text,
    renderImageModule,
    hexToRgb,
    headlineWithAccent,
    escapeRegExp,
    type SourceImageRef,
} from './ad-templates-shared';

interface RenderInput {
    tokens: NicheTokens;
    sourceImage?: SourceImageRef;
    width: number;
    height: number;
}

// ─── Quote Card (1:1, dark editorial) ────────────────────────────────────────
//
// Used by every system. Big serif italic quote anchored over a soft accent
// glow with a decorative oversized open-quote glyph. Mono cite + vessel meta
// + bottom CTA strip provides scannable hierarchy.
//
export function quoteCard(input: RenderInput): React.ReactElement {
    const { tokens, width, height } = input;
    const accent = tokens.accentHex;
    const rgb = hexToRgb(accent);
    const padding = Math.round(width * 0.085);
    const quoteSize = Math.round(width * 0.082);

    return h('div', {
        style: {
            width, height,
            display: 'flex',
            flexDirection: 'column',
            background: `radial-gradient(circle at 18% 22%, rgba(${rgb},0.14), ${DARK} 62%)`,
            color: INK,
            fontFamily: 'Sans',
            padding,
            boxSizing: 'border-box',
            position: 'relative',
            overflow: 'hidden',
        },
    },
        // Oversized decorative quote glyph
        text('“', {
            position: 'absolute',
            top: Math.round(height * -0.04),
            left: Math.round(width * 0.04),
            fontSize: Math.round(width * 0.45),
            fontFamily: 'Serif',
            fontStyle: 'italic',
            color: accent,
            opacity: 0.16,
            fontWeight: 900,
            lineHeight: 0.7,
        }),

        // Top eyebrow
        h('div', { style: { display: 'flex' } },
            eyebrow(`${tokens.issueLabel} · ${tokens.sectionLabels[0] ?? 'At Sea'}`, accent),
        ),

        // Centered quote block
        h('div', {
            style: {
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                justifyContent: 'center',
            },
        },
            text(tokens.quote, {
                fontFamily: 'Serif',
                fontStyle: 'italic',
                fontSize: quoteSize,
                lineHeight: 1.06,
                fontWeight: 700,
                color: INK,
                marginBottom: 30,
                maxWidth: '94%',
            }),
            rule(accent, 64, 3),
            text(tokens.quoteCite, {
                color: accent,
                fontFamily: 'Mono',
                fontSize: 18,
                letterSpacing: 2,
                textTransform: 'uppercase',
                marginTop: 24,
                marginBottom: 8,
            }),
            text(`${tokens.vesselName} · ${tokens.route}`, {
                color: MUTED,
                fontSize: 22,
                letterSpacing: 0.4,
            }),
        ),

        // Bottom strip: departure | CTA
        h('div', {
            style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid rgba(255,255,255,0.10)',
                paddingTop: 22,
            },
        },
            text(tokens.departure, {
                color: MUTED,
                fontFamily: 'Mono',
                fontSize: 13,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
            }),
            text(`${tokens.cta}  ↗`, {
                color: accent,
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: 0.5,
            }),
        ),
    );
}

// ─── Itinerary Card (4:5, warm paper) ────────────────────────────────────────
//
// Used by Editorial and Modular systems for IG-feed carousels. Massive route
// headline + accent-anchored day rows with a bottom pill CTA so the user has
// an immediate path forward instead of a flat bulletted list.
//
export function itineraryCard(input: RenderInput): React.ReactElement {
    const { tokens, width, height } = input;
    const accent = tokens.accentHex;
    const rows = tokens.sectionLabels.slice(0, 5);
    const padding = Math.round(width * 0.07);

    return h('div', {
        style: {
            width, height,
            display: 'flex',
            flexDirection: 'column',
            background: `linear-gradient(160deg, ${PAPER} 0%, ${WARM_PAPER} 100%)`,
            color: PAPER_INK,
            fontFamily: 'Sans',
            padding,
            boxSizing: 'border-box',
            position: 'relative',
            overflow: 'hidden',
        },
    },
        // Top-right accent corner block
        h('div', {
            style: {
                display: 'flex',
                position: 'absolute',
                top: 0,
                right: 0,
                width: Math.round(width * 0.25),
                height: Math.round(height * 0.04),
                background: accent,
            },
        }),

        // Eyebrow
        h('div', { style: { display: 'flex', marginBottom: 22 } },
            eyebrow(`${tokens.issueLabel} · The Itinerary`, accent),
        ),

        // Massive route headline
        text(tokens.route, {
            fontSize: Math.round(width * 0.1),
            lineHeight: 0.95,
            fontWeight: 900,
            color: PAPER_INK,
            marginBottom: 36,
            maxWidth: '95%',
        }),

        // Day rows
        h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1 } },
            ...rows.map((row, index) => h('div', {
                key: row,
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    paddingTop: 16,
                    paddingBottom: 16,
                    borderTop: index === 0
                        ? `2px solid ${accent}`
                        : '1px solid rgba(0,0,0,0.10)',
                },
            },
                h('div', {
                    style: {
                        display: 'flex',
                        width: 10,
                        height: 10,
                        background: accent,
                        borderRadius: '50%',
                        marginRight: 18,
                    },
                }),
                h('span', {
                    style: {
                        display: 'flex',
                        color: accent,
                        fontFamily: 'Mono',
                        fontSize: 18,
                        fontWeight: 700,
                        letterSpacing: 1.5,
                        width: 56,
                    },
                }, `D${String(index + 1).padStart(2, '0')}`),
                h('span', {
                    style: {
                        display: 'flex',
                        flex: 1,
                        fontSize: 24,
                        fontWeight: 600,
                        color: PAPER_INK,
                    },
                }, row),
                h('span', {
                    style: {
                        display: 'flex',
                        color: PAPER_MUTED,
                        fontFamily: 'Mono',
                        fontSize: 13,
                        letterSpacing: 1.5,
                        textTransform: 'uppercase',
                    },
                }, index === 0 ? 'Boarding' : 'At Sea'),
            )),
        ),

        // CTA pill + vessel mono
        h('div', {
            style: {
                display: 'flex',
                marginTop: 32,
                alignItems: 'center',
                justifyContent: 'space-between',
            },
        },
            pillCta(tokens.cta, accent, { size: 'md' }),
            text(tokens.vesselName, {
                color: PAPER_MUTED,
                fontFamily: 'Mono',
                fontSize: 13,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
            }),
        ),
    );
}

// ─── Type Hook Card (9:16, Story/Reels) ──────────────────────────────────────
//
// Big punchy headline over a radial accent glow. Top eyebrow with "Now Forming"
// chip drives urgency. Bottom: accent rule, vessel/date in mono, large pill CTA.
//
export function typeHookCard(input: RenderInput): React.ReactElement {
    const { tokens, width, height } = input;
    const accent = tokens.accentHex;
    const rgb = hexToRgb(accent);
    const padding = Math.round(width * 0.085);

    return h('div', {
        style: {
            width, height,
            display: 'flex',
            flexDirection: 'column',
            background: `radial-gradient(circle at 50% -10%, rgba(${rgb},0.22), ${DARK} 55%)`,
            color: INK,
            fontFamily: 'Sans',
            padding,
            boxSizing: 'border-box',
            position: 'relative',
            overflow: 'hidden',
        },
    },
        // Top eyebrow + status chip
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
            eyebrow(`${tokens.issueLabel} · ${tokens.route}`, accent, 18),
            h('div', {
                style: {
                    display: 'flex',
                    background: accent,
                    color: '#fff',
                    fontFamily: 'Mono',
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: 2,
                    padding: '6px 12px',
                    textTransform: 'uppercase',
                },
            }, 'Now Forming'),
        ),

        // Massive centered headline
        h('div', {
            style: {
                display: 'flex',
                flex: 1,
                alignItems: 'center',
                marginTop: 28,
                marginBottom: 28,
            },
        }, headlineWithAccent(tokens, Math.round(width * 0.155))),

        // Bottom: accent rule + meta + CTA
        h('div', {
            style: {
                display: 'flex',
                flexDirection: 'column',
                gap: 22,
                borderTop: `2px solid ${accent}`,
                paddingTop: 26,
            },
        },
            text(`${tokens.vesselName} · ${tokens.departure}`, {
                fontFamily: 'Mono',
                fontSize: 16,
                letterSpacing: 2,
                color: MUTED,
                textTransform: 'uppercase',
            }),
            pillCta(tokens.cta, accent, { size: 'lg' }),
        ),
    );
}

// ─── Image Detail Ad (1.91:1, Facebook / Google Display) ─────────────────────
//
// Image takes ~52% with a right-edge dark blend, text panel right with a 3px
// accent border, top-right outline badge, italic accent headline, subhead,
// pill CTA, and bottom monospaced metadata strip. Designed for paid display
// placements where the image carries first attention.
//
export function imageDetailAd(input: RenderInput): React.ReactElement {
    const { tokens, sourceImage, width, height } = input;
    const accent = tokens.accentHex;
    const rgb = hexToRgb(accent);
    const imageWidth = Math.round(width * 0.52);
    const textWidth = width - imageWidth;
    const padding = Math.round(textWidth * 0.075);
    const headlineSize = Math.round(textWidth * 0.115);
    const headlineParts = tokens.headline.split(new RegExp(`(${escapeRegExp(tokens.italicWord)})`, 'i'));

    return h('div', {
        style: {
            width, height,
            display: 'flex',
            flexDirection: 'row',
            background: DARK,
            color: INK,
            fontFamily: 'Sans',
            boxSizing: 'border-box',
            position: 'relative',
            overflow: 'hidden',
        },
    },
        // Image (left)
        h('div', {
            style: {
                display: 'flex',
                width: imageWidth,
                height: '100%',
                position: 'relative',
            },
        },
            renderImageModule(sourceImage, { width: imageWidth, height: '100%' }),
            // Right-edge blend overlay
            h('div', {
                style: {
                    display: 'flex',
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: Math.round(imageWidth * 0.25),
                    height: '100%',
                    background: `linear-gradient(90deg, rgba(8,9,13,0) 0%, ${DARK} 100%)`,
                },
            }),
        ),

        // Text panel (right)
        h('div', {
            style: {
                display: 'flex',
                flexDirection: 'column',
                width: textWidth,
                height: '100%',
                background: `linear-gradient(135deg, ${DARK} 0%, ${DEEP} 100%)`,
                padding,
                position: 'relative',
                borderLeft: `3px solid ${accent}`,
            },
        },
            // Top-right outline badge
            h('div', {
                style: {
                    display: 'flex',
                    position: 'absolute',
                    top: 22,
                    right: 22,
                    background: `rgba(${rgb},0.12)`,
                    color: accent,
                    fontFamily: 'Mono',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 2,
                    padding: '6px 10px',
                    textTransform: 'uppercase',
                    border: `1px solid ${accent}`,
                },
            }, tokens.issueLabel),

            // Eyebrow
            h('div', { style: { display: 'flex', marginTop: 'auto', marginBottom: 18 } },
                eyebrow(tokens.route, accent, 14),
            ),

            // Headline with italic accent
            h('div', {
                style: {
                    display: 'flex',
                    flexWrap: 'wrap',
                    fontSize: headlineSize,
                    lineHeight: 0.96,
                    fontWeight: 900,
                    marginBottom: 16,
                    maxWidth: '94%',
                },
            }, ...headlineParts.map((part, i) => h('span', {
                key: `h-${i}`,
                style: {
                    color: part.toLowerCase() === tokens.italicWord.toLowerCase() ? accent : INK,
                    fontStyle: part.toLowerCase() === tokens.italicWord.toLowerCase() ? 'italic' : 'normal',
                    fontFamily: part.toLowerCase() === tokens.italicWord.toLowerCase() ? 'Serif' : 'Sans',
                    marginRight: 10,
                },
            }, part))),

            // Subhead
            text(tokens.subhead, {
                color: INK_SOFT,
                fontSize: 17,
                lineHeight: 1.4,
                marginBottom: 26,
                maxWidth: '94%',
            }),

            // CTA pill
            h('div', { style: { display: 'flex', marginBottom: 'auto' } },
                pillCta(tokens.cta, accent, { size: 'sm' }),
            ),

            // Bottom metadata strip
            h('div', {
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: MUTED,
                    fontFamily: 'Mono',
                    fontSize: 11,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    borderTop: '1px solid rgba(255,255,255,0.10)',
                    paddingTop: 14,
                },
            },
                h('span', {}, tokens.vesselName),
                h('span', {}, tokens.departure),
            ),
        ),
    );
}
