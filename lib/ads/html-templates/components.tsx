// lib/ads/html-templates/components.tsx
//
// The 8 HTML ad template React components. Each renders at its native pixel
// dimensions with no scaling — the caller decides whether to scale for preview
// or screenshot at full size for production.

import type React from 'react';
import {
    coldSea, obsGlow, warmCore, glassGrid,
    imgOrGrad,
    getImageSlotControl,
    HTML_TEMPLATE_FALLBACKS as FB,
    type ResolvedTemplateData as D,
    type Imgs,
    type ImageSlotControl,
    type ImageSlotControls,
    type Palette,
} from './core';

type TemplateProps = { d: D; imgs: Imgs; slotControls?: ImageSlotControls };

function backgroundImageLayer(
    url: string | undefined,
    control: ImageSlotControl,
): React.CSSProperties | null {
    if (!url) return null;
    return {
        position: 'absolute',
        inset: 0,
        backgroundImage: `url(${url})`,
        backgroundSize: 'cover',
        backgroundPosition: control.position ?? 'center',
        backgroundRepeat: 'no-repeat',
        transform: control.flipX ? 'scaleX(-1)' : undefined,
    };
}

// =============================================================================
// T1 — Google Display Landscape  1200 × 628  [slot: image-bg]
// =============================================================================

export function T1GoogleLandscape({ d, imgs, slotControls }: TemplateProps) {
    const { p } = d;
    const ff = `${d.fonts[0] ?? 'Inter'}, sans-serif`;
    const facets = (['tile_image_1', 'tile_image_2'] as const).filter((s) => imgs[s]);
    return (
        <div style={{ width: 1200, height: 628, ...imgOrGrad(imgs['image-bg'], obsGlow(p), getImageSlotControl(slotControls, 'google_display_landscape', 'image-bg')), fontFamily: ff, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: glassGrid }} />

            {/* Right facet column — distinct supporting scenes beside the headline.
                Renders only when the pool has images; otherwise the hero bg shows
                through and the layout reverts to the original full-bleed treatment. */}
            {facets.length > 0 && (
                <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 432, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {facets.map((s) => (
                        <div key={s} style={{ flex: 1, backgroundImage: `url(${imgs[s]})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.12)' }} />
                        </div>
                    ))}
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 1, background: `${p.accent}66` }} />
                </div>
            )}

            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.3) 46%, transparent 64%)' }} />

            <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '44px 56px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 32, height: 2, background: p.accent }} />
                    <div style={{ color: p.accent, fontSize: 12, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase' }}>{FB.ship}</div>
                </div>
                <div>
                    <div style={{ color: p.textOnDark, fontSize: 84, fontWeight: 900, lineHeight: 0.93, textTransform: 'uppercase', letterSpacing: '-0.025em', maxWidth: 620, marginBottom: 20, whiteSpace: 'pre-line' }}>{d.headline}</div>
                    <div style={{ color: `${p.textOnDark}bb`, fontSize: 18, lineHeight: 1.55, maxWidth: 520, marginBottom: 30 }}>{d.subhead}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                        <div style={{ background: p.accent, color: '#fff', padding: '13px 30px', fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{d.waitlist}</div>
                        <div style={{ color: `${p.textOnDark}66`, fontSize: 13 }}>from <span style={{ color: p.accent, fontWeight: 700 }}>{FB.price}</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// T2 — Elegant Story  1080 × 1920  [slots: background-image, hero_image, tile_image_1–4]
// =============================================================================

export function T2ElegantStory({ d, imgs, slotControls }: TemplateProps) {
    const { p } = d;
    const ff = `${d.fonts[0] ?? 'Inter'}, sans-serif`;
    const backgroundControl = getImageSlotControl(slotControls, 'story_reel', 'background-image');
    const heroControl = getImageSlotControl(slotControls, 'story_reel', 'hero_image');
    const diamond = <div style={{ width: 6, height: 6, background: p.accent, transform: 'rotate(45deg)' }} />;
    const rule = (op: number) => (
        <div style={{ width: 56, height: 1, background: `${p.accent}${Math.round(op * 255).toString(16).padStart(2, '0')}` }} />
    );
    return (
        <div style={{ width: 1080, height: 1920, background: coldSea(p), fontFamily: ff, position: 'relative', overflow: 'hidden' }}>
            {imgs['background-image'] && <div style={backgroundImageLayer(imgs['background-image'], backgroundControl) ?? undefined} />}
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(6,21,32,0.72)' }} />
            <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 48%, ${p.accent}18 0%, transparent 55%)` }} />
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: `linear-gradient(90deg, transparent, ${p.accent}, transparent)` }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 5, background: `linear-gradient(90deg, transparent, ${p.accent}, transparent)` }} />

            {imgs['hero_image'] && (
                <div style={{ position: 'absolute', right: 60, top: '50%', transform: `translateY(-50%)${heroControl.flipX ? ' scaleX(-1)' : ''}`, width: 260, height: 380, backgroundImage: `url(${imgs['hero_image']})`, backgroundSize: 'cover', backgroundPosition: heroControl.position ?? 'center', opacity: 0.35 }} />
            )}

            <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '140px 90px', textAlign: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 64 }}>
                    <div style={{ width: 1, height: 72, background: `linear-gradient(${p.accent}00, ${p.accent})` }} />
                    <div style={{ color: p.accent, fontSize: 12, fontWeight: 700, letterSpacing: '0.32em', textTransform: 'uppercase' }}>A Community Voyage</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>{rule(0.6)}{diamond}{rule(0.6)}</div>
                </div>
                <div style={{ color: `${p.textOnDark}66`, fontSize: 12, fontWeight: 700, letterSpacing: '0.32em', textTransform: 'uppercase', marginBottom: 18 }}>{d.themeName}</div>
                <div style={{ color: p.textOnDark, fontSize: 98, fontWeight: 900, lineHeight: 0.95, letterSpacing: '-0.02em', textTransform: 'uppercase', marginBottom: 44, whiteSpace: 'pre-line' }}>{d.headline}</div>
                <div style={{ color: `${p.textOnDark}aa`, fontSize: 26, lineHeight: 1.65, maxWidth: 720, marginBottom: 72 }}>{d.elevatorPitch}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginBottom: 64, width: '100%' }}>
                    <div style={{ flex: 1, height: 1, background: `${p.accent}33` }} />
                    <div style={{ color: p.accent, fontSize: 18 }}>✦</div>
                    <div style={{ flex: 1, height: 1, background: `${p.accent}33` }} />
                </div>
                <div style={{ color: `${p.textOnDark}66`, fontSize: 18, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12 }}>{FB.ship}</div>
                <div style={{ color: p.accent, fontSize: 30, fontWeight: 700, marginBottom: 64 }}>From {FB.price}</div>
                <div style={{ border: `2px solid ${p.accent}`, padding: '20px 68px', color: p.accent, fontSize: 15, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase' }}>{d.waitlist}</div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginTop: 68 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>{rule(0.4)}{diamond}{rule(0.4)}</div>
                    <div style={{ color: `${p.textOnDark}44`, fontSize: 12, letterSpacing: '0.28em', textTransform: 'uppercase' }}>Group Forming Now</div>
                    <div style={{ width: 1, height: 60, background: `linear-gradient(${p.accent}, ${p.accent}00)` }} />
                </div>
                {(imgs['tile_image_1'] || imgs['tile_image_2'] || imgs['tile_image_3']) && (
                    <div style={{ position: 'absolute', bottom: 60, left: 60, right: 60, display: 'flex', gap: 8, height: 120 }}>
                        {(['tile_image_1', 'tile_image_2', 'tile_image_3', 'tile_image_4'] as const).map((s) =>
                            imgs[s] ? <div key={s} style={{ flex: 1, backgroundImage: `url(${imgs[s]})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.6 }} /> : null
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// =============================================================================
// T3 — Google Display Square  1080 × 1080  [slot: hero_image]
// =============================================================================

export function T3GoogleSquare({ d, imgs, slotControls }: TemplateProps) {
    const { p } = d;
    const ff = `${d.fonts[0] ?? 'Inter'}, sans-serif`;
    const tiles = (['tile_image_1', 'tile_image_2'] as const).filter((s) => imgs[s]);
    return (
        <div style={{ width: 1080, height: 1080, fontFamily: ff, display: 'flex', overflow: 'hidden' }}>
            <div style={{ width: 560, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3, background: p.background }}>
                {/* Dominant hero — fills the column when no facet tiles are available,
                    so a thin pool reverts to the original single-image editorial split. */}
                <div style={{ flex: tiles.length > 0 ? '0 0 612px' : 1, ...imgOrGrad(imgs['hero_image'], warmCore(p), getImageSlotControl(slotControls, 'google_display_square', 'hero_image')), position: 'relative' }}>
                    {imgs['hero_image'] && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)' }} />}
                    <div style={{ position: 'absolute', inset: 0, backgroundImage: glassGrid }} />
                    {!imgs['hero_image'] && [380, 260, 150].map((sz) => (
                        <div key={sz} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: sz, height: sz, border: `1px solid ${p.accent}${sz === 380 ? '33' : '22'}`, borderRadius: '50%' }} />
                    ))}
                    <div style={{ position: 'absolute', bottom: 32, left: 32, color: `${p.textOnDark}55`, fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase' }}>{d.aestheticLabel}</div>
                </div>
                {tiles.length > 0 && (
                    <div style={{ flex: 1, display: 'flex', gap: 3 }}>
                        {tiles.map((s) => (
                            <div key={s} style={{ flex: 1, backgroundImage: `url(${imgs[s]})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.18)' }} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div style={{ flex: 1, background: '#F8F5F0', padding: '60px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 30 }}>
                        <div style={{ width: 22, height: 2, background: p.accent }} />
                        <div style={{ color: p.accent, fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase' }}>{FB.ship}</div>
                    </div>
                    <div style={{ color: p.primary, fontSize: 70, fontWeight: 900, lineHeight: 0.93, textTransform: 'uppercase', letterSpacing: '-0.03em', whiteSpace: 'pre-line' }}>{d.headline}</div>
                </div>
                <div>
                    <div style={{ color: `${p.primary}88`, fontSize: 17, lineHeight: 1.65, marginBottom: 34 }}>{d.subhead}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                        <div style={{ background: p.primary, color: '#fff', padding: '13px 26px', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{d.cta}</div>
                        <div style={{ color: p.accent, fontSize: 14, fontWeight: 600 }}>{FB.price}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// T4 — Meta Carousel Card  1080 × 1080  [slot: hero_image]
// =============================================================================

export function T4MetaCarousel({ d, imgs, slotControls }: TemplateProps) {
    const { p } = d;
    const ff = `${d.fonts[0] ?? 'Inter'}, sans-serif`;
    const facets = (['tile_image_1', 'tile_image_2', 'tile_image_3'] as const).filter((s) => imgs[s]);
    return (
        <div style={{ width: 1080, height: 1080, ...imgOrGrad(imgs['hero_image'], obsGlow(p), getImageSlotControl(slotControls, 'meta_carousel_square', 'hero_image')), fontFamily: ff, position: 'relative', overflow: 'hidden' }}>
            {imgs['hero_image'] && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />}
            <div style={{ position: 'absolute', inset: 0, backgroundImage: glassGrid }} />

            {/* Facet strip — supporting scenes pinned top-right. The hero remains the
                dominant emotional anchor; these tiles carry the rest of the range.
                Renders only when the pool has images, so a thin pool keeps the
                original full-bleed hero look. */}
            {facets.length > 0 && (
                <div style={{ position: 'absolute', top: 56, right: 56, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {facets.map((s) => (
                        <div key={s} style={{ width: 150, height: 150, backgroundImage: `url(${imgs[s]})`, backgroundSize: 'cover', backgroundPosition: 'center', border: `1px solid ${p.accent}66`, boxShadow: '0 6px 22px rgba(0,0,0,0.5)' }} />
                    ))}
                </div>
            )}

            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 520, background: 'linear-gradient(transparent, rgba(0,0,0,0.78))' }} />
            <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '60px 64px' }}>
                <div style={{ color: p.accent, fontSize: 12, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', marginBottom: 16 }}>{d.aestheticLabel}</div>
                <div style={{ color: p.textOnDark, fontSize: 86, fontWeight: 900, lineHeight: 0.92, textTransform: 'uppercase', letterSpacing: '-0.025em', marginBottom: 18, whiteSpace: 'pre-line' }}>{d.headline}</div>
                <div style={{ color: `${p.textOnDark}cc`, fontSize: 22, fontStyle: 'italic', lineHeight: 1.5, marginBottom: 38, maxWidth: 680 }}>{d.subhead}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                    <div style={{ background: p.accent, color: '#fff', padding: '13px 32px', fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{d.cta}</div>
                    <div style={{ color: `${p.textOnDark}44`, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{FB.ship} · {FB.price}</div>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// T5 — Meta Story / Reel  1080 × 1920  [slots: hero_image, tile_image_1, tile_image_2]
// =============================================================================

export function T5MetaStory({ d, imgs, slotControls }: TemplateProps) {
    const { p } = d;
    const ff = `${d.fonts[0] ?? 'Inter'}, sans-serif`;
    return (
        <div style={{ width: 1080, height: 1920, ...imgOrGrad(imgs['hero_image'], coldSea(p), getImageSlotControl(slotControls, 'meta_story_reel', 'hero_image')), fontFamily: ff, position: 'relative', overflow: 'hidden' }}>
            {imgs['hero_image'] && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.42)' }} />}
            <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 55%, ${p.accent}22 0%, transparent 50%)` }} />
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 320, background: 'linear-gradient(rgba(0,0,0,0.55), transparent)' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 440, background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' }} />
            <div style={{ position: 'absolute', inset: 0, backgroundImage: glassGrid }} />

            {imgs['tile_image_1'] && (
                <div style={{ position: 'absolute', top: 160, left: 120, width: 200, height: 200, transform: 'rotate(45deg)', overflow: 'hidden', border: `2px solid ${p.accent}66` }}>
                    <div style={{ position: 'absolute', inset: -50, backgroundImage: `url(${imgs['tile_image_1']})`, backgroundSize: 'cover', backgroundPosition: 'center', transform: 'rotate(-45deg) scale(1.5)' }} />
                </div>
            )}
            {imgs['tile_image_2'] && (
                <div style={{ position: 'absolute', bottom: 220, right: 140, width: 180, height: 180, transform: 'rotate(45deg)', overflow: 'hidden', border: `2px solid ${p.accent}44` }}>
                    <div style={{ position: 'absolute', inset: -50, backgroundImage: `url(${imgs['tile_image_2']})`, backgroundSize: 'cover', backgroundPosition: 'center', transform: 'rotate(-45deg) scale(1.5)' }} />
                </div>
            )}
            {imgs['tile_image_3'] && (
                <div style={{ position: 'absolute', top: 250, right: 150, width: 148, height: 148, transform: 'rotate(45deg)', overflow: 'hidden', border: `2px solid ${p.accent}55` }}>
                    <div style={{ position: 'absolute', inset: -50, backgroundImage: `url(${imgs['tile_image_3']})`, backgroundSize: 'cover', backgroundPosition: 'center', transform: 'rotate(-45deg) scale(1.5)' }} />
                </div>
            )}

            {[640, 572].map((sz, i) => (
                <div key={sz} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -48%) rotate(45deg)', width: sz, height: sz, border: `${i === 0 ? 2 : 1}px solid ${p.accent}${i === 0 ? '55' : '33'}` }} />
            ))}

            <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', padding: '88px 64px', textAlign: 'center' }}>
                <div style={{ color: p.accent, fontSize: 13, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase' }}>A Community Voyage</div>
                <div style={{ color: p.textOnDark, fontSize: 106, fontWeight: 900, lineHeight: 0.92, textTransform: 'uppercase', letterSpacing: '-0.02em', whiteSpace: 'pre-line' }}>{d.headline}</div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
                    <div style={{ color: `${p.textOnDark}cc`, fontSize: 22, lineHeight: 1.55, maxWidth: 720 }}>{d.subhead}</div>
                    <div style={{ background: p.accent, color: '#fff', padding: '17px 50px', fontSize: 14, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{d.waitlist}</div>
                    <div style={{ color: `${p.textOnDark}44`, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{FB.ship}</div>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// T6 — Meta Feed Square Collage  1080 × 1080  [slots: hero_image, tile_image_1–6]
// =============================================================================

export function T6MetaFeedSquare({ d, imgs, slotControls }: TemplateProps) {
    const { p } = d;
    const ff = `${d.fonts[0] ?? 'Inter'}, sans-serif`;
    const gradPanels = [
        `linear-gradient(135deg, ${p.background} 0%, ${p.primary} 100%)`,
        `radial-gradient(ellipse at 30% 70%, ${p.accent}55, ${p.primary}cc)`,
        `linear-gradient(180deg, ${p.secondary} 0%, ${p.background}cc 100%)`,
        `linear-gradient(135deg, ${p.primary}cc 0%, ${p.secondary}88 100%)`,
    ];
    const panelSlots = ['tile_image_4', 'tile_image_5', 'tile_image_6', 'tile_image_1'];
    return (
        <div style={{ width: 1080, height: 1080, fontFamily: ff, position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', height: '100%', gap: 3 }}>
                {panelSlots.map((slot, i) => (
                    <div key={i} style={{ ...imgOrGrad(imgs[slot], gradPanels[i], getImageSlotControl(slotControls, 'meta_feed_square', slot)), position: 'relative' }}>
                        {!imgs[slot] && <div style={{ position: 'absolute', inset: 0, backgroundImage: glassGrid }} />}
                    </div>
                ))}
            </div>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.44)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 56px', textAlign: 'center' }}>
                <div style={{ color: p.accent, fontSize: 12, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', marginBottom: 18 }}>{d.aestheticLabel}</div>
                <div style={{ color: '#fff', fontSize: 66, fontWeight: 900, lineHeight: 0.95, textTransform: 'uppercase', letterSpacing: '-0.025em', marginBottom: 20, whiteSpace: 'pre-line' }}>{d.headline}</div>
                <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 19, lineHeight: 1.6, marginBottom: 32, maxWidth: 680 }}>{d.subhead}</div>
                <div style={{ background: p.accent, color: '#fff', padding: '13px 38px', fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{d.waitlist}</div>
            </div>
        </div>
    );
}

// =============================================================================
// T7 — Meta Feed Portrait  1080 × 1350  [slots: hero_image, tile_image_1–3]
// =============================================================================

export function T7MetaFeedPortrait({ d, imgs, slotControls }: TemplateProps) {
    const { p } = d;
    const ff = `${d.fonts[0] ?? 'Inter'}, sans-serif`;
    const gradPanels = [
        `linear-gradient(160deg, ${p.primary} 0%, ${p.secondary}99 100%)`,
        `radial-gradient(ellipse at 40% 60%, ${p.accent}44, ${p.background}ee)`,
        `linear-gradient(200deg, ${p.secondary} 0%, ${p.background}cc 100%)`,
    ];
    const panelSlots = ['tile_image_1', 'tile_image_2', 'tile_image_3'];
    return (
        <div style={{ width: 1080, height: 1350, fontFamily: ff, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ height: 780, display: 'flex', gap: 3, flexShrink: 0 }}>
                {panelSlots.map((slot, i) => (
                    <div key={i} style={{ flex: 1, ...imgOrGrad(imgs[slot], gradPanels[i], getImageSlotControl(slotControls, 'meta_feed_portrait', slot)), position: 'relative' }}>
                        {!imgs[slot] && <div style={{ position: 'absolute', inset: 0, backgroundImage: glassGrid }} />}
                    </div>
                ))}
            </div>
            <div style={{ flex: 1, background: p.background, padding: '44px 58px', borderTop: `3px solid ${p.accent}`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ color: p.accent, fontSize: 12, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', marginBottom: 14 }}>{FB.ship} · {FB.price}</div>
                <div style={{ color: p.textOnDark, fontSize: 54, fontWeight: 900, lineHeight: 0.93, textTransform: 'uppercase', letterSpacing: '-0.025em', marginBottom: 18, whiteSpace: 'pre-line' }}>{d.headline}</div>
                <div style={{ color: `${p.textOnDark}88`, fontSize: 17, lineHeight: 1.65, marginBottom: 28 }}>{d.subhead}</div>
                <div style={{ display: 'inline-block', background: p.accent, color: '#fff', padding: '12px 34px', fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{d.waitlist}</div>
            </div>
        </div>
    );
}

// =============================================================================
// T8 — IG Story Grid  1080 × 1920  [story_reel slots]
// =============================================================================

export function T8IGStoryGrid({ d, imgs, slotControls }: TemplateProps) {
    const { p } = d;
    const ff = `${d.fonts[0] ?? 'Inter'}, sans-serif`;
    const gridSlots = ['tile_image_1', 'hero_image', 'tile_image_2', 'tile_image_3', 'background-image', 'tile_image_4'];
    const gradPanels = [
        `linear-gradient(135deg, ${p.primary} 0%, ${p.secondary}99 100%)`,
        `linear-gradient(200deg, ${p.background} 0%, ${p.primary}aa 100%)`,
        `radial-gradient(ellipse at center, ${p.accent}44, ${p.background})`,
        `linear-gradient(135deg, ${p.secondary}99 0%, ${p.background} 100%)`,
        `linear-gradient(180deg, ${p.primary} 0%, ${p.secondary} 100%)`,
        `linear-gradient(135deg, ${p.background} 0%, ${p.primary}cc 100%)`,
    ];
    return (
        <div style={{ width: 1080, height: 1920, fontFamily: ff, position: 'relative', overflow: 'hidden', background: p.background }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', height: 1200, gap: 3 }}>
                {gridSlots.map((slot, i) => (
                    <div key={i} style={{ ...imgOrGrad(imgs[slot], gradPanels[i], getImageSlotControl(slotControls, 'ig_story_grid', slot)), position: 'relative' }}>
                        {!imgs[slot] && <div style={{ position: 'absolute', inset: 0, backgroundImage: glassGrid }} />}
                        {imgs[slot] && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.15)' }} />}
                    </div>
                ))}
            </div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 720, background: p.background, padding: '54px 68px', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: `2px solid ${p.accent}` }}>
                <div style={{ color: p.accent, fontSize: 12, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', marginBottom: 20 }}>{d.aestheticLabel}</div>
                <div style={{ color: p.textOnDark, fontSize: 88, fontWeight: 900, lineHeight: 0.92, textTransform: 'uppercase', letterSpacing: '-0.025em', marginBottom: 28, whiteSpace: 'pre-line' }}>{d.headline}</div>
                <div style={{ color: `${p.textOnDark}88`, fontSize: 21, lineHeight: 1.55, marginBottom: 40, maxWidth: 780 }}>{d.elevatorPitch}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
                    <div style={{ background: p.accent, color: '#fff', padding: '16px 46px', fontSize: 14, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{d.waitlist}</div>
                    <div style={{ color: `${p.textOnDark}44`, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{FB.ship}</div>
                </div>
            </div>
        </div>
    );
}

// ── Format → component map ────────────────────────────────────────────────────

export const FORMAT_COMPONENTS: Record<string, (props: TemplateProps) => React.ReactElement> = {
    google_display_landscape: T1GoogleLandscape,
    story_reel:               T2ElegantStory,
    google_display_square:    T3GoogleSquare,
    meta_carousel_square:     T4MetaCarousel,
    meta_story_reel:          T5MetaStory,
    meta_feed_square:         T6MetaFeedSquare,
    meta_feed_portrait:       T7MetaFeedPortrait,
    ig_story_grid:            T8IGStoryGrid,
};
