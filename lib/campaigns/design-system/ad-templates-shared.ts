import React from 'react';
import type { AssetRecord } from '../schema';
import type { NicheTokens } from './types';
import { imageBufferToDataUri } from './renderer/satori-renderer';

// ─── Color tokens ─────────────────────────────────────────────────────────────

export const DARK = '#08090d';
export const DEEP = '#0c1014';
export const INK = '#f7f1e6';
export const INK_SOFT = '#b8bcc4';
export const MUTED = '#9ca3af';
export const PAPER = '#f4ead8';
export const WARM_PAPER = '#ebe0c5';
export const PAPER_INK = '#111111';
export const PAPER_MUTED = '#7a6e58';
export const CREAM = '#f7f1e6';
export const MANILA = '#e8d5b7';

// ─── Element creator ──────────────────────────────────────────────────────────

export function h(
    type: string,
    props: Record<string, unknown>,
    ...children: React.ReactNode[]
): React.ReactElement {
    return React.createElement(type, props, ...children);
}

// ─── Image source reference ───────────────────────────────────────────────────

export interface SourceImageRef {
    buffer: Buffer;
    record: AssetRecord;
}

// ─── Common base style ────────────────────────────────────────────────────────

export function baseStyle(
    width: number,
    height: number,
    background: string = DARK,
    fontFamily: string = 'Sans',
): React.CSSProperties {
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

// ─── Image module renderer ────────────────────────────────────────────────────

export function renderImageModule(
    sourceImage: SourceImageRef | undefined,
    style: React.CSSProperties,
): React.ReactElement {
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
            objectFit: 'contain',
            objectPosition: 'center',
            backgroundColor: 'rgba(0,0,0,0.08)',
        },
    });
}

// ─── Inline composition helpers ───────────────────────────────────────────────

export function text(content: string, style: React.CSSProperties): React.ReactElement {
    return h('div', { style: { display: 'flex', ...style } }, content);
}

export function rule(color: string, width: number = 56, height: number = 3): React.ReactElement {
    return h('div', { style: { display: 'flex', width, height, background: color } });
}

export function eyebrow(content: string, accent: string, size: number = 16): React.ReactElement {
    return h('div', {
        style: {
            display: 'flex',
            alignItems: 'center',
            color: accent,
            fontFamily: 'Mono',
            fontSize: size,
            letterSpacing: 2,
            textTransform: 'uppercase',
        },
    },
        h('div', { style: { display: 'flex', width: 32, height: 2, background: accent, marginRight: 14 } }),
        h('span', { style: { display: 'flex' } }, content),
    );
}

export interface PillCtaOptions {
    size?: 'sm' | 'md' | 'lg';
    arrow?: string;
    background?: string;
    color?: string;
}

export function pillCta(label: string, accent: string, options: PillCtaOptions = {}): React.ReactElement {
    const { size = 'sm', arrow = '→', background = accent, color = '#fff' } = options;
    const fontSize = size === 'lg' ? 22 : size === 'md' ? 18 : 16;
    const padding = size === 'lg' ? '16px 30px' : size === 'md' ? '14px 26px' : '12px 22px';
    return h('div', {
        style: {
            display: 'flex',
            alignItems: 'center',
            background,
            color,
            fontSize,
            fontWeight: 700,
            padding,
            borderRadius: 999,
            letterSpacing: 1,
            textTransform: 'uppercase',
        },
    }, `${label}  ${arrow}`);
}

// ─── Niche / typography helpers ───────────────────────────────────────────────

export function campaignBadgeText(tokens: NicheTokens): string {
    const shortLabel = tokens.nicheVocabulary.slice(0, 2).join(' ').trim();
    if (/board/i.test(shortLabel) && /game/i.test(shortLabel)) {
        return 'Board Games\nat Sea';
    }
    if (shortLabel.length >= 4) return shortLabel;
    return tokens.headline;
}

export function firstActive(records: readonly AssetRecord[]): AssetRecord | undefined {
    return records.find((record) => record.active) ?? records[0];
}

export function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function hexToRgb(hex: string): string {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `${r},${g},${b}`;
}

export function headlineWithAccent(tokens: NicheTokens, size: number): React.ReactElement {
    const parts = tokens.headline.split(new RegExp(`(${escapeRegExp(tokens.italicWord)})`, 'i'));
    return h('div', {
        style: {
            display: 'flex',
            flexWrap: 'wrap',
            fontSize: size,
            lineHeight: 0.92,
            fontWeight: 800,
            letterSpacing: 0,
            maxWidth: '92%',
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
