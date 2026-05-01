import React from 'react';
import type { AssetRecord } from '../schema';
import type { DesignedAdArtifactKind, DesignedAdRenderSpec, NicheTokens } from './types';
import { imageBufferToDataUri, renderPngFromElement } from './renderer/satori-renderer';

const DARK = '#08090d';
const INK = '#f7f1e6';
const MUTED = '#9ca3af';
const PAPER = '#f4ead8';
const PAPER_INK = '#111111';

interface RenderInput {
    kind: DesignedAdArtifactKind;
    tokens: NicheTokens;
    sourceImage?: { buffer: Buffer; record: AssetRecord };
    width: number;
    height: number;
}

function h(type: string, props: Record<string, unknown>, ...children: React.ReactNode[]): React.ReactElement {
    return React.createElement(type, props, ...children);
}

function baseStyle(width: number, height: number, background = DARK): React.CSSProperties {
    return {
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        background,
        color: INK,
        fontFamily: 'AdSans',
        padding: Math.round(width * 0.055),
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
    };
}

function label(text: string, accent: string): React.ReactElement {
    return h('div', {
        style: {
            display: 'flex',
            color: accent,
            fontSize: 18,
            letterSpacing: 0,
            textTransform: 'uppercase',
            marginBottom: 18,
        },
    }, text);
}

function renderImageModule(sourceImage: RenderInput['sourceImage'], style: React.CSSProperties): React.ReactElement {
    if (!sourceImage) {
        return h('div', {
            style: {
                ...style,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: MUTED,
                border: '2px dashed rgba(255,255,255,0.25)',
                background: 'rgba(255,255,255,0.04)',
            },
        }, 'DOCUMENTARY DETAIL MODULE');
    }

    return h('img', {
        src: imageBufferToDataUri(sourceImage.buffer, sourceImage.record.mimeType),
        style: {
            ...style,
            objectFit: 'cover',
        },
    });
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function headlineWithAccent(tokens: NicheTokens, size: number): React.ReactElement {
    const parts = tokens.headline.split(new RegExp(`(${escapeRegExp(tokens.italicWord)})`, 'i'));
    return h('div', {
        style: {
            display: 'flex',
            flexWrap: 'wrap',
            fontSize: size,
            lineHeight: 0.92,
            fontWeight: 800,
            letterSpacing: 0,
            maxWidth: '88%',
        },
    }, ...parts.map((part, index) => h('span', {
        key: `${part}-${index}`,
        style: {
            color: part.toLowerCase() === tokens.italicWord.toLowerCase() ? tokens.accentHex : INK,
            fontStyle: part.toLowerCase() === tokens.italicWord.toLowerCase() ? 'italic' : 'normal',
            marginRight: 12,
        },
    }, part)));
}

function editorialCover(input: RenderInput): React.ReactElement {
    const { tokens, sourceImage, width, height } = input;
    return h('div', { style: baseStyle(width, height, PAPER) },
        h('div', { style: { display: 'flex', color: PAPER_INK, justifyContent: 'space-between', fontSize: 18, marginBottom: 20 } },
            h('span', {}, tokens.issueLabel),
            h('span', {}, tokens.route),
            h('span', {}, tokens.departure),
        ),
        h('div', { style: { display: 'flex', color: PAPER_INK, fontSize: Math.round(width * 0.105), fontWeight: 900, lineHeight: 0.9, marginBottom: 18 } }, `${tokens.italicWord} Quarterly`),
        renderImageModule(sourceImage, { width: '100%', height: Math.round(height * 0.42), borderRadius: 0, marginBottom: 24 }),
        h('div', { style: { display: 'flex', color: tokens.accentHex, fontSize: 22, marginBottom: 12 } }, tokens.sectionLabels[0] ?? 'Feature'),
        h('div', { style: { display: 'flex', color: PAPER_INK, fontSize: Math.round(width * 0.075), lineHeight: 0.95, fontWeight: 800, marginBottom: 18 } }, tokens.headline),
        h('div', { style: { display: 'flex', color: PAPER_INK, fontSize: 26, lineHeight: 1.25, maxWidth: '92%' } }, tokens.subhead),
        h('div', { style: { display: 'flex', marginTop: 'auto', color: PAPER_INK, justifyContent: 'space-between', fontSize: 18 } },
            h('span', {}, tokens.vesselName),
            h('span', {}, tokens.cta),
        ),
    );
}

function quoteCard(input: RenderInput): React.ReactElement {
    const { tokens, width, height } = input;
    return h('div', { style: baseStyle(width, height) },
        label(`${tokens.issueLabel} / ${tokens.sectionLabels[0] ?? 'At Sea'}`, tokens.accentHex),
        h('div', { style: { display: 'flex', fontSize: Math.round(width * 0.09), lineHeight: 1.02, fontWeight: 800, marginTop: 'auto', marginBottom: 'auto' } }, `"${tokens.quote}"`),
        h('div', { style: { display: 'flex', color: tokens.accentHex, fontSize: 28, marginBottom: 8 } }, tokens.quoteCite),
        h('div', { style: { display: 'flex', color: MUTED, fontSize: 20 } }, `${tokens.vesselName} · ${tokens.route}`),
    );
}

function itineraryCard(input: RenderInput): React.ReactElement {
    const { tokens, width, height } = input;
    const rows = tokens.sectionLabels.slice(0, 5);
    return h('div', { style: baseStyle(width, height, PAPER) },
        h('div', { style: { display: 'flex', color: tokens.accentHex, fontSize: 24, marginBottom: 18 } }, `${tokens.issueLabel} · Contents`),
        h('div', { style: { display: 'flex', color: PAPER_INK, fontSize: Math.round(width * 0.085), fontWeight: 900, lineHeight: 0.95, marginBottom: 36 } }, tokens.route),
        ...rows.map((row, index) => h('div', {
            key: row,
            style: {
                display: 'flex',
                color: PAPER_INK,
                borderTop: '1px solid rgba(0,0,0,0.25)',
                padding: '18px 0',
                alignItems: 'center',
                fontSize: 26,
            },
        },
            h('span', { style: { display: 'flex', color: tokens.accentHex, width: 64, fontWeight: 800 } }, String(index + 1).padStart(2, '0')),
            h('span', { style: { display: 'flex', flex: 1 } }, row),
            h('span', { style: { display: 'flex', color: '#555', fontSize: 18 } }, index === 0 ? tokens.departure : 'At sea'),
        )),
        h('div', { style: { display: 'flex', marginTop: 'auto', color: PAPER_INK, fontSize: 20 } }, tokens.cta),
    );
}

function contributorCard(input: RenderInput): React.ReactElement {
    const { tokens, sourceImage, width, height } = input;
    return h('div', { style: baseStyle(width, height) },
        renderImageModule(sourceImage, { width: '100%', height: Math.round(height * 0.52), borderRadius: 0, marginBottom: 24 }),
        label('Contributor / Campaign Host', tokens.accentHex),
        h('div', { style: { display: 'flex', fontSize: 48, lineHeight: 1, fontWeight: 850, marginBottom: 14 } }, tokens.quoteCite),
        h('div', { style: { display: 'flex', color: MUTED, fontSize: 25, lineHeight: 1.25 } }, `${tokens.sectionLabels[0] ?? 'Campaign'} voice for ${tokens.vesselName}. ${tokens.quote}`),
    );
}

function typeHookCard(input: RenderInput): React.ReactElement {
    const { tokens, width, height } = input;
    return h('div', { style: baseStyle(width, height) },
        label(`${tokens.issueLabel} · ${tokens.route}`, tokens.accentHex),
        h('div', { style: { display: 'flex', flex: 1, alignItems: 'center' } }, headlineWithAccent(tokens, Math.round(width * 0.135))),
        h('div', { style: { display: 'flex', justifyContent: 'space-between', color: MUTED, fontSize: 26 } },
            h('span', {}, tokens.departure),
            h('span', { style: { color: INK } }, tokens.cta),
        ),
    );
}

function imageDetailAd(input: RenderInput): React.ReactElement {
    const { tokens, sourceImage, width, height } = input;
    return h('div', { style: baseStyle(width, height) },
        h('div', { style: { display: 'flex', flexDirection: 'row', gap: 36, height: '100%' } },
            renderImageModule(sourceImage, { width: Math.round(width * 0.48), height: '100%', borderRadius: 0 }),
            h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' } },
                label(tokens.issueLabel, tokens.accentHex),
                headlineWithAccent(tokens, Math.round(width * 0.052)),
                h('div', { style: { display: 'flex', color: MUTED, fontSize: 24, lineHeight: 1.35, marginTop: 22 } }, tokens.subhead),
                h('div', { style: { display: 'flex', color: tokens.accentHex, fontSize: 24, marginTop: 28 } }, tokens.cta),
            ),
        ),
    );
}

function renderElement(input: RenderInput): React.ReactElement {
    if (input.kind === 'editorial_cover_ad') return editorialCover(input);
    if (input.kind === 'quote_card') return quoteCard(input);
    if (input.kind === 'itinerary_toc_card') return itineraryCard(input);
    if (input.kind === 'contributor_card') return contributorCard(input);
    if (input.kind === 'type_hook_card') return typeHookCard(input);
    return imageDetailAd(input);
}

export function buildDesignedAdRenderSpecs(sourceImages: readonly AssetRecord[]): DesignedAdRenderSpec[] {
    return [
        { kind: 'editorial_cover_ad', assetId: 'ad_editorial_cover_4x5', fileName: 'ads/editorial_cover_4x5.png', width: 1080, height: 1350, tags: ['designed_ad', 'editorial_cover', 'instagram_feed'], sourceImage: sourceImages[0] },
        { kind: 'quote_card', assetId: 'ad_quote_card_1x1', fileName: 'ads/quote_card_1x1.png', width: 1080, height: 1080, tags: ['designed_ad', 'quote', 'instagram_square'] },
        { kind: 'itinerary_toc_card', assetId: 'ad_itinerary_toc_4x5', fileName: 'ads/itinerary_toc_4x5.png', width: 1080, height: 1350, tags: ['designed_ad', 'itinerary', 'carousel'] },
        { kind: 'contributor_card', assetId: 'ad_contributor_card_1x1', fileName: 'ads/contributor_card_1x1.png', width: 1080, height: 1080, tags: ['designed_ad', 'contributor', 'social'], sourceImage: sourceImages[3] ?? sourceImages[1] },
        { kind: 'type_hook_card', assetId: 'ad_type_hook_9x16', fileName: 'ads/type_hook_9x16.png', width: 1080, height: 1920, tags: ['designed_ad', 'type_hook', 'story', 'tiktok'] },
        { kind: 'image_detail_ad', assetId: 'ad_image_detail_191x100', fileName: 'ads/image_detail_191x100.png', width: 1200, height: 628, tags: ['designed_ad', 'image_detail', 'facebook', 'google_display'], sourceImage: sourceImages[1] ?? sourceImages[0] },
    ];
}

export async function renderDesignedAdArtifact(
    spec: DesignedAdRenderSpec,
    tokens: NicheTokens,
    sourceBuffer?: Buffer,
): Promise<Buffer> {
    return renderPngFromElement(renderElement({
        kind: spec.kind,
        tokens,
        sourceImage: spec.sourceImage && sourceBuffer ? { buffer: sourceBuffer, record: spec.sourceImage } : undefined,
        width: spec.width,
        height: spec.height,
    }), { width: spec.width, height: spec.height });
}
