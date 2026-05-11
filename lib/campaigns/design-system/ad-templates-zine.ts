import React from 'react';
import type { NicheTokens } from './types';
import { imageBufferToDataUri } from './renderer/satori-renderer';
import {
    PAPER_INK,
    h,
    baseStyle,
    type SourceImageRef,
} from './ad-templates-shared';

interface RenderInput {
    tokens: NicheTokens;
    sourceImage?: SourceImageRef;
    width: number;
    height: number;
}

// ─── System 3: Indie Zine ────────────────────────────────────────────────────

function polaroidFrame(src: string | undefined, caption: string, rotation: number, w: number, frameH: number): React.ReactElement {
    return h('div', { style: { display: 'flex', flexDirection: 'column', background: '#fff', padding: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.15)', transform: `rotate(${rotation}deg)`, width: w, alignItems: 'center' } },
        h('div', { style: { width: w - 16, height: frameH - 16, background: src ? undefined : '#ddd', overflow: 'hidden' } },
            src ? h('img', { src, style: { width: '100%', height: '100%', objectFit: 'cover' } }) : h('div', { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 12 } }, 'photo'),
        ),
        h('div', { style: { fontFamily: 'Hand', fontSize: 12, color: PAPER_INK, marginTop: 6, textAlign: 'center' } }, caption),
    );
}

export function zineCover(input: RenderInput): React.ReactElement {
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

export function scribbleSocial(input: RenderInput): React.ReactElement {
    const { tokens, sourceImage, width, height } = input;
    const dataUri = sourceImage ? imageBufferToDataUri(sourceImage.buffer, sourceImage.record.mimeType) : undefined;
    return h('div', { style: { ...baseStyle(width, height, '#f5efe0', 'Sans'), color: PAPER_INK, padding: Math.round(width * 0.06), flexDirection: 'row', gap: 20, alignItems: 'center' } },
        polaroidFrame(dataUri, tokens.sectionLabels[0] ?? 'zine', -5, Math.round(width * 0.42), Math.round(height * 0.55)),
        h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, gap: 16 } },
            h('div', { style: { fontFamily: 'Marker', fontSize: Math.round(width * 0.085), color: PAPER_INK, lineHeight: 1 } }, tokens.headline),
            h('div', { style: { fontFamily: 'Hand', fontSize: 18, color: '#555' } }, `${tokens.vesselName} · ${tokens.route}`),
            h('div', { style: { fontFamily: 'Hand', fontSize: 16, color: tokens.accentHex } }, tokens.cta),
        ),
    );
}

export function stickerSheet(input: RenderInput): React.ReactElement {
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
