"use client";

// MULTI_MODEL_IMAGES (Phase F): a single collapsible card that wraps both image
// generation control surfaces into one tidy, tabbed container:
//   • Flyer Controls  — negations/axes/niche + flyer image models
//   • Image Models    — shared backends for hero/concepts/documentary/scenes
// Keeps the Test Media Generation page compact while making both easy to find.

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { FlyerControlsBody } from "./flyer-controls-editor";
import { ImageModelControlsBody } from "./image-model-controls-editor";

type TabId = "flyer" | "models";

const TABS: { id: TabId; label: string }[] = [
    { id: "flyer", label: "Flyer Controls" },
    { id: "models", label: "Image Models" },
];

export function MediaControlsTabs({ slug, defaultNicheHint }: { slug: string; defaultNicheHint?: string | null }) {
    const [tab, setTab] = useState<TabId>("flyer");

    return (
        <details className="border border-white/10 rounded-xl bg-slate-900/50" open>
            <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-4 py-3 list-none">
                <span className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-violet-400">
                    <Sparkles className="h-3.5 w-3.5" />
                    Image Generation Controls
                </span>
            </summary>

            <div className="border-t border-white/5">
                {/* Tab bar */}
                <div className="flex items-center gap-1 px-4 pt-3">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            className={`rounded-t-lg border-b-2 px-3 py-1.5 text-[11px] font-medium transition ${tab === t.id
                                ? "border-violet-500 text-violet-200"
                                : "border-transparent text-slate-500 hover:text-slate-300"}`}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Keep both mounted so each editor's loaded state survives tab switches;
                    hide the inactive one rather than unmounting it. */}
                <div className={tab === "flyer" ? "block" : "hidden"}>
                    <FlyerControlsBody slug={slug} defaultNicheHint={defaultNicheHint} />
                </div>
                <div className={tab === "models" ? "block" : "hidden"}>
                    <ImageModelControlsBody slug={slug} />
                </div>
            </div>
        </details>
    );
}
