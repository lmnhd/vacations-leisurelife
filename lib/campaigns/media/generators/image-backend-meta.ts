// lib/campaigns/media/generators/image-backend-meta.ts
//
// PURE metadata for the image backends — id + display label only, no server
// imports. Safe to import in client components (the flyer-controls editor's
// model picker) AND in the server registry (image-backends.ts), so the list of
// models has a single source of truth. Keep this in sync with IMAGE_BACKENDS.

import type { GeneratorService } from '@/lib/campaigns/schema';

export interface ImageBackendMeta { id: GeneratorService; label: string; }

// Order = priority. First entry is the primary/canonical backend.
export const IMAGE_BACKEND_META: readonly ImageBackendMeta[] = [
    { id: 'gemini3_flash', label: 'Gemini 3 Flash' },
    { id: 'gpt_image_2', label: 'GPT Image 2' },
];

export const PRIMARY_IMAGE_BACKEND_ID: GeneratorService = IMAGE_BACKEND_META[0].id;

export function imageBackendLabel(id: string): string {
    return IMAGE_BACKEND_META.find((b) => b.id === id)?.label ?? id;
}
