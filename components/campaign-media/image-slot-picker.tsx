'use client';

import type { HtmlTemplateAsset, ImageSlotControl } from '@/lib/ads/html-templates/core';

interface ImageSlotPickerProps {
    label: string;
    usePointKey: string;
    value?: string;
    assets: HtmlTemplateAsset[];
    autoUrl?: string;
    control?: ImageSlotControl;
    onChange: (usePointKey: string, assetId: string | null) => void;
    onControlChange?: (usePointKey: string, control: ImageSlotControl) => void;
}

function labelForAsset(asset: HtmlTemplateAsset): string {
    if (asset.assetType === 'ship_reference_image') {
        return `real ship photo / ${asset.assetId?.slice(-8) ?? 'unknown'}`;
    }
    const type = asset.assetType ?? 'image';
    const tag = asset.tags?.find((entry) => !entry.startsWith('provider:')) ?? asset.eligibilityRole;
    return `${type}${tag ? ` / ${tag}` : ''} / ${asset.assetId?.slice(-8) ?? 'unknown'}`;
}

export function ImageSlotPicker({
    label,
    usePointKey,
    value,
    assets,
    autoUrl,
    control = {},
    onChange,
    onControlChange,
}: ImageSlotPickerProps) {
    const selected = value ? assets.find((asset) => asset.assetId === value) : undefined;
    const previewUrl = selected?.url ?? autoUrl;
    const updateControl = (patch: ImageSlotControl) => {
        onControlChange?.(usePointKey, { ...control, ...patch });
    };

    return (
        <div className="grid grid-cols-[42px_minmax(0,1fr)] items-center gap-2 rounded border border-white/10 bg-white/[0.025] p-2">
            <div className="h-10 w-10 overflow-hidden rounded bg-slate-900">
                {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={previewUrl}
                        alt=""
                        className={`h-full w-full object-cover ${control.hidden ? 'opacity-25 grayscale' : ''}`}
                        style={{
                            objectPosition: control.position ?? 'center',
                            transform: control.flipX ? 'scaleX(-1)' : undefined,
                        }}
                    />
                ) : (
                    <div className="h-full w-full bg-slate-800" />
                )}
            </div>
            <div className="min-w-0">
                <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-semibold text-slate-300">{label}</span>
                    {selected ? (
                        <button
                            type="button"
                            onClick={(event) => {
                                event.preventDefault();
                                onChange(usePointKey, null);
                            }}
                            className="text-[10px] font-semibold text-slate-500 hover:text-slate-200"
                        >
                            Auto
                        </button>
                    ) : (
                        <span className="text-[10px] uppercase tracking-wide text-slate-600">Auto</span>
                    )}
                </div>
                <select
                    value={value ?? ''}
                    onChange={(event) => onChange(usePointKey, event.target.value || null)}
                    className="w-full rounded border border-white/10 bg-black px-2 py-1 text-xs text-slate-300 outline-none focus:border-amber-400/70"
                >
                    <option value="">Automatic pick</option>
                    {assets.map((asset) => (
                        <option key={asset.assetId} value={asset.assetId}>
                            {labelForAsset(asset)}
                        </option>
                    ))}
                </select>
                {onControlChange && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => updateControl({ hidden: !control.hidden })}
                            className={`rounded border px-2 py-1 text-[10px] font-semibold ${control.hidden ? 'border-red-400/50 bg-red-500/15 text-red-300' : 'border-white/10 text-slate-400 hover:text-slate-200'}`}
                        >
                            {control.hidden ? 'Hidden' : 'Hide'}
                        </button>
                        <button
                            type="button"
                            onClick={() => updateControl({ flipX: !control.flipX })}
                            className={`rounded border px-2 py-1 text-[10px] font-semibold ${control.flipX ? 'border-amber-400/60 bg-amber-500/15 text-amber-300' : 'border-white/10 text-slate-400 hover:text-slate-200'}`}
                        >
                            Flip
                        </button>
                        {(['left', 'center', 'right'] as const).map((position) => (
                            <button
                                key={position}
                                type="button"
                                onClick={() => updateControl({ position })}
                                className={`rounded border px-2 py-1 text-[10px] font-semibold capitalize ${control.position === position || (!control.position && position === 'center') ? 'border-sky-400/50 bg-sky-500/15 text-sky-300' : 'border-white/10 text-slate-500 hover:text-slate-200'}`}
                            >
                                {position}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
