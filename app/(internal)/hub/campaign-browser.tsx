'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ElementType } from 'react';
import type { Campaign } from '@/lib/campaigns/types';
import {
    AlertTriangle,
    ArrowUpRight,
    ClipboardCheck,
    FlaskConical,
    Globe,
    Palette,
    Radio,
    Search,
    TrendingUp,
    Users,
    X,
} from 'lucide-react';

type FilterKey = 'focus' | 'attention' | 'gathering' | 'drafts' | 'matched' | 'inactive' | 'all';
type SortKey = 'attention' | 'updated' | 'sailDate' | 'name' | 'status';

interface SlugRoute {
    label: string;
    shortLabel: string;
    pattern: (slug: string) => string;
    description: string;
    icon: ElementType;
    iconColor: string;
    external?: boolean;
}

interface CampaignBrowserProps {
    campaigns: Campaign[];
}

const DEFAULT_VISIBLE_COUNT = 12;

const SLUG_ROUTES: SlugRoute[] = [
    {
        label: 'Aesthetic Review',
        shortLabel: 'Brief',
        pattern: (slug) => `/dashboard/campaigns/${slug}/media/aesthetic`,
        description: 'Review and approve the campaign aesthetic brief',
        icon: Palette,
        iconColor: 'text-violet-400',
    },
    {
        label: 'Distribution',
        shortLabel: 'Dist',
        pattern: (slug) => `/dashboard/campaigns/${slug}/media/distribution`,
        description: 'Campaign social distribution dashboard',
        icon: Radio,
        iconColor: 'text-amber-400',
    },
    {
        label: 'Conversion / Leads',
        shortLabel: 'Leads',
        pattern: (slug) => `/dashboard/campaigns/${slug}/conversion`,
        description: 'Waitlist, lead events, and funnel summary',
        icon: TrendingUp,
        iconColor: 'text-emerald-400',
    },
    {
        label: 'Public Landing',
        shortLabel: 'Public',
        pattern: (slug) => `/groups/${slug}`,
        description: 'Live public-facing campaign landing page',
        icon: Globe,
        iconColor: 'text-blue-400',
        external: true,
    },
    {
        label: 'Landing Preview',
        shortLabel: 'Preview',
        pattern: (slug) => `/tests/campaign-landing/${slug}`,
        description: 'Preview the campaign landing page with review controls',
        icon: FlaskConical,
        iconColor: 'text-cyan-400',
    },
    {
        label: 'Manual Booking',
        shortLabel: 'Book',
        pattern: (slug) => `/tests/manual-booking-entry?slug=${slug}`,
        description: 'Daily CB Agent Tools reconciliation',
        icon: ClipboardCheck,
        iconColor: 'text-emerald-400',
    },
    {
        label: 'Booking Changes',
        shortLabel: 'Changes',
        pattern: (slug) => `/tests/booking-changes?slug=${slug}`,
        description: 'Record ship/date/price/cancellation changes',
        icon: AlertTriangle,
        iconColor: 'text-rose-400',
    },
    {
        label: 'Alumni Invite',
        shortLabel: 'Alumni',
        pattern: (slug) => `/tests/alumni-rebooking?slug=${slug}`,
        description: 'Invite past converted guests to this campaign',
        icon: Users,
        iconColor: 'text-violet-400',
    },
];

const FILTERS: Array<{ key: FilterKey; label: string }> = [
    { key: 'focus', label: 'Focus' },
    { key: 'attention', label: 'Needs Work' },
    { key: 'gathering', label: 'Gathering' },
    { key: 'drafts', label: 'Drafts' },
    { key: 'matched', label: 'CB Matched' },
    { key: 'inactive', label: 'Inactive' },
    { key: 'all', label: 'All' },
];

function isCampaignRetired(campaign: Campaign): boolean {
    const state = campaign.discoveryIteration;
    return !!state?.retiredAt || state?.recommendedNextAction === 'retire';
}

function isInactive(campaign: Campaign): boolean {
    return campaign.status === 'EXPIRED' || campaign.archived === true || isCampaignRetired(campaign);
}

function dateValue(value?: string): number {
    if (!value) {
        return 0;
    }
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

function primarySailDate(campaign: Campaign): string | undefined {
    const primaryCandidate = campaign.inventoryCandidates
        ?.filter((candidate) => candidate.source === 'CB_GROUP')
        .sort((a, b) => a.rank - b.rank)[0];
    return primaryCandidate?.sailDate ?? campaign.matchedSailDate;
}

function formatSailDate(value?: string): string {
    if (!value) {
        return 'Date TBD';
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return parsed.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function attentionIssues(campaign: Campaign): string[] {
    const issues: string[] = [];

    if (campaign.status === 'THRESHOLD_MET') {
        issues.push('Threshold met');
    }
    if (campaign.pricingStatus !== 'CB_MATCHED') {
        issues.push('No CB match');
    }
    if (!campaign.matchedShipName) {
        issues.push('Ship TBD');
    }
    if (campaign.inventoryHealth === 'FAILED' || campaign.inventoryHealth === 'DEGRADED') {
        issues.push(`Inventory ${campaign.inventoryHealth.toLowerCase()}`);
    }
    if (campaign.status !== 'DRAFT' && campaign.aestheticBriefStatus !== 'approved') {
        issues.push('Brief not approved');
    }
    if (
        campaign.status === 'GATHERING_INTEREST'
        && (!campaign.distributionStatus || campaign.distributionStatus === 'not_started')
    ) {
        issues.push('Distribution not scheduled');
    }

    return issues;
}

function statusPriority(status: Campaign['status']): number {
    switch (status) {
        case 'THRESHOLD_MET':
            return 0;
        case 'GATHERING_INTEREST':
            return 1;
        case 'CONVERTED':
            return 2;
        case 'DRAFT':
            return 3;
        case 'EXPIRED':
        default:
            return 4;
    }
}

function matchesSearch(campaign: Campaign, query: string): boolean {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        return true;
    }
    const haystack = [
        campaign.name,
        campaign.id,
        campaign.status,
        campaign.pricingStatus,
        campaign.matchedShipName,
        campaign.matchedDeparturePort,
        campaign.targetDestination,
        campaign.shipTarget,
        campaign.description,
        campaign.seedConcept,
        ...(campaign.targetingKeywords ?? []),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    return haystack.includes(normalized);
}

function matchesFilter(campaign: Campaign, filter: FilterKey): boolean {
    const inactive = isInactive(campaign);
    const issues = attentionIssues(campaign);

    switch (filter) {
        case 'attention':
            return !inactive && issues.length > 0;
        case 'gathering':
            return !inactive && campaign.status === 'GATHERING_INTEREST';
        case 'drafts':
            return !inactive && campaign.status === 'DRAFT';
        case 'matched':
            return !inactive && campaign.pricingStatus === 'CB_MATCHED';
        case 'inactive':
            return inactive;
        case 'all':
            return true;
        case 'focus':
        default:
            return !inactive && campaign.status !== 'DRAFT';
    }
}

function sortCampaigns(campaigns: Campaign[], sort: SortKey): Campaign[] {
    return [...campaigns].sort((a, b) => {
        if (sort === 'name') {
            return a.name.localeCompare(b.name);
        }
        if (sort === 'sailDate') {
            const left = dateValue(primarySailDate(a));
            const right = dateValue(primarySailDate(b));
            return (left || Number.MAX_SAFE_INTEGER) - (right || Number.MAX_SAFE_INTEGER);
        }
        if (sort === 'status') {
            return statusPriority(a.status) - statusPriority(b.status) || a.name.localeCompare(b.name);
        }
        if (sort === 'updated') {
            return dateValue(b.updatedAt) - dateValue(a.updatedAt);
        }

        const leftIssues = attentionIssues(a).length;
        const rightIssues = attentionIssues(b).length;
        return rightIssues - leftIssues
            || statusPriority(a.status) - statusPriority(b.status)
            || dateValue(b.updatedAt) - dateValue(a.updatedAt)
            || a.name.localeCompare(b.name);
    });
}

function metricLabel(value: number, label: string): string {
    return `${value} ${label}`;
}

export function CampaignBrowser({ campaigns }: CampaignBrowserProps) {
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<FilterKey>('focus');
    const [sort, setSort] = useState<SortKey>('attention');
    const [showAll, setShowAll] = useState(false);

    const metrics = useMemo(() => {
        const inactiveCount = campaigns.filter(isInactive).length;
        const attentionCount = campaigns.filter((campaign) => !isInactive(campaign) && attentionIssues(campaign).length > 0).length;
        const gatheringCount = campaigns.filter((campaign) => !isInactive(campaign) && campaign.status === 'GATHERING_INTEREST').length;
        const matchedCount = campaigns.filter((campaign) => !isInactive(campaign) && campaign.pricingStatus === 'CB_MATCHED').length;
        const focusCount = campaigns.filter((campaign) => matchesFilter(campaign, 'focus')).length;

        return { inactiveCount, attentionCount, gatheringCount, matchedCount, focusCount };
    }, [campaigns]);

    const filteredCampaigns = useMemo(() => {
        return sortCampaigns(
            campaigns
                .filter((campaign) => matchesFilter(campaign, filter))
                .filter((campaign) => matchesSearch(campaign, query)),
            sort,
        );
    }, [campaigns, filter, query, sort]);

    const visibleCampaigns = showAll
        ? filteredCampaigns
        : filteredCampaigns.slice(0, DEFAULT_VISIBLE_COUNT);

    return (
        <section className="space-y-4">
            <div className="flex flex-wrap items-end gap-3 pb-1 border-b border-white/5">
                <div>
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
                        Campaign Browser
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                        {metricLabel(campaigns.length, 'records')} loaded. Showing {metricLabel(filteredCampaigns.length, 'matches')}.
                    </p>
                </div>
                <div className="ml-auto flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-wider">
                    <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-1 text-cyan-200">
                        {metrics.focusCount} focus
                    </span>
                    <span className="rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-rose-200">
                        {metrics.attentionCount} needs work
                    </span>
                    <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-emerald-200">
                        {metrics.gatheringCount} gathering
                    </span>
                    <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-amber-200">
                        {metrics.matchedCount} matched
                    </span>
                    <span className="rounded-full border border-slate-500/25 bg-slate-500/10 px-2 py-1 text-slate-300">
                        {metrics.inactiveCount} inactive
                    </span>
                </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
                <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                    <label className="relative block">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                        <input
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                setShowAll(false);
                            }}
                            placeholder="Search name, slug, ship, port, status..."
                            className="h-10 w-full rounded-lg border border-white/10 bg-slate-900/80 pl-9 pr-9 text-sm text-slate-100 outline-none transition focus:border-cyan-400/70"
                        />
                        {query ? (
                            <button
                                type="button"
                                onClick={() => setQuery('')}
                                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-slate-500 hover:bg-white/10 hover:text-slate-200"
                                title="Clear search"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        ) : null}
                    </label>

                    <select
                        value={sort}
                        onChange={(event) => setSort(event.target.value as SortKey)}
                        className="h-10 rounded-lg border border-white/10 bg-slate-900/80 px-3 text-sm text-slate-200 outline-none transition focus:border-cyan-400/70"
                        title="Sort campaigns"
                    >
                        <option value="attention">Sort: needs work</option>
                        <option value="updated">Sort: recently updated</option>
                        <option value="sailDate">Sort: sail date</option>
                        <option value="status">Sort: status</option>
                        <option value="name">Sort: name</option>
                    </select>

                    <Link
                        href="/tests/groups/discovery"
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20"
                    >
                        Discovery
                        <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    {FILTERS.map((option) => {
                        const selected = filter === option.key;
                        return (
                            <button
                                key={option.key}
                                type="button"
                                onClick={() => {
                                    setFilter(option.key);
                                    setShowAll(false);
                                }}
                                className={[
                                    'h-8 rounded-full border px-3 text-xs font-semibold transition',
                                    selected
                                        ? 'border-amber-400/60 bg-amber-400/15 text-amber-100'
                                        : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200',
                                ].join(' ')}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {filteredCampaigns.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-slate-900/50 p-6 text-sm text-slate-400">
                    No campaigns match the current search and filter.
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-amber-500/20 bg-slate-950/70">
                    <div className="min-w-[1040px]">
                        <div className="grid grid-cols-[minmax(220px,1.3fr)_minmax(160px,0.8fr)_minmax(130px,0.6fr)_minmax(180px,0.9fr)_minmax(260px,1fr)] gap-3 border-b border-white/10 bg-amber-500/5 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            <span>Campaign</span>
                            <span>Inventory</span>
                            <span>Status</span>
                            <span>Attention</span>
                            <span>Actions</span>
                        </div>

                        <div className="divide-y divide-white/5">
                            {visibleCampaigns.map((campaign) => {
                                const issues = attentionIssues(campaign);
                                const inactive = isInactive(campaign);
                                return (
                                    <article
                                        key={campaign.id}
                                        className={[
                                            'grid grid-cols-[minmax(220px,1.3fr)_minmax(160px,0.8fr)_minmax(130px,0.6fr)_minmax(180px,0.9fr)_minmax(260px,1fr)] gap-3 px-4 py-3 transition hover:bg-white/[0.03]',
                                            inactive ? 'opacity-60' : '',
                                        ].join(' ')}
                                    >
                                    <div className="min-w-0">
                                        <h3 className="truncate text-sm font-bold text-slate-100" title={campaign.name}>
                                            {campaign.name}
                                        </h3>
                                        <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500" title={campaign.id}>
                                            {campaign.id}
                                        </p>
                                    </div>

                                    <div className="min-w-0 text-xs">
                                        <p className="truncate font-semibold text-slate-300" title={campaign.matchedShipName ?? campaign.shipTarget ?? 'Ship TBD'}>
                                            {campaign.matchedShipName ?? campaign.shipTarget ?? 'Ship TBD'}
                                        </p>
                                        <p className="mt-0.5 text-slate-500">
                                            {formatSailDate(primarySailDate(campaign))}
                                        </p>
                                    </div>

                                    <div className="space-y-1">
                                        <span className="inline-flex rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                                            {campaign.status.replaceAll('_', ' ')}
                                        </span>
                                        <p className="text-[11px] text-slate-500">
                                            {campaign.pricingStatus ?? 'AI_ESTIMATE'}
                                        </p>
                                    </div>

                                    <div className="flex min-w-0 flex-wrap gap-1.5">
                                        {inactive ? (
                                            <span className="rounded-full border border-slate-500/25 bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                                                inactive/history
                                            </span>
                                        ) : issues.length > 0 ? (
                                            issues.slice(0, 2).map((issue) => (
                                                <span
                                                    key={issue}
                                                    className="rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-200"
                                                >
                                                    {issue}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                                                clean
                                            </span>
                                        )}
                                        {issues.length > 2 ? (
                                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                                                +{issues.length - 2}
                                            </span>
                                        ) : null}
                                    </div>

                                    <div className="grid grid-cols-4 gap-1.5">
                                        {SLUG_ROUTES.map((route) => (
                                            <Link
                                                key={route.label}
                                                href={route.pattern(campaign.id)}
                                                target={route.external ? '_blank' : undefined}
                                                rel={route.external ? 'noopener noreferrer' : undefined}
                                                className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-slate-900/70 px-2 text-[11px] font-semibold text-slate-300 hover:border-white/20 hover:bg-slate-800 hover:text-white"
                                                title={route.description}
                                            >
                                                <route.icon className={`h-3.5 w-3.5 shrink-0 ${route.iconColor}`} />
                                                <span className="truncate">{route.shortLabel}</span>
                                            </Link>
                                        ))}
                                    </div>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {filteredCampaigns.length > DEFAULT_VISIBLE_COUNT ? (
                <div className="flex justify-center">
                    <button
                        type="button"
                        onClick={() => setShowAll((current) => !current)}
                        className="h-9 rounded-lg border border-white/10 bg-slate-900/70 px-4 text-sm font-semibold text-slate-300 hover:border-white/20 hover:text-white"
                    >
                        {showAll
                            ? 'Show first 12'
                            : `Show ${filteredCampaigns.length - DEFAULT_VISIBLE_COUNT} more`}
                    </button>
                </div>
            ) : null}
        </section>
    );
}
