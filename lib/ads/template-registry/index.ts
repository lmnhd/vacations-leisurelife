// lib/ads/template-registry/index.ts
//
// Hand-maintained mapping from (workflow, visualFlavor, format) to a
// Templated.io template id + slot descriptor list. Updated manually each
// time a new Canva design is imported into Templated.io.

import templatesJson from './templates.json';
import type {
    AdFormat,
    AdWorkflow,
    SlotDescriptor,
    TemplateLayout,
    TemplateRef,
} from '../types';
import type { VisualFlavor } from '@/lib/campaigns/schema';

type RawSlot = {
    name: string;
    type: 'text' | 'image' | 'color';
    visualOrder: number;
    zone: string;
    maxChars?: number;
    maxWords?: number;
    maxLines?: number;
    copyRole?: string;
    copyInstruction?: string;
    disallow?: string[];
    preferredAssetTypes?: SlotDescriptor['preferredAssetTypes'];
};

type RawTemplateEntry = {
    templated_id: string;
    templated_id_previous: string | null;
    dimensions: { width: number; height: number };
    layout: {
        description: string;
        slotDescriptors: RawSlot[];
    };
    pages?: number;
};

type RawRegistry = Record<string, Record<string, Partial<Record<AdFormat, RawTemplateEntry>>>>;

const RAW_REGISTRY = templatesJson as RawRegistry;

function toSlotDescriptor(raw: RawSlot): SlotDescriptor {
    return {
        name: raw.name,
        type: raw.type,
        visualOrder: raw.visualOrder,
        zone: raw.zone as SlotDescriptor['zone'],
        ...(raw.maxChars !== undefined ? { maxChars: raw.maxChars } : {}),
        ...(raw.maxWords !== undefined ? { maxWords: raw.maxWords } : {}),
        ...(raw.maxLines !== undefined ? { maxLines: raw.maxLines } : {}),
        ...(raw.copyRole !== undefined ? { copyRole: raw.copyRole } : {}),
        ...(raw.copyInstruction !== undefined ? { copyInstruction: raw.copyInstruction } : {}),
        ...(raw.disallow !== undefined ? { disallow: raw.disallow } : {}),
        ...(raw.preferredAssetTypes !== undefined ? { preferredAssetTypes: raw.preferredAssetTypes } : {}),
    };
}

function toTemplateRef(raw: RawTemplateEntry): TemplateRef {
    return {
        templatedId: raw.templated_id,
        templatedIdPrevious: raw.templated_id_previous,
        dimensions: raw.dimensions,
        layout: {
            description: raw.layout.description,
            slotDescriptors: raw.layout.slotDescriptors.map(toSlotDescriptor),
        },
        ...(raw.pages !== undefined ? { pages: raw.pages } : {}),
    };
}

/**
 * Look up a template by (workflow, visualFlavor, format).
 * Returns null when no template is registered — callers decide whether that
 * is a hard failure or a "format not yet supported in this flavor" skip.
 */
export function lookupTemplate(
    workflow: AdWorkflow,
    visualFlavor: VisualFlavor,
    format: AdFormat,
): TemplateRef | null {
    const flavorMap = RAW_REGISTRY[workflow]?.[visualFlavor];
    if (!flavorMap) return null;
    const raw = flavorMap[format];
    if (!raw) return null;
    return toTemplateRef(raw);
}

/**
 * Return the layout descriptor for each registered format in (workflow, visualFlavor).
 * Used by Copy Forge to inject template anatomy into the prompt.
 */
export function listTemplateLayouts(
    workflow: AdWorkflow,
    visualFlavor: VisualFlavor,
): Partial<Record<AdFormat, TemplateLayout>> {
    const flavorMap = RAW_REGISTRY[workflow]?.[visualFlavor];
    if (!flavorMap) return {};
    const out: Partial<Record<AdFormat, TemplateLayout>> = {};
    for (const [format, raw] of Object.entries(flavorMap)) {
        if (!raw) continue;
        out[format as AdFormat] = toTemplateRef(raw).layout;
    }
    return out;
}

/**
 * List every (workflow, visualFlavor, format) tuple currently registered.
 * Used by the /tests/canva-ads page to populate dropdowns and by the
 * startup validator to know what to diff against Templated.io.
 */
export interface RegistryEntrySummary {
    workflow: AdWorkflow;
    visualFlavor: VisualFlavor;
    format: AdFormat;
    templatedId: string;
    dimensions: { width: number; height: number };
    slotNames: string[];
}

export function listRegistryEntries(): RegistryEntrySummary[] {
    const entries: RegistryEntrySummary[] = [];
    for (const [workflow, flavorMap] of Object.entries(RAW_REGISTRY)) {
        for (const [flavor, formatMap] of Object.entries(flavorMap ?? {})) {
            for (const [format, raw] of Object.entries(formatMap ?? {})) {
                if (!raw) continue;
                entries.push({
                    workflow: workflow as AdWorkflow,
                    visualFlavor: flavor as VisualFlavor,
                    format: format as AdFormat,
                    templatedId: raw.templated_id,
                    dimensions: raw.dimensions,
                    slotNames: raw.layout.slotDescriptors.map((s) => s.name),
                });
            }
        }
    }
    return entries;
}
