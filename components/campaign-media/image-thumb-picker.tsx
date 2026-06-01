'use client';

// A visual thumbnail grid for picking an image from the selectable pool. Unlike
// ImageSlotPicker (a name dropdown), this shows the actual images so an operator
// can scan and pick without round-tripping through a server-rendered preview.
// Reusable: hero (single-select) now; gallery/trust (add-to-set) later.

import type { HtmlTemplateAsset } from '@/lib/ads/html-templates/core';
import { Check, Sparkles } from 'lucide-react';

function thumbLabel(asset: HtmlTemplateAsset): string {
    const type = (asset.assetType ?? 'image').replace(/_/g, ' ');
    const id = asset.assetId?.slice(-10) ?? '';
    return `${type} · ${id}`;
}

export function ImageThumbPicker({
    assets,
    selectedId,
    selectedIds,
    onPick,
    onToggle,
    onAuto,
    autoActive,
    columns = 3,
    disabled = false,
}: {
    assets: HtmlTemplateAsset[];
    /** Single-select mode: the applied assetId (highlighted). */
    selectedId?: string;
    onPick?: (assetId: string) => void;
    /** Multi-select mode: set membership (all highlighted), click toggles. */
    selectedIds?: string[];
    onToggle?: (assetId: string) => void;
    /** If provided, renders an "Automatic" tile that clears the override. */
    onAuto?: () => void;
    /** True when no override is set (the Automatic tile is highlighted). */
    autoActive?: boolean;
    columns?: number;
    disabled?: boolean;
}) {
    const memberSet = selectedIds ? new Set(selectedIds) : null;
    const handle = (id: string) => (memberSet ? onToggle?.(id) : onPick?.(id));
    return (
        <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
            {onAuto && (
                <button
                    type="button"
                    onClick={onAuto}
                    disabled={disabled}
                    title="Automatic — let the system choose"
                    className={`flex aspect-square flex-col items-center justify-center gap-1 rounded border text-[10px] transition disabled:opacity-40 ${
                        autoActive
                            ? 'border-violet-400 bg-violet-500/15 text-violet-200 ring-2 ring-violet-400/60'
                            : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25 hover:text-slate-200'
                    }`}
                >
                    <Sparkles className="h-4 w-4" />
                    Auto
                </button>
            )}
            {assets.map((asset) => {
                const isSel = memberSet ? (asset.assetId ? memberSet.has(asset.assetId) : false) : asset.assetId === selectedId;
                return (
                    <button
                        key={asset.assetId}
                        type="button"
                        onClick={() => asset.assetId && handle(asset.assetId)}
                        disabled={disabled}
                        title={thumbLabel(asset)}
                        className={`relative aspect-square overflow-hidden rounded border transition disabled:opacity-40 ${
                            isSel ? 'border-violet-400 ring-2 ring-violet-400/60' : 'border-white/10 hover:border-white/30'
                        }`}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={asset.url} alt={thumbLabel(asset)} className="h-full w-full object-cover" loading="lazy" />
                        {isSel && (
                            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-white">
                                <Check className="h-2.5 w-2.5" />
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
