'use client';

import { useState, type ReactNode } from 'react';
import { normalizeCampaignResearchDossier } from '@/lib/campaigns/schema';

type ResearchSource = {
    themeName?: string | null;
    researchRationale?: string | null;
    audienceSignals?: string[] | null;
    vacationFitRationale?: string | null;
    communityFitRationale?: string | null;
    cruiseNativeMoments?: string[] | null;
    optionalGatheringMoments?: string[] | null;
    implausibleLiteralizations?: string[] | null;
    allowedThemeSignals?: string[] | null;
    discouragedThemeSignals?: string[] | null;
    nicheExpressionMode?: string | null;
    researchDossierGeneratedAt?: string | null;
    identityBlueprint?: {
        summary?: string | null;
        emotionalPromise?: string | null;
        energyMode?: string | null;
        socialScale?: string | null;
        evidenceOfBelonging?: string[] | null;
        forbiddenDefaults?: string[] | null;
    } | null;
    researchDossier?: Record<string, unknown> | null;
};

type ResearchContextPanelProps = {
    campaign?: ResearchSource | null;
    brief?: Record<string, unknown> | null;
    title?: string;
    subtitle?: string;
    defaultExpanded?: boolean;
    onRegenerateDossier?: () => void | Promise<void>;
    isRegeneratingDossier?: boolean;
};

function normalizeArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function asText(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getBriefRecord(brief?: Record<string, unknown> | null, key?: string): Record<string, unknown> | null {
    if (!brief || !key) return null;
    const value = brief[key];
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function SectionList({ title, items }: { title: string; items: string[] }) {
    if (items.length === 0) return null;
    return (
        <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">{title}</p>
            <div className="flex flex-wrap gap-2">
                {items.map((item) => (
                    <span key={`${title}-${item}`} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200">
                        {item}
                    </span>
                ))}
            </div>
        </div>
    );
}

function TextBlock({ title, value }: { title: string; value: string | null }) {
    if (!value) return null;
    return (
        <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">{title}</p>
            <p className="text-sm leading-relaxed text-slate-200">{value}</p>
        </div>
    );
}

function formatGeneratedAt(value?: string | null): string | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
}

function SectionShell({
    title,
    children,
    defaultExpanded = true,
}: {
    title: string;
    children: ReactNode;
    defaultExpanded?: boolean;
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);

    return (
        <div className="space-y-2 rounded-lg border border-white/10 bg-slate-950/40 p-3">
            <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="flex w-full items-center justify-between gap-3 text-left"
            >
                <p className="text-[10px] uppercase tracking-widest text-slate-500">{title}</p>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-300">
                    {expanded ? 'Collapse' : 'Expand'}
                </span>
            </button>
            {expanded && <div className="space-y-3">{children}</div>}
        </div>
    );
}

export function ResearchContextPanel({
    campaign,
    brief,
    title = 'Research Context',
    subtitle = 'What is shaping the brief, scene choices, and copy direction.',
    defaultExpanded = true,
    onRegenerateDossier,
    isRegeneratingDossier = false,
}: ResearchContextPanelProps) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [rawExpanded, setRawExpanded] = useState(false);

    const briefIdentity = getBriefRecord(brief, 'identityBlueprint') as ResearchSource['identityBlueprint'];
    const briefVisual = getBriefRecord(brief, 'visual');
    const briefCommunity = getBriefRecord(brief, 'communityExpression');
    const briefResearchDossier = getBriefRecord(brief, 'campaignResearchDossier') ?? getBriefRecord(brief, 'researchDossier');
    const campaignDossier = campaign?.researchDossier ?? null;
    const rawDossier = campaignDossier ?? briefResearchDossier;
    const normalizedDossier = normalizeCampaignResearchDossier(rawDossier);

    const researchRationale = asText(campaign?.researchRationale) ?? asText(brief?.['researchRationale']);
    const vacationFitRationale = asText(campaign?.vacationFitRationale) ?? asText(brief?.['vacationFitRationale']);
    const communityFitRationale = asText(campaign?.communityFitRationale) ?? asText(brief?.['communityFitRationale']);
    const nicheMode = asText(campaign?.nicheExpressionMode) ?? asText(brief?.['nicheExpressionMode']);
    const dossierGeneratedAt = formatGeneratedAt(campaign?.researchDossierGeneratedAt ?? null);

    const audienceSignals = normalizeArray(campaign?.audienceSignals ?? brief?.['audienceSignals']);
    const cruiseMoments = normalizeArray(campaign?.cruiseNativeMoments ?? brief?.['cruiseNativeMoments']);
    const optionalMoments = normalizeArray(campaign?.optionalGatheringMoments ?? brief?.['optionalGatheringMoments']);
    const allowedSignals = normalizeArray(campaign?.allowedThemeSignals ?? brief?.['allowedThemeSignals']);
    const discouragedSignals = normalizeArray(campaign?.discouragedThemeSignals ?? brief?.['discouragedThemeSignals']);
    const implausibleLiteralizations = normalizeArray(campaign?.implausibleLiteralizations ?? brief?.['implausibleLiteralizations']);
    const evidenceOfBelonging = normalizeArray(briefIdentity?.evidenceOfBelonging);
    const forbiddenDefaults = normalizeArray(briefIdentity?.forbiddenDefaults);

    const hasVisibleContent = Boolean(
        researchRationale
        || vacationFitRationale
        || communityFitRationale
        || nicheMode
        || audienceSignals.length
        || cruiseMoments.length
        || optionalMoments.length
        || allowedSignals.length
        || discouragedSignals.length
        || implausibleLiteralizations.length
        || evidenceOfBelonging.length
        || forbiddenDefaults.length
        || briefIdentity
        || briefVisual
        || briefCommunity
        || normalizedDossier
        || rawDossier
    );

    if (!hasVisibleContent) return null;

    return (
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="flex w-full items-start justify-between gap-4 border-b border-cyan-500/10 px-4 py-3 text-left"
            >
                <div className="space-y-1">
                    <p className="text-xs font-semibold tracking-widest text-cyan-300 uppercase">{title}</p>
                    <p className="text-[11px] leading-relaxed text-cyan-100/80">{subtitle}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                    {dossierGeneratedAt && (
                        <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-cyan-200">
                            Generated {dossierGeneratedAt}
                        </span>
                    )}
                    {rawDossier && (
                        <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-cyan-200">
                            Dossier Ready
                        </span>
                    )}
                    <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-cyan-100">
                        {expanded ? 'Collapse' : 'Expand'}
                    </span>
                </div>
            </button>

            {expanded && (
                <div className="space-y-4 p-4">
                    {onRegenerateDossier && (
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => void onRegenerateDossier()}
                                disabled={isRegeneratingDossier}
                                className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isRegeneratingDossier ? 'Regenerating dossier...' : rawDossier ? 'Regenerate dossier' : 'Generate dossier'}
                            </button>
                        </div>
                    )}

                <div className="grid gap-4 md:grid-cols-2">
                    <TextBlock title="Why this campaign exists" value={researchRationale} />
                    <TextBlock title="Vacation fit" value={vacationFitRationale} />
                    <TextBlock title="Community fit" value={communityFitRationale} />
                    <TextBlock title="Niche mode" value={nicheMode} />
                </div>

                {briefIdentity && (
                    <SectionShell title="Identity blueprint lens">
                        {briefIdentity.summary && <p className="text-sm leading-relaxed text-slate-200">{briefIdentity.summary}</p>}
                        <div className="grid gap-2 text-[11px] text-slate-300 md:grid-cols-2">
                            {briefIdentity.emotionalPromise && <p><span className="text-slate-500">Promise:</span> {briefIdentity.emotionalPromise}</p>}
                            {briefIdentity.energyMode && <p><span className="text-slate-500">Energy:</span> {briefIdentity.energyMode}</p>}
                            {briefIdentity.socialScale && <p><span className="text-slate-500">Scale:</span> {briefIdentity.socialScale}</p>}
                        </div>
                    </SectionShell>
                )}

                {normalizedDossier && (
                    <SectionShell title="Secondary research dossier">
                        <p className="text-xs text-slate-400">
                            This is the niche research that shapes the brief before cruise translation gets applied.
                        </p>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-3 rounded-md border border-white/5 bg-slate-900/40 p-3">
                                <p className="text-[10px] uppercase tracking-widest text-slate-500">Pure niche research</p>
                                <TextBlock title="Niche title" value={normalizedDossier.nicheResearch.nicheTitle} />
                                <TextBlock title="Trend cycle summary" value={normalizedDossier.nicheResearch.trendCycleSummary} />
                                <TextBlock title="Why this feels distinct now" value={normalizedDossier.nicheResearch.whyThisTrendFeelsDistinctNow} />
                                <SectionList title="Audience routine insights" items={normalizedDossier.nicheResearch.audienceRoutineInsights} />
                                <SectionList title="Specific examples" items={normalizedDossier.nicheResearch.specificExamples} />
                                <SectionList title="Allowed signals" items={normalizedDossier.nicheResearch.allowedSignals} />
                                <SectionList title="Discouraged signals" items={normalizedDossier.nicheResearch.discouragedSignals} />
                                <SectionList title="Source notes" items={normalizedDossier.nicheResearch.sourceNotes ?? []} />
                            </div>

                            <div className="space-y-3 rounded-md border border-white/5 bg-slate-900/40 p-3">
                                <p className="text-[10px] uppercase tracking-widest text-slate-500">Cruise translation</p>
                                <SectionList title="Cruise-native translation notes" items={normalizedDossier.cruiseTranslation.cruiseNativeTranslationNotes} />
                                <SectionList title="Brief direction implications" items={normalizedDossier.cruiseTranslation.downstreamImplications.briefDirection} />
                                <SectionList title="Media generation implications" items={normalizedDossier.cruiseTranslation.downstreamImplications.mediaGeneration} />
                                <SectionList title="Copy direction implications" items={normalizedDossier.cruiseTranslation.downstreamImplications.copyDirection} />
                            </div>
                        </div>
                    </SectionShell>
                )}

                <div className="grid gap-4">
                    <SectionList title="Audience signals" items={audienceSignals} />
                    <SectionList title="Cruise-native moments" items={cruiseMoments} />
                    <SectionList title="Optional gathering moments" items={optionalMoments} />
                    <SectionList title="Allowed signals" items={allowedSignals} />
                    <SectionList title="Discouraged signals" items={discouragedSignals} />
                    <SectionList title="Impossible / avoid" items={implausibleLiteralizations} />
                    <SectionList title="Belonging cues" items={evidenceOfBelonging} />
                    <SectionList title="Forbidden defaults" items={forbiddenDefaults} />
                </div>

                {(briefVisual || briefCommunity) && (
                    <div className="grid gap-3 md:grid-cols-2">
                        {briefVisual && (
                            <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3 space-y-1.5">
                                <p className="text-[10px] uppercase tracking-widest text-slate-500">Visual lens</p>
                                <p className="text-sm text-slate-200">{String(briefVisual.aestheticLabel ?? '-')}</p>
                                <p className="text-xs text-slate-400">{String(briefVisual.imageryMood ?? '-')}</p>
                            </div>
                        )}
                        {briefCommunity && (
                            <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3 space-y-1.5">
                                <p className="text-[10px] uppercase tracking-widest text-slate-500">Community lens</p>
                                <p className="text-sm text-slate-200">{String(briefCommunity.corePromise ?? '-')}</p>
                                <p className="text-xs text-slate-400">{String(briefCommunity.copyFramingRule ?? '-')}</p>
                            </div>
                        )}
                    </div>
                )}

                {rawDossier && (
                    <div className="space-y-2">
                        <button
                            type="button"
                            onClick={() => setRawExpanded((current) => !current)}
                            className="text-[11px] uppercase tracking-widest text-cyan-200 hover:text-cyan-100"
                        >
                            {rawExpanded ? 'Hide' : 'Show'} raw research dossier
                        </button>
                        {rawExpanded && (
                            <pre className="max-h-80 overflow-auto rounded-lg border border-white/10 bg-slate-950/80 p-3 text-[10px] leading-relaxed text-slate-300">
                                {JSON.stringify(rawDossier, null, 2)}
                            </pre>
                        )}
                    </div>
                )}
                </div>
            )}
        </div>
    );
}
