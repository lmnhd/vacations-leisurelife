import React from 'react';
import type { NicheTokens } from './types';
import {
    PAPER_INK,
    CREAM,
    MANILA,
    h,
    baseStyle,
    renderImageModule,
    campaignBadgeText,
    type SourceImageRef,
} from './ad-templates-shared';

interface RenderInput {
    tokens: NicheTokens;
    sourceImage?: SourceImageRef;
    width: number;
    height: number;
}

// ─── System 2: Travel Nostalgia ──────────────────────────────────────────────

export function postcardHero(input: RenderInput): React.ReactElement {
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
                h('div', { style: { display: 'flex', background: tokens.accentHex, color: '#fff', fontSize: 12, fontFamily: 'Mono', padding: '4px 10px', borderRadius: 2 } }, `${tokens.vesselName} · ${nicheShort}`),
            ),
            h('div', { style: { display: 'flex', border: '1px dashed #999', borderRadius: '50%', width: 80, height: 80, alignItems: 'center', justifyContent: 'center', fontSize: 11, fontFamily: 'Mono', color: PAPER_INK, marginBottom: 14 } }, `${tokens.route}\n${tokens.departure}`),
            h('div', { style: { display: 'flex', fontFamily: 'Hand', fontSize: 22, color: PAPER_INK, lineHeight: 1.4 } }, `Wish you were here. ${tokens.headline}`),
        ),
    );
}

export function airMailSocial(input: RenderInput): React.ReactElement {
    const { tokens, width, height } = input;
    return h('div', { style: { ...baseStyle(width, height, CREAM, 'Hand'), padding: Math.round(width * 0.08), border: '12px solid transparent', borderImage: 'repeating-linear-gradient(45deg, #c0392b 0, #c0392b 10px, #fff 10px, #fff 20px, #2980b9 20px, #2980b9 30px, #fff 30px, #fff 40px) 12' } },
        h('div', { style: { display: 'flex', fontFamily: 'Hand', fontSize: Math.round(width * 0.08), color: PAPER_INK, lineHeight: 1.1, marginBottom: 24 } }, tokens.headline),
        h('div', { style: { display: 'flex', fontFamily: 'Hand', fontSize: 22, color: PAPER_INK, lineHeight: 1.4, marginBottom: 24 } }, `Sailing ${tokens.departure} to ${tokens.route}. ${tokens.cta}`),
        h('div', { style: { display: 'flex', fontFamily: 'Mono', fontSize: 14, color: '#888', marginTop: 'auto' } }, `${tokens.vesselName} · ${tokens.route} · ${tokens.departure}`),
    );
}

export function boardingPass(input: RenderInput): React.ReactElement {
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
                h('span', { style: { fontSize: 14, fontFamily: 'Serif', fontStyle: 'italic', whiteSpace: 'pre-line', lineHeight: 1.05, maxWidth: '100%' } }, campaignBadgeText(tokens)),
            ),
            h('div', { style: { display: 'flex', border: '2px dashed #555', padding: '4px 8px', fontFamily: 'Mono', fontSize: 14 } }, '||| || ||| ||'),
        ),
    );
}

export function baggageTag(input: RenderInput): React.ReactElement {
    const { tokens, width, height } = input;
    return h('div', { style: { ...baseStyle(width, height, MANILA, 'Sans'), color: PAPER_INK, alignItems: 'center', justifyContent: 'center' } },
        h('div', { style: { display: 'flex', borderRadius: 8, border: '2px solid #bfa87a', width: '78%', height: '82%', flexDirection: 'column', padding: Math.round(width * 0.06) } },
            h('div', { style: { display: 'flex', justifyContent: 'center', marginBottom: 16 } },
                h('div', { style: { width: 28, height: 28, borderRadius: '50%', border: '3px solid #8b7355' } }),
            ),
            h('div', { style: { display: 'flex', fontFamily: 'Serif', fontStyle: 'italic', fontSize: Math.round(width * 0.045), fontWeight: 700, textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.05, marginBottom: 18, maxWidth: '100%' } }, campaignBadgeText(tokens)),
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
