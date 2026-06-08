'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
    Activity,
    ArrowUpRight,
    BellRing,
    CheckCircle2,
    ChevronRight,
    CircleDollarSign,
    Eye,
    Gauge,
    LayoutDashboard,
    Moon,
    MousePointerClick,
    RefreshCw,
    RotateCcw,
    Ship,
    Sun,
    Target,
    TrendingUp,
    Users,
    X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CampaignWaitlistEntry, CampaignLeadEvent } from '@/lib/campaigns/types';
import type { FunnelSummary, LandingTrafficSummary, SourceBreakdownEntry, TrafficBreakdownEntry } from '@/lib/campaigns/conversion-store';

// ─── API response shapes ───────────────────────────────────────────────────────

interface CampaignMeta {
    slug: string;
    name: string;
    status: string;
    minCabinsRequired: number;
}

interface LeadsResponse {
    success: boolean;
    campaign: CampaignMeta;
    funnel: FunnelSummary;
    traffic: LandingTrafficSummary;
    leads: LeadDashboardRow[];
}

interface LeadDashboardRow extends CampaignWaitlistEntry {
    latestLifecycleStage: string | null;
    latestEventAt: string | null;
}

interface EventsResponse {
    success: boolean;
    campaignSlug: string;
    email: string | null;
    events: CampaignLeadEvent[];
}

type TabKey = 'overview' | 'traffic' | 'leads';

// ─── Primitives ────────────────────────────────────────────────────────────────

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
    return (
        <section
            className={cn(
                'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)]',
                'dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_1px_3px_rgba(0,0,0,0.3),0_8px_24px_-12px_rgba(0,0,0,0.6)]',
                className,
            )}
        >
            {children}
        </section>
    );
}

function PanelHeader({
    icon: Icon,
    title,
    description,
    action,
}: {
    icon?: React.ComponentType<{ className?: string }>;
    title: string;
    description?: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 dark:border-slate-800">
            <div className="flex items-start gap-3">
                {Icon ? (
                    <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <Icon className="h-4 w-4" />
                    </span>
                ) : null}
                <div>
                    <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h2>
                    {description ? <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{description}</p> : null}
                </div>
            </div>
            {action}
        </div>
    );
}

const accentMap = {
    slate: 'text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-800',
    indigo: 'text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-500/15',
    emerald: 'text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/15',
    amber: 'text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/15',
    sky: 'text-sky-600 bg-sky-50 dark:text-sky-300 dark:bg-sky-500/15',
    violet: 'text-violet-600 bg-violet-50 dark:text-violet-300 dark:bg-violet-500/15',
    rose: 'text-rose-600 bg-rose-50 dark:text-rose-300 dark:bg-rose-500/15',
} as const;

function StatCard({
    label,
    value,
    sub,
    icon: Icon,
    accent = 'slate',
}: {
    label: string;
    value: string | number;
    sub?: string;
    icon?: React.ComponentType<{ className?: string }>;
    accent?: keyof typeof accentMap;
}) {
    return (
        <div className="group relative overflow-hidden rounded-xl border border-slate-200/70 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700">
            <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
                {Icon ? (
                    <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', accentMap[accent])}>
                        <Icon className="h-3.5 w-3.5" />
                    </span>
                ) : null}
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-50">{value}</p>
            {sub ? <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{sub}</p> : null}
        </div>
    );
}

function EmptyState({ icon: Icon, text }: { icon?: React.ComponentType<{ className?: string }>; text: string }) {
    return (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            {Icon ? <Icon className="h-6 w-6 text-slate-300 dark:text-slate-600" /> : null}
            <p className="text-sm text-slate-400 dark:text-slate-500">{text}</p>
        </div>
    );
}

// ─── Tables ──────────────────────────────────────────────────────────────────

function SourceTable({ rows }: { rows: SourceBreakdownEntry[] }) {
    if (rows.length === 0) {
        return <EmptyState icon={Target} text="No source data yet." />;
    }
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        <th className="pb-2.5 pr-4 font-medium">Channel</th>
                        <th className="pb-2.5 pr-4 font-medium">Provider</th>
                        <th className="pb-2.5 pr-4 font-medium">Draft Type</th>
                        <th className="pb-2.5 pr-4 font-medium">Native ID</th>
                        <th className="pb-2.5 pr-4 text-right font-medium">Leads</th>
                        <th className="pb-2.5 text-right font-medium">Passengers</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((row) => (
                        <tr key={`${row.sourceChannel}::${row.provider}`} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                            <td className="py-2.5 pr-4">
                                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                    {row.sourceChannel}
                                </span>
                            </td>
                            <td className="py-2.5 pr-4 capitalize text-slate-600 dark:text-slate-300">{row.provider}</td>
                            <td className="py-2.5 pr-4 text-slate-500 dark:text-slate-400">{row.providerDraftType ?? '—'}</td>
                            <td className="py-2.5 pr-4 font-mono text-xs text-slate-400 dark:text-slate-500">{row.providerAdId ?? row.providerCampaignId ?? '—'}</td>
                            <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">{row.count}</td>
                            <td className="py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{row.passengers}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function TrafficSourceTable({ rows }: { rows: TrafficBreakdownEntry[] }) {
    if (rows.length === 0) {
        return <EmptyState icon={MousePointerClick} text="No landing traffic captured yet." />;
    }
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        <th className="pb-2.5 pr-4 font-medium">Channel</th>
                        <th className="pb-2.5 pr-4 font-medium">Provider</th>
                        <th className="pb-2.5 pr-4 font-medium">Campaign / Ad</th>
                        <th className="pb-2.5 pr-4 font-medium">Landing Path</th>
                        <th className="pb-2.5 pr-4 text-right font-medium">Views</th>
                        <th className="pb-2.5 text-right font-medium">Unique</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((row) => (
                        <tr
                            key={`${row.sourceChannel}::${row.provider}::${row.providerCampaignId ?? ''}::${row.providerAdId ?? ''}::${row.landingPath ?? ''}`}
                            className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                        >
                            <td className="py-2.5 pr-4">
                                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                    {row.sourceChannel}
                                </span>
                            </td>
                            <td className="py-2.5 pr-4 capitalize text-slate-600 dark:text-slate-300">{row.provider}</td>
                            <td className="py-2.5 pr-4 font-mono text-xs text-slate-400 dark:text-slate-500">
                                {row.providerAdId ?? row.providerCampaignId ?? row.providerDraftType ?? 'none'}
                            </td>
                            <td className="max-w-[320px] truncate py-2.5 pr-4 font-mono text-xs text-slate-500 dark:text-slate-400" title={row.landingPath ?? undefined}>
                                {row.landingPath ?? 'unknown'}
                            </td>
                            <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">{row.count}</td>
                            <td className="py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{row.uniqueSessions}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function lifecycleStageLabel(eventType: string): string {
    const labels: Record<string, string> = {
        landing_page_view: 'Landing page view',
        landing_engaged: 'Landing engaged',
        waitlist_submitted: 'Waitlist submitted',
        provider_lead_ingested: 'Provider lead ingested',
        nurture_queued: 'Nurture queued',
        nurture_sent: 'Nurture sent',
        threshold_met: 'Threshold met',
        threshold_met_notified: 'Threshold notification sent',
        manifest_started: 'Manifest started',
        manifest_submitted: 'Manifest submitted',
        booking_link_sent: 'Booking link sent',
        converted: 'Converted',
        expired: 'Expired',
        lead_error: 'Error',
    };
    return labels[eventType] ?? eventType;
}

function eventDotColor(eventType: string): string {
    if (eventType === 'converted') return 'bg-emerald-500';
    if (eventType === 'lead_error' || eventType === 'expired') return 'bg-rose-500';
    if (eventType.startsWith('threshold')) return 'bg-violet-500';
    if (eventType.startsWith('nurture')) return 'bg-amber-500';
    if (eventType.startsWith('manifest') || eventType === 'booking_link_sent') return 'bg-sky-500';
    return 'bg-slate-400';
}

function EventTimeline({ events, loading }: { events: CampaignLeadEvent[]; loading: boolean }) {
    if (loading) {
        return <p className="py-4 text-sm text-slate-400 dark:text-slate-500">Loading events…</p>;
    }
    if (events.length === 0) {
        return <EmptyState icon={Activity} text="No events recorded for this lead yet." />;
    }
    return (
        <ol className="relative ml-1 border-l border-slate-200 dark:border-slate-700">
            {events.map((event) => (
                <li key={event.SK} className="mb-5 ml-5 last:mb-0">
                    <span className={cn('absolute -left-[6.5px] mt-1 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900', eventDotColor(event.eventType))} />
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        {new Date(event.occurredAt).toLocaleString()}
                    </p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{lifecycleStageLabel(event.eventType)}</p>
                    {event.attribution.sourceChannel ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">via {event.attribution.sourceChannel}</p>
                    ) : null}
                    {event.notes ? <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{event.notes}</p> : null}
                </li>
            ))}
        </ol>
    );
}

function Field({ label, value }: { label: string; value?: string | number | boolean | null }) {
    if (value === undefined || value === null || value === '') return null;
    return (
        <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
            <p className="break-words text-sm font-medium text-slate-800 dark:text-slate-200">{String(value)}</p>
        </div>
    );
}

type NurtureStatus = 'sent' | 'queued' | 'eligible' | 'pending' | 'not_yet' | 'not_triggered' | 'no_phone';

function NurtureStatusBadge({ label, status }: { label: string; status: NurtureStatus }) {
    const cls = status === 'sent' ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30'
        : status === 'queued' ? 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30'
        : status === 'eligible' ? 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-500/10 dark:border-blue-500/30'
        : status === 'no_phone' ? 'text-rose-600 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-500/10 dark:border-rose-500/30'
        : 'text-slate-400 bg-slate-50 border-slate-200 dark:text-slate-500 dark:bg-slate-800/50 dark:border-slate-700';
    return (
        <div className={cn('rounded-lg border px-2.5 py-1.5 text-xs font-medium', cls)}>
            <span className="block text-[10px] uppercase tracking-wider opacity-70">{label}</span>
            <span className="capitalize">{status.replace(/_/g, ' ')}</span>
        </div>
    );
}

function deriveNurtureReadiness(
    lead: LeadDashboardRow,
    events: CampaignLeadEvent[],
): { confirmation: NurtureStatus; day3: NurtureStatus; day7: NurtureStatus; thresholdSms: NurtureStatus } {
    const daysSince = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24));

    const hasSentStage = (stage: string) =>
        events.some((e) =>
            (e.eventType === 'nurture_sent' || e.eventType === 'threshold_met_notified') &&
            e.metadata?.stage === stage,
        );

    const hasQueued = (stage: string) =>
        events.some((e) => e.eventType === 'nurture_queued' && e.metadata?.stage === stage);

    const confirmationStatus: NurtureStatus = hasSentStage('waitlist_confirmation')
        ? 'sent'
        : hasQueued('waitlist_confirmation')
            ? 'queued'
            : 'pending';

    const day3Status: NurtureStatus = hasSentStage('nurture_day3')
        ? 'sent'
        : daysSince >= 3
            ? 'eligible'
            : 'not_yet';

    const day7Status: NurtureStatus = hasSentStage('nurture_day7')
        ? 'sent'
        : daysSince >= 7
            ? 'eligible'
            : 'not_yet';

    const thresholdSmsStatus: NurtureStatus = hasSentStage('threshold_sms')
        ? 'sent'
        : !lead.phoneNumber
            ? 'no_phone'
            : 'not_triggered';

    return { confirmation: confirmationStatus, day3: day3Status, day7: day7Status, thresholdSms: thresholdSmsStatus };
}

function LeadDetailPanel({ lead, events }: { lead: LeadDashboardRow; events: CampaignLeadEvent[] }) {
    const nurture = deriveNurtureReadiness(lead, events);
    const attr = lead.attribution;

    return (
        <div className="grid gap-5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Name" value={`${lead.firstName} ${lead.lastName}`} />
                <Field label="Email" value={lead.email} />
                <Field label="Signed up" value={new Date(lead.createdAt).toLocaleDateString()} />
                <Field label="Passengers" value={lead.passengerCount} />
                <Field label="Path" value={lead.bookingMode === 'BOOK_NOW' ? 'Book Now' : 'Group Wait'} />
                <Field label="Manifest" value={lead.manifestStatus ?? 'PENDING'} />
                <Field label="Notified" value={lead.notified ? 'Yes' : 'No'} />
                <Field label="Converted" value={lead.converted ? 'Yes' : 'No'} />
                <Field label="Latest stage" value={lead.latestLifecycleStage ?? '—'} />
                <Field label="Phone" value={lead.phoneNumber ?? '—'} />
            </div>
            <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Attribution</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <Field label="Channel" value={attr?.sourceChannel ?? lead.sourceChannel} />
                    <Field label="Provider" value={attr?.provider} />
                    <Field label="Draft type" value={attr?.providerDraftType} />
                    <Field label="Provider campaign" value={attr?.providerCampaignId} />
                    <Field label="Provider ad" value={attr?.providerAdId} />
                    <Field label="Provider lead" value={attr?.providerLeadId} />
                    <Field label="Landing path" value={attr?.landingPath} />
                    <Field label="Referrer" value={attr?.referrer} />
                    <Field label="UTM source" value={attr?.utmSource} />
                    <Field label="UTM medium" value={attr?.utmMedium} />
                    <Field label="UTM campaign" value={attr?.utmCampaign} />
                    <Field label="UTM content" value={attr?.utmContent} />
                    <Field label="UTM term" value={attr?.utmTerm} />
                </div>
            </div>
            <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Nurture readiness</p>
                <div className="grid grid-cols-2 gap-2">
                    <NurtureStatusBadge label="Confirmation" status={nurture.confirmation} />
                    <NurtureStatusBadge label="Day 3" status={nurture.day3} />
                    <NurtureStatusBadge label="Day 7" status={nurture.day7} />
                    <NurtureStatusBadge label="Threshold SMS" status={nurture.thresholdSms} />
                </div>
            </div>
        </div>
    );
}

function LeadRow({
    lead,
    selected,
    onSelect,
}: {
    lead: LeadDashboardRow;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <tr
            onClick={onSelect}
            className={cn(
                'cursor-pointer transition-colors',
                selected ? 'bg-indigo-50/70 dark:bg-indigo-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
            )}
        >
            <td className={cn('py-3 pl-4 pr-3', selected ? 'border-l-2 border-indigo-500' : 'border-l-2 border-transparent')}>
                <div className="font-medium text-slate-900 dark:text-slate-100">{lead.firstName} {lead.lastName}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500">{lead.email}</div>
            </td>
            <td className="py-3 pr-3 text-xs text-slate-500 whitespace-nowrap dark:text-slate-400">{new Date(lead.createdAt).toLocaleDateString()}</td>
            <td className="py-3 pr-3 text-center font-semibold tabular-nums text-slate-700 dark:text-slate-200">{lead.passengerCount}</td>
            <td className="py-3 pr-3">
                <Badge variant="outline" className="rounded-md text-[11px] font-medium">
                    {lead.bookingMode === 'BOOK_NOW' ? 'Book Now' : 'Group Wait'}
                </Badge>
            </td>
            <td className="py-3 pr-3">
                <Badge
                    variant={lead.manifestStatus === 'SUBMITTED' ? 'default' : 'outline'}
                    className="rounded-md text-[11px] font-medium"
                >
                    {lead.manifestStatus ?? 'PENDING'}
                </Badge>
            </td>
            <td className="py-3 pr-3 text-center">
                {lead.converted
                    ? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
                    : <span className="text-slate-300">—</span>}
            </td>
            <td className="py-3 pr-3 text-xs text-slate-600 dark:text-slate-400">{lead.latestLifecycleStage ? lifecycleStageLabel(lead.latestLifecycleStage) : 'No events yet'}</td>
            <td className="py-3 pr-4 text-right">
                <ChevronRight className={cn('ml-auto h-4 w-4 transition-colors', selected ? 'text-indigo-500' : 'text-slate-300 dark:text-slate-600')} />
            </td>
        </tr>
    );
}

// ─── Header bits ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
    const normalized = status.toUpperCase();
    const tone =
        normalized.includes('CONVERT') || normalized.includes('BOOK') ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20'
        : normalized.includes('GATHER') || normalized.includes('INTEREST') ? 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20'
        : normalized.includes('RETIRE') || normalized.includes('EXPIRE') ? 'bg-slate-100 text-slate-500 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-500/20'
        : 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20';
    return (
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', tone)}>
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
            {status}
        </span>
    );
}

function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const isDark = resolvedTheme === 'dark';
    return (
        <Button
            variant="outline"
            size="sm"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label="Toggle theme"
            title={mounted ? (isDark ? 'Switch to light mode' : 'Switch to dark mode') : 'Toggle theme'}
        >
            {/* Avoid hydration mismatch: render a stable icon until mounted */}
            {!mounted ? <Sun className="h-3.5 w-3.5" /> : isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </Button>
    );
}

function TabButton({
    active,
    icon: Icon,
    label,
    count,
    onClick,
}: {
    active: boolean;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    count?: number;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'relative inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                active
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-50'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
            )}
        >
            <Icon className="h-4 w-4" />
            {label}
            {typeof count === 'number' ? (
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', active ? 'bg-slate-100 text-slate-600 dark:bg-slate-600 dark:text-slate-200' : 'bg-slate-200/70 text-slate-500 dark:bg-slate-800 dark:text-slate-400')}>
                    {count}
                </span>
            ) : null}
        </button>
    );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ConversionPage() {
    const { slug } = useParams<{ slug: string }>();

    const [leadsData, setLeadsData] = useState<LeadsResponse | null>(null);
    const [leadsError, setLeadsError] = useState<string | null>(null);
    const [leadsLoading, setLeadsLoading] = useState(true);
    const [resetting, setResetting] = useState(false);
    const [activeTab, setActiveTab] = useState<TabKey>('overview');

    const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
    const [leadEvents, setLeadEvents] = useState<CampaignLeadEvent[]>([]);
    const [eventsLoading, setEventsLoading] = useState(false);

    const loadLeads = useCallback(async () => {
        setLeadsLoading(true);
        setLeadsError(null);
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/leads`);
            const data = (await res.json()) as LeadsResponse;
            if (!res.ok || !data.success) {
                setLeadsError('Failed to load leads.');
            } else {
                setLeadsData(data);
            }
        } catch {
            setLeadsError('Failed to load leads.');
        } finally {
            setLeadsLoading(false);
        }
    }, [slug]);

    const loadLeadEvents = useCallback(async (email: string) => {
        setEventsLoading(true);
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/events?email=${encodeURIComponent(email)}`);
            const data = (await res.json()) as EventsResponse;
            setLeadEvents(data.events ?? []);
        } catch {
            setLeadEvents([]);
        } finally {
            setEventsLoading(false);
        }
    }, [slug]);

    useEffect(() => {
        void loadLeads();
    }, [loadLeads]);

    // Auto-refresh every 5 minutes so the ops view stays current without a manual click.
    // Skips ticks while the tab is hidden to avoid pointless background fetches.
    useEffect(() => {
        const REFRESH_MS = 5 * 60 * 1000;
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                void loadLeads();
            }
        }, REFRESH_MS);
        return () => clearInterval(interval);
    }, [loadLeads]);

    async function handleResetCampaign() {
        if (!campaign) {
            return;
        }

        const confirmed = window.confirm(
            `Remove all waitlist sign-ups, lifecycle events, and landing traffic analytics for ${campaign.name}? This is intended for testing and cannot be undone.`,
        );

        if (!confirmed) {
            return;
        }

        setResetting(true);
        setLeadsError(null);

        try {
            const response = await fetch(`/api/groups/campaign/${slug}/reset`, {
                method: 'POST',
            });
            const payload = await response.json() as { success?: boolean; error?: string };

            if (!response.ok || !payload.success) {
                setLeadsError(payload.error ?? 'Failed to reset campaign sign-ups.');
                return;
            }

            setSelectedEmail(null);
            setLeadEvents([]);
            await loadLeads();
        } catch {
            setLeadsError('Failed to reset campaign sign-ups.');
        } finally {
            setResetting(false);
        }
    }

    function handleSelectLead(email: string) {
        if (selectedEmail === email) {
            setSelectedEmail(null);
            setLeadEvents([]);
            return;
        }
        setSelectedEmail(email);
        void loadLeadEvents(email);
    }

    const funnel = leadsData?.funnel;
    const traffic = leadsData?.traffic;
    const campaign = leadsData?.campaign;
    const leads = leadsData?.leads ?? [];
    const thresholdPct = campaign && funnel
        ? Math.min(100, Math.round((funnel.totalLeads / campaign.minCabinsRequired) * 100))
        : 0;

    const selectedLead = useMemo(
        () => leads.find((l) => l.email === selectedEmail) ?? null,
        [leads, selectedEmail],
    );

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/60 dark:from-slate-950 dark:to-slate-900">
            {/* Sticky header */}
            <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
                            <Ship className="h-5 w-5" />
                        </span>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50">Conversion Ops</h1>
                            {campaign ? (
                                <div className="mt-0.5 flex items-center gap-2">
                                    <span className="text-sm text-slate-500 dark:text-slate-400">{campaign.name}</span>
                                    <StatusPill status={campaign.status} />
                                </div>
                            ) : (
                                <p className="mt-0.5 text-sm text-slate-400 dark:text-slate-500">Loading campaign…</p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <ThemeToggle />
                        <Button variant="outline" size="sm" onClick={() => void loadLeads()} disabled={leadsLoading || resetting}>
                            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', leadsLoading && 'animate-spin')} />
                            Refresh
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => void handleResetCampaign()} disabled={!campaign || leadsLoading || resetting}>
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            {resetting ? 'Resetting…' : 'Reset Sign-Ups'}
                        </Button>
                    </div>
                </div>

                {/* Tab bar */}
                <div className="mx-auto max-w-7xl px-6 pb-3">
                    <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100/80 p-1 dark:bg-slate-800/60">
                        <TabButton active={activeTab === 'overview'} icon={LayoutDashboard} label="Overview" onClick={() => setActiveTab('overview')} />
                        <TabButton active={activeTab === 'traffic'} icon={TrendingUp} label="Traffic" onClick={() => setActiveTab('traffic')} />
                        <TabButton active={activeTab === 'leads'} icon={Users} label="Leads" count={leads.length} onClick={() => setActiveTab('leads')} />
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
                {leadsError ? (
                    <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                        <X className="h-4 w-4 shrink-0" />
                        {leadsError}
                    </div>
                ) : null}

                {leadsLoading && !leadsData ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900" />
                        ))}
                    </div>
                ) : null}

                {/* ── OVERVIEW TAB ── */}
                {activeTab === 'overview' && funnel ? (
                    <>
                        {/* Threshold progress hero */}
                        <Panel className="overflow-hidden">
                            <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Group Threshold</p>
                                    <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                                        {funnel.totalLeads}
                                        <span className="text-lg font-medium text-slate-400 dark:text-slate-500"> / {campaign?.minCabinsRequired ?? '—'} cabins</span>
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-4xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">{thresholdPct}%</p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500">to launch threshold</p>
                                </div>
                            </div>
                            <div className="px-6 pb-5">
                                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-700"
                                        style={{ width: `${thresholdPct}%` }}
                                    />
                                </div>
                            </div>
                        </Panel>

                        {/* Funnel metrics */}
                        <Panel>
                            <PanelHeader icon={Gauge} title="Funnel Summary" description="Lead lifecycle from sign-up through conversion." />
                            <div className="grid grid-cols-2 gap-3 p-6 sm:grid-cols-4 lg:grid-cols-8">
                                <StatCard label="Total Leads" value={funnel.totalLeads} icon={Users} accent="indigo" />
                                <StatCard label="Passengers" value={funnel.totalPassengers} icon={Users} accent="sky" />
                                <StatCard label="Threshold %" value={`${thresholdPct}%`} icon={Target} accent="violet" />
                                <StatCard label="Group Wait" value={funnel.groupWaitLeads} icon={Activity} accent="slate" />
                                <StatCard label="Book Now" value={funnel.bookNowLeads} icon={ArrowUpRight} accent="emerald" />
                                <StatCard label="Manifest In" value={funnel.manifestSubmittedLeads} icon={CheckCircle2} accent="sky" />
                                <StatCard label="Notified" value={funnel.notifiedLeads} icon={BellRing} accent="amber" />
                                <StatCard label="Converted" value={funnel.convertedLeads} icon={CircleDollarSign} accent="emerald" />
                            </div>
                        </Panel>

                        {/* Source breakdown */}
                        <Panel>
                            <PanelHeader icon={Target} title="Source Breakdown" description="Sign-ups grouped by channel and provider." />
                            <div className="p-6">
                                <SourceTable rows={funnel.sourceBreakdown} />
                            </div>
                        </Panel>
                    </>
                ) : null}

                {/* ── TRAFFIC TAB ── */}
                {activeTab === 'traffic' && traffic ? (
                    <>
                        <Panel>
                            <PanelHeader
                                icon={TrendingUp}
                                title="Landing Traffic"
                                description="First-party page entries captured before sign-up. Compare against Meta Ads Manager clicks."
                            />
                            <div className="grid grid-cols-2 gap-3 p-6 sm:grid-cols-3 lg:grid-cols-6">
                                <StatCard label="Page Views" value={traffic.totalPageViews} sub="per session" icon={Eye} accent="indigo" />
                                <StatCard label="Unique Sessions" value={traffic.uniqueSessions} icon={Users} accent="sky" />
                                <StatCard label="Engaged" value={traffic.engagedViews} sub="one per visitor" icon={MousePointerClick} accent="violet" />
                                <StatCard label="View → Lead" value={`${Math.round(traffic.viewToLeadRate * 100)}%`} icon={TrendingUp} accent="slate" />
                                <StatCard label="Engaged → Lead" value={`${Math.round(traffic.engagedToLeadRate * 100)}%`} icon={Target} accent="emerald" />
                                <StatCard label="Signup Sessions" value={traffic.sessionsWithSignup} icon={CheckCircle2} accent="emerald" />
                            </div>
                        </Panel>
                        <Panel>
                            <PanelHeader icon={MousePointerClick} title="Traffic by Source" description="Where landing visits originate." />
                            <div className="p-6">
                                <TrafficSourceTable rows={traffic.sourceBreakdown} />
                            </div>
                        </Panel>
                    </>
                ) : null}

                {/* ── LEADS TAB ── */}
                {activeTab === 'leads' && !leadsLoading ? (
                    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
                        <Panel className="self-start">
                            <PanelHeader icon={Users} title={`Leads (${leads.length})`} description="Select a row to inspect the lead and its event timeline." />
                            {leads.length === 0 ? (
                                <EmptyState icon={Users} text="No leads yet for this campaign." />
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
                                                <th className="py-3 pl-4 pr-3 font-medium">Lead</th>
                                                <th className="py-3 pr-3 font-medium">Created</th>
                                                <th className="py-3 pr-3 text-center font-medium">Pax</th>
                                                <th className="py-3 pr-3 font-medium">Mode</th>
                                                <th className="py-3 pr-3 font-medium">Manifest</th>
                                                <th className="py-3 pr-3 text-center font-medium">Conv.</th>
                                                <th className="py-3 pr-3 font-medium">Stage</th>
                                                <th className="py-3 pr-4" />
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                                            {leads.map((lead) => (
                                                <LeadRow
                                                    key={lead.email}
                                                    lead={lead}
                                                    selected={selectedEmail === lead.email}
                                                    onSelect={() => handleSelectLead(lead.email)}
                                                />
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Panel>

                        <div className="space-y-6 lg:sticky lg:top-44 lg:self-start">
                            <Panel>
                                <PanelHeader
                                    title="Lead Detail"
                                    description={selectedEmail ?? 'Select a lead to inspect'}
                                    action={selectedEmail ? (
                                        <button onClick={() => handleSelectLead(selectedEmail)} className="text-slate-300 transition-colors hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400">
                                            <X className="h-4 w-4" />
                                        </button>
                                    ) : undefined}
                                />
                                <div className="p-6">
                                    {selectedLead && !eventsLoading ? (
                                        <LeadDetailPanel lead={selectedLead} events={leadEvents} />
                                    ) : selectedEmail ? (
                                        <p className="py-4 text-sm text-slate-400">Loading…</p>
                                    ) : (
                                        <EmptyState icon={Users} text="No lead selected." />
                                    )}
                                </div>
                            </Panel>
                            {selectedEmail ? (
                                <Panel>
                                    <PanelHeader icon={Activity} title="Event Timeline" />
                                    <div className="p-6">
                                        <EventTimeline events={leadEvents} loading={eventsLoading} />
                                    </div>
                                </Panel>
                            ) : null}
                        </div>
                    </div>
                ) : null}
            </main>
        </div>
    );
}
