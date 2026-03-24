'use client';

import { Archive, ArrowRight, Clapperboard, FileSearch } from 'lucide-react';

export default function AestheticDevisingArchivedPage() {
    return (
        <div className="min-h-screen bg-slate-950 px-6 py-12 text-slate-200">
            <div className="mx-auto max-w-3xl space-y-6">
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6">
                    <div className="flex items-start gap-4">
                        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-300">
                            <Archive className="h-6 w-6" />
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-xl font-semibold text-rose-200">Aesthetic Devising Is Archived</h1>
                            <p className="text-sm text-rose-100/85">
                                This page exposed legacy aesthetic-generation and review actions that no longer match the current brief workflow.
                                It has been archived so it cannot be used as a live generation surface by mistake.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 space-y-4">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Use These Instead</h2>
                    <div className="grid gap-3 md:grid-cols-2">
                        <a
                            href="/tests/brief-studio"
                            className="group rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 transition hover:border-cyan-400/40 hover:bg-cyan-500/15"
                        >
                            <div className="flex items-center gap-3 text-cyan-200">
                                <FileSearch className="h-5 w-5" />
                                <span className="font-semibold">Brief Studio</span>
                            </div>
                            <p className="mt-2 text-sm text-cyan-100/80">
                                Load stored briefs, inspect readiness, review issues, approve for media, and regenerate only with explicit confirmation.
                            </p>
                            <div className="mt-3 inline-flex items-center gap-2 text-sm text-cyan-300 group-hover:text-cyan-200">
                                Open Brief Studio
                                <ArrowRight className="h-4 w-4" />
                            </div>
                        </a>

                        <a
                            href="/tests/production-bible"
                            className="group rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 transition hover:border-amber-400/40 hover:bg-amber-500/15"
                        >
                            <div className="flex items-center gap-3 text-amber-200">
                                <Clapperboard className="h-5 w-5" />
                                <span className="font-semibold">Production Bible</span>
                            </div>
                            <p className="mt-2 text-sm text-amber-100/80">
                                Regenerate scene specs, run preflight, and execute downstream media generation with explicit cost and consequence prompts.
                            </p>
                            <div className="mt-3 inline-flex items-center gap-2 text-sm text-amber-300 group-hover:text-amber-200">
                                Open Production Bible
                                <ArrowRight className="h-4 w-4" />
                            </div>
                        </a>
                    </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 text-sm text-slate-400 space-y-2">
                    <p>
                        Archived rationale: this page used legacy routes and UI wording that made live generation paths too easy to trigger by accident.
                    </p>
                    <p>
                        If you only need to inspect an existing brief, use <span className="font-semibold text-slate-200">Load Selected Brief</span> inside Brief Studio.
                    </p>
                </div>
            </div>
        </div>
    );
}
