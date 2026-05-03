import React from 'react';
import type { CampaignAestheticBrief } from '../../../schema';
import { imageBufferToDataUri, renderPngFromElement } from '../../design-system/renderer/satori-renderer';

export type TikTokOverlayPlacement = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export interface TikTokOverlayCardSpec {
    badge: string;
    headline: string;
    subline: string;
    accentColor: string;
    placement: TikTokOverlayPlacement;
}

function normalizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function normalizeLineBreaks(value: string): string {
    return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function shorten(value: string, maxChars: number): string {
    const normalized = normalizeText(value);
    if (normalized.length <= maxChars) {
        return normalized;
    }

    if (maxChars <= 1) {
        return normalized.slice(0, maxChars);
    }

    return `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}...`;
}

function buildOverlayCardNode(spec: TikTokOverlayCardSpec): React.ReactElement {
    const { width, height } = spec.placement;
    const accent = spec.accentColor || '#F2C450';
    const headlineLines = normalizeLineBreaks(spec.headline)
        .split(/\n|[\/|]/)
        .map((part) => normalizeText(part))
        .filter(Boolean);
    const sublineLines = normalizeLineBreaks(spec.subline)
        .split(/\n|[\/|]/)
        .map((part) => normalizeText(part))
        .filter(Boolean);

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
                borderRadius: 20,
                padding: '34px 34px 30px',
                backgroundImage: 'linear-gradient(180deg, rgba(8, 10, 16, 0.72) 0%, rgba(8, 10, 16, 0.54) 100%)',
                border: '1px solid rgba(242, 196, 80, 0.42)',
                boxShadow: '0 18px 42px rgba(0, 0, 0, 0.30)',
                color: '#F6F1E5',
            },
        },
        React.createElement('div', {
            style: {
                position: 'absolute',
                left: 0,
                top: 0,
                right: 0,
                height: 8,
                backgroundColor: accent,
                opacity: 0.95,
            },
        }),
        React.createElement(
            'div',
            {
                style: {
                    fontFamily: 'Sans',
                    fontSize: 16,
                    lineHeight: 1,
                    letterSpacing: 0,
                    color: accent,
                    marginBottom: 12,
                    textTransform: 'uppercase',
                    fontWeight: 800,
                },
            },
            shorten(spec.badge, 20)
        ),
        React.createElement(
            'div',
            {
                style: {
                    fontFamily: 'Sans',
                    fontSize: 56,
                    lineHeight: 0.94,
                    fontWeight: 900,
                    letterSpacing: 0,
                    marginBottom: 14,
                    maxWidth: width - 68,
                    whiteSpace: 'pre-line',
                },
            },
            headlineLines.length > 0 ? headlineLines.slice(0, 3).join('\n') : shorten(spec.headline, 34)
        ),
        React.createElement(
            'div',
            {
                style: {
                    fontFamily: 'Sans',
                    fontSize: 22,
                    lineHeight: 1.18,
                    letterSpacing: 0,
                    color: 'rgba(246, 241, 229, 0.93)',
                    maxWidth: width - 72,
                    whiteSpace: 'pre-line',
                },
            },
            sublineLines.length > 0 ? sublineLines.slice(0, 3).join('\n') : shorten(spec.subline, 78)
        )
    );
}

export async function renderTikTokOverlayCard(spec: TikTokOverlayCardSpec): Promise<Buffer> {
    return renderPngFromElement(buildOverlayCardNode(spec), {
        width: spec.placement.width,
        height: spec.placement.height,
        fonts: ['Sans', 'Mono'],
    });
}

export function getOverlayCardDataUri(buffer: Buffer): string {
    return imageBufferToDataUri(buffer);
}
