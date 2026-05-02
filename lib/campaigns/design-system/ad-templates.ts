import React from 'react';
import type { AssetRecord } from '../schema';
import type { DesignedAdArtifactKind, DesignedAdRenderSpec, NicheTokens, VisualSystem } from './types';
import { imageBufferToDataUri, renderPngFromElement } from './renderer/satori-renderer';
import type { FontFamily } from './renderer/satori-renderer';

const DARK = '#08090d';
const INK = '#f7f1e6';
const MUTED = '#9ca3af';
const PAPER = '#f4ead8';
const PAPER_INK = '#111111';
const CREAM = '#f7f1e6';
const MANILA = '#e8d5b7';

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

function baseStyle(width: number, height: number, background = DARK, fontFamily = 'Sans'): React.CSSProperties {
    return {
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        background,
        color: INK,
        fontFamily,
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
            fontFamily: part.toLowerCase() === tokens.italicWord.toLowerCase() ? 'Serif' : 'Sans',
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

// ────────────────────────────────────────────────────────────────────────────
// System 2 — Travel Nostalgia
// ────────────────────────────────────────────────────────────────────────────

function postcardHero(input: RenderInput): React.ReactElement {
    const { tokens, sourceImage, width, height } = input;
    const nicheShort = tokens.nicheVocabulary.slice(0, 2).join(' ');
    return h('div', { style: { ...baseStyle(width, height, CREAM, 'Sans'), padding: Math.round(width * 0.06), transform: 'rotate(1.5deg)' } },
        h('div', { style: { display: 'flex', flexDirection: 'column', background: '#fff', padding: Math.round(width * 0.045), borderRadius: 4, boxShadow: '0 4px 24px rgba(0,0,0,0.12)' } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 14, fontFamily: 'Mono', fontSize: 14, color: PAPER_INK } },
                h('span', {}, tokens.vesselName),
                h('span', {}, tokens.route),
            ),
            renderImageModule(sourceImage, { width: '100%', height: Math.round(height * 0.35), borderRadius: 2, marginBottom: 16, border: '6px solid #fff' }),
            h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 10 } },
                h('div', { style: { display: 'flex', background: tokens.accentHex, color: '#fff', fontSize: 12, fontFamily: 'Mono', padding: '4px 10px', borderRadius: 2 } }, `${tokens.vesselName} \u00b7 ${nicheShort}`),
            ),
            h('div', { style: { display: 'flex', border: '1px dashed #999', borderRadius: '50%', width: 80, height: 80, alignItems: 'center', justifyContent: 'center', fontSize: 11, fontFamily: 'Mono', color: PAPER_INK, marginBottom: 14 } }, `${tokens.route}\n${tokens.departure}`),
            h('div', { style: { display: 'flex', fontFamily: 'Hand', fontSize: 22, color: PAPER_INK, lineHeight: 1.4 } }, `Wish you were here. ${tokens.headline}`),
        ),
    );
}

function airMailSocial(input: RenderInput): React.ReactElement {
    const { tokens, width, height } = input;
    return h('div', { style: { ...baseStyle(width, height, CREAM, 'Hand'), padding: Math.round(width * 0.08), border: '12px solid transparent', borderImage: 'repeating-linear-gradient(45deg, #c0392b 0, #c0392b 10px, #fff 10px, #fff 20px, #2980b9 20px, #2980b9 30px, #fff 30px, #fff 40px) 12' } },
        h('div', { style: { display: 'flex', fontFamily: 'Hand', fontSize: Math.round(width * 0.08), color: PAPER_INK, lineHeight: 1.1, marginBottom: 24 } }, tokens.headline),
        h('div', { style: { display: 'flex', fontFamily: 'Hand', fontSize: 22, color: PAPER_INK, lineHeight: 1.4, marginBottom: 24 } }, `Sailing ${tokens.departure} to ${tokens.route}. ${tokens.cta}`),
        h('div', { style: { display: 'flex', fontFamily: 'Mono', fontSize: 14, color: '#888', marginTop: 'auto' } }, `${tokens.vesselName} \u00b7 ${tokens.route} \u00b7 ${tokens.departure}`),
    );
}

function boardingPass(input: RenderInput): React.ReactElement {
    const { tokens, width, height } = input;
    return h('div', { style: { ...baseStyle(width, height, MANILA, 'Sans'), color: PAPER_INK } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 14, fontFamily: 'Mono', marginBottom: 18 } },
            h('span', {}, 'BOARDING PASS'),
            h('span', {}, tokens.issueLabel),
        ),
        h('div', { style: { display: 'flex', fontSize: Math.round(width * 0.08), fontWeight: 900, marginBottom: 24 } }, tokens.route),
        h('div', { style: { display: 'flex', borderBottom: '2px dashed #bfa87a', paddingBottom: 18, marginBottom: 18 } },
            h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1 } },
                h('span', { style: { fontSize: 12, fontFamily: 'Mono', color: '#888' } }, 'VESSEL'),
                h('span', { style: { fontSize: 22, fontWeight: 700 } }, tokens.vesselName),
            ),
            h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1 } },
                h('span', { style: { fontSize: 12, fontFamily: 'Mono', color: '#888' } }, 'DEPARTURE'),
                h('span', { style: { fontSize: 22, fontWeight: 700 } }, tokens.departure),
            ),
        ),
        ...tokens.sectionLabels.slice(0, 3).map((row, index) => h('div', { key: row, style: { display: 'flex', fontSize: 18, padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.1)' } },
            h('span', { style: { fontFamily: 'Mono', color: tokens.accentHex, width: 48 } }, `D${index + 1}`),
            h('span', {}, row),
        )),
        h('div', { style: { display: 'flex', marginTop: 'auto', justifyContent: 'space-between', alignItems: 'flex-end' } },
            h('div', { style: { display: 'flex', flexDirection: 'column' } },
                h('span', { style: { fontSize: 12, fontFamily: 'Mono', color: '#888' } }, 'SEAL'),
                h('span', { style: { fontSize: 16, fontFamily: 'Serif', fontStyle: 'italic' } }, tokens.nicheVocabulary[0] ?? 'Voyage'),
            ),
            h('div', { style: { display: 'flex', border: '2px dashed #555', padding: '4px 8px', fontFamily: 'Mono', fontSize: 14 } }, '||| || ||| ||'),
        ),
    );
}

function baggageTag(input: RenderInput): React.ReactElement {
    const { tokens, width, height } = input;
    return h('div', { style: { ...baseStyle(width, height, MANILA, 'Sans'), color: PAPER_INK, alignItems: 'center', justifyContent: 'center' } },
        h('div', { style: { display: 'flex', borderRadius: 8, border: '2px solid #bfa87a', width: '78%', height: '82%', flexDirection: 'column', padding: Math.round(width * 0.06) } },
            h('div', { style: { display: 'flex', justifyContent: 'center', marginBottom: 16 } },
                h('div', { style: { width: 28, height: 28, borderRadius: '50%', border: '3px solid #8b7355' } }),
            ),
            h('div', { style: { display: 'flex', fontFamily: 'Serif', fontStyle: 'italic', fontSize: Math.round(width * 0.055), fontWeight: 700, textAlign: 'center', marginBottom: 18 } }, tokens.nicheVocabulary[0] ?? tokens.headline),
            h('div', { style: { display: 'flex', background: tokens.accentHex, color: '#fff', fontFamily: 'Mono', fontSize: 14, padding: '6px 12px', textAlign: 'center', marginBottom: 18 } }, tokens.vesselName),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between' } },
                    h('span', { style: { fontSize: 12, fontFamily: 'Mono', color: '#888' } }, 'FROM'),
                    h('span', { style: { fontSize: 18 } }, 'Home Port'),
                ),
                h('div', { style: { display: 'flex', justifyContent: 'space-between' } },
                    h('span', { style: { fontSize: 12, fontFamily: 'Mono', color: '#888' } }, 'TO'),
                    h('span', { style: { fontSize: 18 } }, tokens.route),
                ),
                h('div', { style: { display: 'flex', justifyContent: 'space-between' } },
                    h('span', { style: { fontSize: 12, fontFamily: 'Mono', color: '#888' } }, 'DATE'),
                    h('span', { style: { fontSize: 18 } }, tokens.departure),
                ),
            ),
        ),
    );
}

// ────────────────────────────────────────────────────────────────────────────
// System 3 — Indie Zine
// ────────────────────────────────────────────────────────────────────────────

function polaroidFrame(src: string | undefined, caption: string, rotation: number, w: number, frameH: number): React.ReactElement {
    return h('div', { style: { display: 'flex', flexDirection: 'column', background: '#fff', padding: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.15)', transform: `rotate(${rotation}deg)`, width: w, alignItems: 'center' } },
        h('div', { style: { width: w - 16, height: frameH - 16, background: src ? undefined : '#ddd', overflow: 'hidden' } },
            src ? h('img', { src, style: { width: '100%', height: '100%', objectFit: 'cover' } }) : h('div', { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 12 } }, 'photo'),
        ),
        h('div', { style: { fontFamily: 'Hand', fontSize: 12, color: PAPER_INK, marginTop: 6, textAlign: 'center' } }, caption),
    );
}

function zineCover(input: RenderInput): React.ReactElement {
    const { tokens, sourceImage, width, height } = input;
    const dataUri = sourceImage ? imageBufferToDataUri(sourceImage.buffer, sourceImage.record.mimeType) : undefined;
    const captions = tokens.sectionLabels.slice(0, 4);
    const rotations = [-6, 4, -3, 7];
    return h('div', { style: { ...baseStyle(width, height, '#f5efe0', 'Sans'), color: PAPER_INK, padding: Math.round(width * 0.05) } },
        h('div', { style: { display: 'flex', background: '#e8ddd0', padding: '10px 18px', transform: 'rotate(-2deg)', marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' } },
            h('span', { style: { fontFamily: 'Marker', fontSize: Math.round(width * 0.065), color: PAPER_INK } }, `${tokens.headline}`),
        ),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center', alignItems: 'center', flex: 1 } },
            captions.map((cap, i) => polaroidFrame(dataUri, cap, rotations[i] ?? 0, Math.round(width * 0.32), Math.round(height * 0.22))),
        ),
        h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: 20 } },
            h('div', { style: { background: '#fffcaa', padding: '8px 12px', fontFamily: 'Hand', fontSize: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.1)' } }, tokens.subhead.slice(0, 60)),
            h('div', { style: { fontFamily: 'Marker', fontSize: 18, color: tokens.accentHex } }, tokens.vesselName),
        ),
    );
}

function scribbleSocial(input: RenderInput): React.ReactElement {
    const { tokens, sourceImage, width, height } = input;
    const dataUri = sourceImage ? imageBufferToDataUri(sourceImage.buffer, sourceImage.record.mimeType) : undefined;
    return h('div', { style: { ...baseStyle(width, height, '#f5efe0', 'Sans'), color: PAPER_INK, padding: Math.round(width * 0.06), flexDirection: 'row', gap: 20, alignItems: 'center' } },
        polaroidFrame(dataUri, tokens.sectionLabels[0] ?? 'zine', -5, Math.round(width * 0.42), Math.round(height * 0.55)),
        h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, gap: 16 } },
            h('div', { style: { fontFamily: 'Marker', fontSize: Math.round(width * 0.085), color: PAPER_INK, lineHeight: 1 } }, tokens.headline),
            h('div', { style: { fontFamily: 'Hand', fontSize: 18, color: '#555' } }, `${tokens.vesselName} \u00b7 ${tokens.route}`),
            h('div', { style: { fontFamily: 'Hand', fontSize: 16, color: tokens.accentHex } }, tokens.cta),
        ),
    );
}

function stickerSheet(input: RenderInput): React.ReactElement {
    const { tokens, width, height } = input;
    const labels = [
        { text: tokens.vesselName, shape: 'rounded' as const },
        { text: tokens.route, shape: 'circle' as const },
        { text: tokens.nicheVocabulary[0] ?? 'Voyage', shape: 'star' as const },
        { text: tokens.sectionLabels[0] ?? 'At Sea', shape: 'rounded' as const },
        { text: tokens.departure, shape: 'circle' as const },
        { text: tokens.cta, shape: 'rounded' as const },
    ];
    const positions = [
        { x: 40, y: 40, rot: -8 },
        { x: width - 200, y: 60, rot: 12 },
        { x: 60, y: height / 2 - 40, rot: 5 },
        { x: width - 220, y: height / 2 - 20, rot: -4 },
        { x: 80, y: height - 140, rot: 10 },
        { x: width - 240, y: height - 120, rot: -6 },
    ];
    return h('div', { style: { ...baseStyle(width, height, '#f5efe0', 'Sans'), color: PAPER_INK, padding: 0 } },
        ...labels.map((label, i) => {
            const pos = positions[i] ?? { x: 50, y: 50, rot: 0 };
            const borderRadius = label.shape === 'circle' ? '50%' : label.shape === 'star' ? 4 : 24;
            return h('div', { key: i, style: { position: 'absolute', left: pos.x, top: pos.y, transform: `rotate(${pos.rot}deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: tokens.accentHex, color: '#fff', fontFamily: 'Sans', fontSize: 16, fontWeight: 700, padding: '14px 22px', borderRadius, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' } }, label.text);
        }),
    );
}

function renderElement(input: RenderInput): React.ReactElement {
    switch (input.kind) {
        case 'editorial_cover_ad': return editorialCover(input);
        case 'quote_card': return quoteCard(input);
        case 'itinerary_toc_card': return itineraryCard(input);
        case 'contributor_card': return contributorCard(input);
        case 'type_hook_card': return typeHookCard(input);
        case 'image_detail_ad': return imageDetailAd(input);
        case 'postcard_hero': return postcardHero(input);
        case 'air_mail_social': return airMailSocial(input);
        case 'boarding_pass': return boardingPass(input);
        case 'baggage_tag': return baggageTag(input);
        case 'zine_cover': return zineCover(input);
        case 'scribble_social': return scribbleSocial(input);
        case 'sticker_sheet': return stickerSheet(input);
    }
}

function fontsForSystem(system: VisualSystem): FontFamily[] {
    switch (system) {
        case 'system_1_editorial': return ['Sans', 'Serif', 'Mono'];
        case 'system_2_nostalgia': return ['Sans', 'Serif', 'Hand', 'Mono'];
        case 'system_3_zine': return ['Sans', 'Marker', 'Hand'];
        case 'system_4_modular': return ['Sans', 'Mono'];
    }
}

function defaultSpecsForSystem(system: VisualSystem, sourceImages: readonly AssetRecord[]): DesignedAdRenderSpec[] {
    switch (system) {
        case 'system_1_editorial':
            return [
                { kind: 'editorial_cover_ad', assetId: 'ad_editorial_cover_4x5', fileName: 'ads/editorial_cover_4x5.png', width: 1080, height: 1350, tags: ['designed_ad', 'editorial_cover', 'instagram_feed'], sourceImage: sourceImages[0] },
                { kind: 'quote_card', assetId: 'ad_quote_card_1x1', fileName: 'ads/quote_card_1x1.png', width: 1080, height: 1080, tags: ['designed_ad', 'quote', 'instagram_square'] },
                { kind: 'itinerary_toc_card', assetId: 'ad_itinerary_toc_4x5', fileName: 'ads/itinerary_toc_4x5.png', width: 1080, height: 1350, tags: ['designed_ad', 'itinerary', 'carousel'] },
                { kind: 'contributor_card', assetId: 'ad_contributor_card_1x1', fileName: 'ads/contributor_card_1x1.png', width: 1080, height: 1080, tags: ['designed_ad', 'contributor', 'social'], sourceImage: sourceImages[3] ?? sourceImages[1] },
                { kind: 'type_hook_card', assetId: 'ad_type_hook_9x16', fileName: 'ads/type_hook_9x16.png', width: 1080, height: 1920, tags: ['designed_ad', 'type_hook', 'story', 'tiktok'] },
                { kind: 'image_detail_ad', assetId: 'ad_image_detail_191x100', fileName: 'ads/image_detail_191x100.png', width: 1200, height: 628, tags: ['designed_ad', 'image_detail', 'facebook', 'google_display'], sourceImage: sourceImages[1] ?? sourceImages[0] },
            ];
        case 'system_2_nostalgia':
            return [
                { kind: 'postcard_hero', assetId: 'ad_postcard_hero_5x3', fileName: 'ads/postcard_hero_5x3.png', width: 1080, height: 648, tags: ['designed_ad', 'postcard_hero', 'instagram_feed'], sourceImage: sourceImages[0] },
                { kind: 'quote_card', assetId: 'ad_quote_card_1x1', fileName: 'ads/quote_card_1x1.png', width: 1080, height: 1080, tags: ['designed_ad', 'quote', 'instagram_square'] },
                { kind: 'air_mail_social', assetId: 'ad_air_mail_1x1', fileName: 'ads/air_mail_1x1.png', width: 1080, height: 1080, tags: ['designed_ad', 'air_mail', 'instagram_square'] },
                { kind: 'boarding_pass', assetId: 'ad_boarding_pass_portrait', fileName: 'ads/boarding_pass_portrait.png', width: 1080, height: 1350, tags: ['designed_ad', 'boarding_pass', 'carousel'] },
                { kind: 'baggage_tag', assetId: 'ad_baggage_tag_2x3', fileName: 'ads/baggage_tag_2x3.png', width: 720, height: 1080, tags: ['designed_ad', 'baggage_tag', 'social'] },
                { kind: 'image_detail_ad', assetId: 'ad_image_detail_191x100', fileName: 'ads/image_detail_191x100.png', width: 1200, height: 628, tags: ['designed_ad', 'image_detail', 'facebook', 'google_display'], sourceImage: sourceImages[1] ?? sourceImages[0] },
            ];
        case 'system_3_zine':
            return [
                { kind: 'zine_cover', assetId: 'ad_zine_cover_3x4', fileName: 'ads/zine_cover_3x4.png', width: 1080, height: 1440, tags: ['designed_ad', 'zine_cover', 'instagram_feed'], sourceImage: sourceImages[0] },
                { kind: 'scribble_social', assetId: 'ad_scribble_social_1x1', fileName: 'ads/scribble_social_1x1.png', width: 1080, height: 1080, tags: ['designed_ad', 'scribble', 'instagram_square'], sourceImage: sourceImages[1] ?? sourceImages[0] },
                { kind: 'sticker_sheet', assetId: 'ad_sticker_sheet', fileName: 'ads/sticker_sheet.png', width: 1080, height: 1080, tags: ['designed_ad', 'sticker_sheet', 'instagram_square'] },
                { kind: 'quote_card', assetId: 'ad_quote_card_1x1', fileName: 'ads/quote_card_1x1.png', width: 1080, height: 1080, tags: ['designed_ad', 'quote', 'instagram_square'] },
                { kind: 'type_hook_card', assetId: 'ad_type_hook_9x16', fileName: 'ads/type_hook_9x16.png', width: 1080, height: 1920, tags: ['designed_ad', 'type_hook', 'story', 'tiktok'] },
                { kind: 'image_detail_ad', assetId: 'ad_image_detail_191x100', fileName: 'ads/image_detail_191x100.png', width: 1200, height: 628, tags: ['designed_ad', 'image_detail', 'facebook', 'google_display'], sourceImage: sourceImages[1] ?? sourceImages[0] },
            ];
        case 'system_4_modular':
            return [
                { kind: 'type_hook_card', assetId: 'ad_type_hook_9x16', fileName: 'ads/type_hook_9x16.png', width: 1080, height: 1920, tags: ['designed_ad', 'type_hook', 'story', 'tiktok'] },
                { kind: 'quote_card', assetId: 'ad_quote_card_1x1', fileName: 'ads/quote_card_1x1.png', width: 1080, height: 1080, tags: ['designed_ad', 'quote', 'instagram_square'] },
                { kind: 'itinerary_toc_card', assetId: 'ad_itinerary_toc_4x5', fileName: 'ads/itinerary_toc_4x5.png', width: 1080, height: 1350, tags: ['designed_ad', 'itinerary', 'carousel'] },
                { kind: 'image_detail_ad', assetId: 'ad_image_detail_191x100', fileName: 'ads/image_detail_191x100.png', width: 1200, height: 628, tags: ['designed_ad', 'image_detail', 'facebook', 'google_display'], sourceImage: sourceImages[0] },
            ];
    }
}

export function buildDesignedAdRenderSpecs(
    tokens: NicheTokens,
    adFormatBias: string[],
    sourceImages: readonly AssetRecord[],
): DesignedAdRenderSpec[] {
    const all = defaultSpecsForSystem(tokens.system, sourceImages);
    if (!adFormatBias || adFormatBias.length === 0) return all;

    const loweredBias = adFormatBias.map((b) => b.toLowerCase().replace(/_/g, ''));
    const scored = all.map((spec) => {
        const specKind = spec.kind.toLowerCase().replace(/_/g, '');
        const specTags = spec.tags.map((t) => t.toLowerCase().replace(/_/g, ''));
        const kindScore = loweredBias.some((b) => specKind.includes(b)) ? 2 : 0;
        const tagScore = loweredBias.some((b) => specTags.some((t) => t.includes(b))) ? 1 : 0;
        return { spec, score: kindScore + tagScore };
    });

    // Bias should re-rank the pack, not collapse it to a tiny subset. We still want
    // the full designed artifact family so review sees actual template coverage.
    return scored
        .sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return all.indexOf(a.spec) - all.indexOf(b.spec);
        })
        .map((entry) => entry.spec);
}

export async function renderDesignedAdArtifact(
    spec: DesignedAdRenderSpec,
    tokens: NicheTokens,
    sourceBuffer?: Buffer,
): Promise<Buffer> {
    const element = renderElement({
        kind: spec.kind,
        tokens,
        sourceImage: spec.sourceImage && sourceBuffer ? { buffer: sourceBuffer, record: spec.sourceImage } : undefined,
        width: spec.width,
        height: spec.height,
    });
    return renderPngFromElement(element, {
        width: spec.width,
        height: spec.height,
        fonts: fontsForSystem(tokens.system),
    });
}
