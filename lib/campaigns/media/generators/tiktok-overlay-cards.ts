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
                borderRadius: 18,
                padding: 34,
                backgroundColor: 'rgba(10, 14, 22, 0.66)',
                border: '1px solid rgba(242, 196, 80, 0.45)',
                boxShadow: '0 16px 38px rgba(0, 0, 0, 0.28)',
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
                    fontFamily: 'Mono',
                    fontSize: 18,
                    lineHeight: 1,
                    letterSpacing: 0,
                    color: accent,
                    marginBottom: 14,
                    textTransform: 'uppercase',
                },
            },
            shorten(spec.badge, 18)
        ),
        React.createElement(
            'div',
            {
                style: {
                    fontFamily: 'Sans',
                    fontSize: 62,
                    lineHeight: 1.0,
                    fontWeight: 900,
                    letterSpacing: 0,
                    marginBottom: 16,
                    maxWidth: width - 72,
                },
            },
            shorten(spec.headline, 46)
        ),
        React.createElement(
            'div',
            {
                style: {
                    fontFamily: 'Sans',
                    fontSize: 29,
                    lineHeight: 1.14,
                    letterSpacing: 0,
                    color: 'rgba(246, 241, 229, 0.94)',
                    maxWidth: width - 72,
                },
            },
            shorten(spec.subline, 72)
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
