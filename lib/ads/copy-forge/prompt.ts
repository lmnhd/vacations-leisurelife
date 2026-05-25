// lib/ads/copy-forge/prompt.ts
//
// Deterministic prompt assembler. All template anatomy, format selection,
// available-image counts, and constraints are resolved here BEFORE the
// LLM is called. The model sees a fully-baked JSON instruction set.

import type {
    AdFormat,
    CopyForgeInput,
    SlotDescriptor,
    TemplateLayout,
} from '../types';

const SYSTEM_PROMPT = `You are an Art Director designing complete ad compositions for a small cruise-themed group-travel brand.

Your job is NOT to write isolated copy and isolated image hints. Your job is to design unified compositions where copy and imagery work as one story.

You MUST follow this exact 5-step reasoning sequence before producing any slot values:

  1. Read the campaign brief + dossier. Identify the 3 MOST specific, sensory, niche-true details about this campaign world. These are the raw material.

  2. Write compositionIntent — one paragraph describing the single emotional experience this ad delivers. Concrete, sensory, niche-true. NOT a description of the campaign theme.

  3. Assign imageSlotDirectives for every image slot in each format. Each slot gets a UNIQUE narrative role and a specific mood cue. The slots together must form a coherent visual arc — establish, build, resolve.

  4. Only AFTER the imagery arc is fixed, write the headline. The headline must complete or create tension with the collective mood of the imagery. A headline that could run on any cruise ad is wrong. A headline that only makes sense with this specific image arrangement is right.

  5. Validate the whole. If removing any element would not weaken the ad, revise before outputting.

Hard rules:
- Template slot budgets override global limits. Treat every text slot's maxChars, maxWords, maxLines, copyRole, copyInstruction, and disallow values as hard requirements.
- Sell the niche theme, not the cruise inventory. The campaign name, allowed theme signals, prop families, dossier signals, and emotional promise are primary. Ship, route, ports, cruise line, and sail date are venue context only unless a template slot explicitly asks for logistics.
- Visible copy must explicitly portray the niche. Use plain campaign-provided niche language; for a health/wellness campaign that may include wellness, reset, yoga, meditation, breath, stretch, nature, mindful, restorative, or equivalent signals. Mood-only travel phrases are not enough.
- Never use the ship name, cruise line, route, port names, or sail date in headline, subhead, or microcopy when that slot disallows logistics.
- Headline: no trailing period, must use a concrete sensory or temporal anchor from the campaign's nicheSignals/propFamilies/cruiseNativeMoments.
- Headline: must not contain any term from avoidDirectives.
- CTA: max 20 chars, imperative voice.
- subhead: use the template slot budget; if no subhead slot exists, return an empty string.
- microcopy: use the template slot budget; if no microcopy slot exists, return an empty string.
- Each imageSlotDirective.narrativeRole MUST be unique within a SlotPack.
- Image slot directives must create a diversified image set. Use each slot's preferredAssetTypes and copyInstruction; avoid assigning every slot to the same subject, scene type, or assetType.
- Each imageSlotDirective.assetType MUST be present in availableImages (count > 0).
- Output strict JSON matching the supplied schema. No prose, no markdown.`;

function formatsForPrompt(
    layouts: Partial<Record<AdFormat, TemplateLayout>>,
    requested: AdFormat[],
): Array<{
    format: AdFormat;
    layout_description: string;
    slots: SlotDescriptor[];
    isCarousel: boolean;
}> {
    const out: Array<{
        format: AdFormat;
        layout_description: string;
        slots: SlotDescriptor[];
        isCarousel: boolean;
    }> = [];
    for (const format of requested) {
        const layout = layouts[format];
        if (!layout) continue;
        out.push({
            format,
            layout_description: layout.description,
            slots: layout.slotDescriptors,
            isCarousel: format === 'carousel' || format === 'meta_carousel_square',
        });
    }
    return out;
}

export interface AssembledPrompt {
    system: string;
    user: string;
}

export function assembleCopyForgePrompt(input: CopyForgeInput): AssembledPrompt {
    const formats = formatsForPrompt(input.templateLayouts, input.formats);

    const payload = {
        task: 'Design a complete ad composition for each requested format. Think holistically — copy and imagery together as one unified story. Follow the 5-step reasoning sequence exactly.',
        reasoning_sequence: [
            '1. Identify 3 specific, sensory, niche-true details from the campaign world',
            '2. Write compositionIntent — the single emotional experience this ad delivers',
            '3. Assign imageSlotDirectives — one narrative role + mood cue per named slot, forming a visual arc',
            '4. Write headline that responds to and completes the imagery arc',
            '5. Validate: does every element earn its place? Does removing any one element weaken the whole?',
        ],
        campaign: {
            name: input.campaign.name,
            primaryThemeToSell: input.campaign.name,
            vessel: input.campaign.vessel,
            route: input.campaign.route,
            departure: input.campaign.departure,
            theme: input.campaign.theme,
            heroSlogan: input.brief.heroSlogan,
            subSlogan: input.brief.subSlogan,
            elevatorPitch: input.brief.elevatorPitch,
            avoidDirectives: input.brief.avoidDirectives,
            propFamilies: input.brief.propFamilies,
            nicheSignals: input.brief.nicheSignals,
            cruiseNativeMoments: input.brief.cruiseNativeMoments,
            emotionalPromise: input.brief.emotionalPromise,
            energyMode: input.brief.energyMode,
            toneKeywords: input.brief.toneKeywords,
        },
        dossier: input.dossier
            ? {
                audienceRoutineInsights: input.dossier.audienceRoutineInsights,
                specificExamples: input.dossier.specificExamples,
                allowedSignals: input.dossier.allowedSignals,
                discouragedSignals: input.dossier.discouragedSignals,
            }
            : null,
        visual_flavor: input.visualFlavor,
        formats,
        available_images: input.availableImages,
        constraints: {
            niche_theme_is_primary_sales_message: true,
            visible_copy_must_name_or_clearly_signal_the_niche: true,
            logistics_are_supporting_context_only: true,
            template_slot_budgets_are_hard: true,
            text_must_fit_visible_template_slots: true,
            headline_no_period: true,
            headline_must_use_niche_anchor: true,
            headline_must_respond_to_imagery: true,
            cta_max_chars: 20,
            cta_must_be_imperative: true,
            image_slot_roles_must_be_unique_within_pack: true,
            image_slots_must_diversify_asset_type_and_visual_scale: true,
            image_slot_asset_type_must_be_available: true,
        },
        text_slot_guidance: formats.map((format) => ({
            format: format.format,
            textSlots: format.slots
                .filter((slot) => slot.type === 'text')
                .map((slot) => ({
                    name: slot.name,
                    maxChars: slot.maxChars,
                    maxWords: slot.maxWords,
                    maxLines: slot.maxLines,
                    copyRole: slot.copyRole,
                    copyInstruction: slot.copyInstruction,
                    disallow: slot.disallow ?? [],
                })),
        })),
        image_slot_guidance: formats.map((format) => ({
            format: format.format,
            imageSlots: format.slots
                .filter((slot) => slot.type === 'image')
                .map((slot) => ({
                    name: slot.name,
                    visualOrder: slot.visualOrder,
                    zone: slot.zone,
                    visualRole: slot.copyRole,
                    visualInstruction: slot.copyInstruction,
                    preferredAssetTypes: slot.preferredAssetTypes ?? [],
                })),
        })),
        output_shape_hint: {
            creativeTerritory: 'short internal name for this ad family world',
            compositionIntent: 'one paragraph, written FIRST, drives everything else',
            formats: {
                '<format>': {
                    compositionNote: 'how copy + imagery fuse in this specific format',
                    headline: 'must obey this format template slot budget exactly',
                    subhead: 'must obey this format template slot budget exactly; empty string only when the template has no subhead slot',
                    microcopy: 'must obey this format template slot budget exactly; empty string only when the template has no microcopy slot',
                    cta: 'imperative <=20',
                    imageSlotDirectives: {
                        '<slot_name>': {
                            assetType: 'one of: scene_image | ship_reference | hero | aesthetic_concept | still | merch',
                            narrativeRole: 'specific job this slot does in the overall story',
                            moodCue: 'lighting / energy / feeling',
                            preferTags: 'string[] of additional manifest tags; use [] when none',
                        },
                    },
                },
                'carousel or meta_carousel_square (if requested)': 'an ARRAY of slot packs — one per page, reading as a visual sequence',
            },
        },
    };

    return {
        system: SYSTEM_PROMPT,
        user: JSON.stringify(payload, null, 2),
    };
}
