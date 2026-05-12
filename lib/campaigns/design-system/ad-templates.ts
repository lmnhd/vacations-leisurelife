import React from 'react';
import type { AssetRecord, CampaignAestheticBrief } from '../schema';
import type { DesignedAdArtifactKind, DesignedAdRenderSpec, NicheTokens, VisualSystem } from './types';
import { renderPngFromElement, type FontFamily } from './renderer/satori-renderer';
import {
    INK_SOFT, PAPER, PAPER_INK,
    h,
    baseStyle,
    eyebrow,
    text,
    renderImageModule,
    firstActive,
    type SourceImageRef,
} from './ad-templates-shared';
import { quoteCard, itineraryCard, typeHookCard, imageDetailAd } from './ad-templates-modular';
import { postcardHero, airMailSocial, boardingPass, baggageTag } from './ad-templates-nostalgia';
import { zineCover, scribbleSocial, stickerSheet } from './ad-templates-zine';

interface RenderInput {
    kind: DesignedAdArtifactKind;
    tokens: NicheTokens;
    sourceImage?: SourceImageRef;
    width: number;
    height: number;
}

// ─── System 1 distinctive templates ──────────────────────────────────────────

function editorialCover(input: RenderInput): React.ReactElement {
    const { tokens, sourceImage, width, height } = input;
    const accent = tokens.accentHex;
    return h('div', { style: baseStyle(width, height, PAPER) },
        h('div', { style: { display: 'flex', color: PAPER_INK, justifyContent: 'space-between', fontSize: 18, marginBottom: 20 } },
            h('span', {}, tokens.issueLabel),
            h('span', {}, tokens.route),
            h('span', {}, tokens.departure),
        ),
        h('div', { style: { display: 'flex', color: PAPER_INK, fontSize: Math.round(width * 0.105), fontWeight: 900, lineHeight: 0.9, marginBottom: 18 } }, `${tokens.italicWord} Quarterly`),
        renderImageModule(sourceImage, { width: '100%', height: Math.round(height * 0.42), borderRadius: 0, marginBottom: 24 }),
        text(tokens.sectionLabels[0] ?? 'Feature', { color: accent, fontSize: 22, marginBottom: 12 }),
        text(tokens.headline, { color: PAPER_INK, fontSize: Math.round(width * 0.075), lineHeight: 0.95, fontWeight: 800, marginBottom: 18 }),
        text(tokens.subhead, { color: PAPER_INK, fontSize: 26, lineHeight: 1.25, maxWidth: '92%' }),
        h('div', { style: { display: 'flex', marginTop: 'auto', color: PAPER_INK, justifyContent: 'space-between', fontSize: 18 } },
            h('span', {}, tokens.vesselName),
            h('span', {}, tokens.cta),
        ),
    );
}

function contributorCard(input: RenderInput): React.ReactElement {
    const { tokens, sourceImage, width, height } = input;
    return h('div', { style: baseStyle(width, height) },
        renderImageModule(sourceImage, { width: '100%', height: Math.round(height * 0.52), borderRadius: 0, marginBottom: 24 }),
        eyebrow('Contributor · Campaign Host', tokens.accentHex),
        h('div', { style: { display: 'flex', fontSize: 48, lineHeight: 1, fontWeight: 850, marginTop: 18, marginBottom: 14 } }, tokens.quoteCite),
        text(`${tokens.sectionLabels[0] ?? 'Campaign'} voice for ${tokens.vesselName}. ${tokens.quote}`, { color: INK_SOFT, fontSize: 25, lineHeight: 1.25 }),
    );
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

function renderElement(input: RenderInput): React.ReactElement {
    const sub = { tokens: input.tokens, sourceImage: input.sourceImage, width: input.width, height: input.height };
    switch (input.kind) {
        case 'editorial_cover_ad': return editorialCover(input);
        case 'quote_card': return quoteCard(sub);
        case 'itinerary_toc_card': return itineraryCard(sub);
        case 'contributor_card': return contributorCard(input);
        case 'type_hook_card': return typeHookCard(sub);
        case 'image_detail_ad': return imageDetailAd(sub);
        case 'postcard_hero': return postcardHero(sub);
        case 'air_mail_social': return airMailSocial(sub);
        case 'boarding_pass': return boardingPass(sub);
        case 'baggage_tag': return baggageTag(sub);
        case 'zine_cover': return zineCover(sub);
        case 'scribble_social': return scribbleSocial(sub);
        case 'sticker_sheet': return stickerSheet(sub);
    }
}

function fontsForSystem(system: VisualSystem): FontFamily[] {
    switch (system) {
        case 'system_1_editorial': return ['Sans', 'Serif', 'Mono'];
        case 'system_2_nostalgia': return ['Sans', 'Serif', 'Hand', 'Mono'];
        case 'system_3_zine': return ['Sans', 'Marker', 'Hand'];
        case 'system_4_modular': return ['Sans', 'Serif', 'Mono'];
    }
}

function defaultSpecsForSystem(
    system: VisualSystem,
    brief: CampaignAestheticBrief | undefined,
    sourceImages: readonly AssetRecord[],
    trustImages: readonly AssetRecord[] = [],
): DesignedAdRenderSpec[] {
    const narrativePrimary = firstActive(sourceImages) ?? firstActive(trustImages);
    const narrativeSecondary = sourceImages.find((record) => record.assetId !== narrativePrimary?.assetId)
        ?? firstActive(trustImages)
        ?? narrativePrimary;
    const narrativeTertiary = sourceImages.find((record) =>
        record.assetId !== narrativePrimary?.assetId && record.assetId !== narrativeSecondary?.assetId,
    ) ?? narrativeSecondary ?? narrativePrimary;
    const trustPrimary = firstActive(trustImages) ?? narrativePrimary;
    const humanBearingPrimary = sourceImages.find((record) =>
        record.active
        && !!record.url
        && ['human_glimpse', 'motion_plate', 'trust_photo'].some((kind) =>
            record.tags.some((tag) => tag.toLowerCase() === kind),
        ),
    ) ?? narrativeSecondary ?? narrativePrimary;
    const denseHumanPrimary =
        sourceImages.find((record) =>
            record.active
            && !!record.url
            && record.tags.some((tag) => tag.toLowerCase() === 'motion_plate'),
        )
        ?? sourceImages.find((record) =>
            record.active
            && !!record.url
            && record.tags.some((tag) => tag.toLowerCase() === 'trust_photo'),
        )
        ?? sourceImages.find((record) =>
            record.active
            && !!record.url
            && record.tags.some((tag) => tag.toLowerCase() === 'human_glimpse'),
        )
        ?? humanBearingPrimary;
    const minimumVisiblePeople = brief?.visual.humanRepresentation.minimumVisiblePeople ?? 3;
    const displayPrimary = minimumVisiblePeople >= 3 ? denseHumanPrimary : humanBearingPrimary;

    switch (system) {
        case 'system_1_editorial':
            return [
                { kind: 'editorial_cover_ad', assetId: 'ad_editorial_cover_4x5', fileName: 'ads/editorial_cover_4x5.png', width: 1080, height: 1350, tags: ['designed_ad', 'editorial_cover', 'instagram_feed'], sourceImage: narrativePrimary },
                { kind: 'quote_card', assetId: 'ad_quote_card_1x1', fileName: 'ads/quote_card_1x1.png', width: 1080, height: 1080, tags: ['designed_ad', 'quote', 'instagram_square'] },
                { kind: 'itinerary_toc_card', assetId: 'ad_itinerary_toc_4x5', fileName: 'ads/itinerary_toc_4x5.png', width: 1080, height: 1350, tags: ['designed_ad', 'itinerary', 'carousel'] },
                { kind: 'contributor_card', assetId: 'ad_contributor_card_1x1', fileName: 'ads/contributor_card_1x1.png', width: 1080, height: 1080, tags: ['designed_ad', 'contributor', 'social'], sourceImage: narrativeTertiary },
                { kind: 'type_hook_card', assetId: 'ad_type_hook_9x16', fileName: 'ads/type_hook_9x16.png', width: 1080, height: 1920, tags: ['designed_ad', 'type_hook', 'story', 'tiktok'] },
                { kind: 'image_detail_ad', assetId: 'ad_image_detail_191x100', fileName: 'ads/image_detail_191x100.png', width: 1200, height: 628, tags: ['designed_ad', 'image_detail', 'facebook', 'google_display'], sourceImage: displayPrimary ?? trustPrimary ?? narrativeSecondary },
            ];
        case 'system_2_nostalgia':
            return [
                { kind: 'postcard_hero', assetId: 'ad_postcard_hero_5x3', fileName: 'ads/postcard_hero_5x3.png', width: 1080, height: 648, tags: ['designed_ad', 'postcard_hero', 'instagram_feed'], sourceImage: narrativeSecondary ?? narrativePrimary },
                { kind: 'quote_card', assetId: 'ad_quote_card_1x1', fileName: 'ads/quote_card_1x1.png', width: 1080, height: 1080, tags: ['designed_ad', 'quote', 'instagram_square'] },
                { kind: 'air_mail_social', assetId: 'ad_air_mail_1x1', fileName: 'ads/air_mail_1x1.png', width: 1080, height: 1080, tags: ['designed_ad', 'air_mail', 'instagram_square'] },
                { kind: 'boarding_pass', assetId: 'ad_boarding_pass_portrait', fileName: 'ads/boarding_pass_portrait.png', width: 1080, height: 1350, tags: ['designed_ad', 'boarding_pass', 'carousel'] },
                { kind: 'baggage_tag', assetId: 'ad_baggage_tag_2x3', fileName: 'ads/baggage_tag_2x3.png', width: 720, height: 1080, tags: ['designed_ad', 'baggage_tag', 'social'] },
                { kind: 'image_detail_ad', assetId: 'ad_image_detail_191x100', fileName: 'ads/image_detail_191x100.png', width: 1200, height: 628, tags: ['designed_ad', 'image_detail', 'facebook', 'google_display'], sourceImage: displayPrimary ?? trustPrimary ?? narrativeSecondary },
            ];
        case 'system_3_zine':
            return [
                { kind: 'zine_cover', assetId: 'ad_zine_cover_3x4', fileName: 'ads/zine_cover_3x4.png', width: 1080, height: 1440, tags: ['designed_ad', 'zine_cover', 'instagram_feed'], sourceImage: narrativePrimary },
                { kind: 'scribble_social', assetId: 'ad_scribble_social_1x1', fileName: 'ads/scribble_social_1x1.png', width: 1080, height: 1080, tags: ['designed_ad', 'scribble', 'instagram_square'], sourceImage: narrativeSecondary ?? narrativePrimary },
                { kind: 'sticker_sheet', assetId: 'ad_sticker_sheet', fileName: 'ads/sticker_sheet.png', width: 1080, height: 1080, tags: ['designed_ad', 'sticker_sheet', 'instagram_square'] },
                { kind: 'quote_card', assetId: 'ad_quote_card_1x1', fileName: 'ads/quote_card_1x1.png', width: 1080, height: 1080, tags: ['designed_ad', 'quote', 'instagram_square'] },
                { kind: 'type_hook_card', assetId: 'ad_type_hook_9x16', fileName: 'ads/type_hook_9x16.png', width: 1080, height: 1920, tags: ['designed_ad', 'type_hook', 'story', 'tiktok'] },
                { kind: 'image_detail_ad', assetId: 'ad_image_detail_191x100', fileName: 'ads/image_detail_191x100.png', width: 1200, height: 628, tags: ['designed_ad', 'image_detail', 'facebook', 'google_display'], sourceImage: displayPrimary ?? trustPrimary ?? narrativeSecondary },
            ];
        case 'system_4_modular':
            return [
                { kind: 'type_hook_card', assetId: 'ad_type_hook_9x16', fileName: 'ads/type_hook_9x16.png', width: 1080, height: 1920, tags: ['designed_ad', 'type_hook', 'story', 'tiktok'] },
                { kind: 'quote_card', assetId: 'ad_quote_card_1x1', fileName: 'ads/quote_card_1x1.png', width: 1080, height: 1080, tags: ['designed_ad', 'quote', 'instagram_square'] },
                { kind: 'itinerary_toc_card', assetId: 'ad_itinerary_toc_4x5', fileName: 'ads/itinerary_toc_4x5.png', width: 1080, height: 1350, tags: ['designed_ad', 'itinerary', 'carousel', 'instagram_feed'] },
                { kind: 'image_detail_ad', assetId: 'ad_image_detail_191x100', fileName: 'ads/image_detail_191x100.png', width: 1200, height: 628, tags: ['designed_ad', 'image_detail', 'facebook', 'google_display'], sourceImage: displayPrimary ?? trustPrimary ?? narrativePrimary },
            ];
    }
}

export function buildDesignedAdRenderSpecs(
    tokens: NicheTokens,
    adFormatBias: string[],
    sourceImages: readonly AssetRecord[],
    trustImages: readonly AssetRecord[] = [],
    brief?: CampaignAestheticBrief,
): DesignedAdRenderSpec[] {
    const all = defaultSpecsForSystem(tokens.system, brief, sourceImages, trustImages);
    if (!adFormatBias || adFormatBias.length === 0) return all;

    const loweredBias = adFormatBias.map((b) => b.toLowerCase().replace(/_/g, ''));
    const scored = all.map((spec) => {
        const specKind = spec.kind.toLowerCase().replace(/_/g, '');
        const specTags = spec.tags.map((t) => t.toLowerCase().replace(/_/g, ''));
        const kindScore = loweredBias.some((b) => specKind.includes(b)) ? 2 : 0;
        const tagScore = loweredBias.some((b) => specTags.some((t) => t.includes(b))) ? 1 : 0;
        return { spec, score: kindScore + tagScore };
    });

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
