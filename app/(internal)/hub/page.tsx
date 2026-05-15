import Link from 'next/link';
import { scanAllCampaigns } from '@/lib/campaigns/campaign-store';
import { Campaign } from '@/lib/campaigns/types';
import {
    Search, BadgeDollarSign, Newspaper, PartyPopper,
    MessageSquare, ImageIcon, Music4, Code2,
    Palette, Radio, TrendingUp, Globe, FlaskConical,
    ArrowUpRight, ChevronRight, LayoutDashboard, ClipboardCheck, AlertTriangle,
} from 'lucide-react';

// ─── Static link definitions ──────────────────────────────────────────────────

interface StaticLink {
    label: string;
    href: string;
    description: string;
    icon: React.ElementType;
    iconColor: string;
    bgColor: string;
}

interface StaticGroup {
    title: string;
    color: string;
    borderColor: string;
    links: StaticLink[];
}

const STATIC_GROUPS: StaticGroup[] = [
    {
        title: 'Customer-Facing Dashboard',
        color: 'text-sky-400',
        borderColor: 'border-sky-500/30',
        links: [
            {
                label: 'Dashboard Home',
                href: '/dashboard',
                description: 'Main customer dashboard — cruise search entry point',
                icon: LayoutDashboard,
                iconColor: 'text-sky-400',
                bgColor: 'bg-sky-500/10',
            },
            {
                label: 'Cruise Search',
                href: '/search',
                description: 'VTG-powered cruise search with filters and pricing',
                icon: Search,
                iconColor: 'text-violet-400',
                bgColor: 'bg-violet-500/10',
            },
            {
                label: 'Promotions & Deals',
                href: '/promotions',
                description: 'CB specials, top picks, and homepage deal tiles',
                icon: BadgeDollarSign,
                iconColor: 'text-green-400',
                bgColor: 'bg-green-500/10',
            },
            {
                label: 'Destination Deals',
                href: '/destinationdeal',
                description: 'Browse all CB destination deal cards',
                icon: Globe,
                iconColor: 'text-blue-400',
                bgColor: 'bg-blue-500/10',
            },
            {
                label: 'Cruise News',
                href: '/news',
                description: 'Live RSS feeds from all major cruise lines',
                icon: Newspaper,
                iconColor: 'text-orange-400',
                bgColor: 'bg-orange-500/10',
            },
            {
                label: 'Themed Cruises',
                href: '/themes',
                description: 'Specialty and themed cruise listings',
                icon: PartyPopper,
                iconColor: 'text-pink-400',
                bgColor: 'bg-pink-500/10',
            },
        ],
    },
    {
        title: 'AI Utility Tools',
        color: 'text-violet-400',
        borderColor: 'border-violet-500/30',
        links: [
            {
                label: 'Conversation',
                href: '/conversation',
                description: 'General-purpose AI conversation',
                icon: MessageSquare,
                iconColor: 'text-violet-400',
                bgColor: 'bg-violet-500/10',
            },
            {
                label: 'Image Generation',
                href: '/image',
                description: 'AI image generation utility',
                icon: ImageIcon,
                iconColor: 'text-red-400',
                bgColor: 'bg-red-500/10',
            },
            {
                label: 'Music Generation',
                href: '/music',
                description: 'AI music generation utility',
                icon: Music4,
                iconColor: 'text-blue-400',
                bgColor: 'bg-blue-500/10',
            },
            {
                label: 'Code',
                href: '/code',
                description: 'AI code generation utility',
                icon: Code2,
                iconColor: 'text-emerald-400',
                bgColor: 'bg-emerald-500/10',
            },
        ],
    },
    {
        title: 'Internal Dev & Campaign Tools',
        color: 'text-cyan-400',
        borderColor: 'border-cyan-500/30',
        links: [
            {
                label: 'Test Lab Index',
                href: '/tests',
                description: 'All 21 internal test pages — discovery through media & distribution',
                icon: FlaskConical,
                iconColor: 'text-cyan-400',
                bgColor: 'bg-cyan-500/10',
            },
        ],
    },
];

// ─── Per-campaign slug routes ─────────────────────────────────────────────────

interface SlugRoute {
    label: string;
    pattern: (slug: string) => string;
    description: string;
    icon: React.ElementType;
    iconColor: string;
    external?: boolean;
}

const SLUG_ROUTES: SlugRoute[] = [
    {
        label: 'Aesthetic Review',
        pattern: (slug) => `/dashboard/campaigns/${slug}/media/aesthetic`,
        description: 'Review and approve the campaign aesthetic brief',
        icon: Palette,
        iconColor: 'text-violet-400',
    },
    {
        label: 'Distribution',
        pattern: (slug) => `/dashboard/campaigns/${slug}/media/distribution`,
        description: 'Campaign social distribution dashboard',
        icon: Radio,
        iconColor: 'text-amber-400',
    },
    {
        label: 'Conversion / Leads',
        pattern: (slug) => `/dashboard/campaigns/${slug}/conversion`,
        description: 'Waitlist, lead events, and funnel summary',
        icon: TrendingUp,
        iconColor: 'text-emerald-400',
    },
    {
        label: 'Public Landing',
        pattern: (slug) => `/groups/${slug}`,
        description: 'Live public-facing campaign landing page',
        icon: Globe,
        iconColor: 'text-blue-400',
        external: true,
    },
    {
        label: 'Landing Preview',
        pattern: (slug) => `/tests/campaign-landing/${slug}`,
        description: 'Preview the campaign landing page with review controls',
        icon: FlaskConical,
        iconColor: 'text-cyan-400',
    },
    {
        label: 'Manual Booking',
        pattern: (slug) => `/tests/manual-booking-entry?slug=${slug}`,
        description: 'Daily CB Agent Tools reconciliation — mark leads converted with booking refs',
        icon: ClipboardCheck,
        iconColor: 'text-emerald-400',
    },
    {
        label: 'Booking Changes',
        pattern: (slug) => `/tests/booking-changes?slug=${slug}`,
        description: 'Record ship/date/price/cancellation changes; track acknowledgments',
        icon: AlertTriangle,
        iconColor: 'text-rose-400',
    },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

export default async function HubPage() {
    let campaigns: Campaign[] = [];
    try {
        campaigns = await scanAllCampaigns();
        campaigns.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
        // Non-fatal — page renders without campaign section
    }

    return (
        <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">

            {/* Header */}
            <div className="space-y-1">
                <h1 className="text-2xl font-bold text-white tracking-tight">Internal Hub</h1>
                <p className="text-sm text-slate-400">
                    Staff-only nav — {campaigns.length} active campaign{campaigns.length !== 1 ? 's' : ''} loaded.
                </p>
            </div>

            {/* Static groups */}
            {STATIC_GROUPS.map((group) => (
                <section key={group.title} className="space-y-3">
                    <div className={`flex items-center gap-2 pb-1 border-b border-white/5`}>
                        <h2 className={`text-xs font-semibold uppercase tracking-widest ${group.color}`}>
                            {group.title}
                        </h2>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {group.links.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`group flex items-start gap-3 rounded-xl border ${group.borderColor} bg-slate-900/60 p-4 hover:bg-slate-800/70 transition-colors`}
                            >
                                <div className={`mt-0.5 rounded-lg ${link.bgColor} p-2`}>
                                    <link.icon className={`h-4 w-4 ${link.iconColor}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-1">
                                        <span className={`text-sm font-semibold text-slate-200 group-hover:${group.color}`}>
                                            {link.label}
                                        </span>
                                        <ChevronRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-400 shrink-0" />
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">
                                        {link.description}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            ))}

            {/* Campaign slug section */}
            <section className="space-y-4">
                <div className="flex items-center gap-3 pb-1 border-b border-white/5">
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
                        Campaign Pages by Slug
                    </h2>
                    <span className="ml-auto text-xs text-slate-500">
                        {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {campaigns.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No campaigns found in DynamoDB.</p>
                ) : (
                    <div className="space-y-4">
                        {campaigns.map((campaign) => (
                            <div
                                key={campaign.id}
                                className="rounded-xl border border-amber-500/20 bg-slate-900/60 overflow-hidden"
                            >
                                {/* Campaign header row */}
                                <div className="flex items-start justify-between gap-4 px-5 py-3 bg-amber-500/5 border-b border-amber-500/15">
                                    <div className="space-y-0.5">
                                        <h3 className="text-sm font-bold text-slate-200">
                                            {campaign.name}
                                        </h3>
                                        <p className="text-[11px] font-mono text-slate-500">
                                            {campaign.id}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                        {campaign.status && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                                {campaign.status}
                                            </span>
                                        )}
                                        {campaign.targetDates && (
                                            <span className="text-[10px] text-slate-500">
                                                {campaign.targetDates}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Slug route buttons */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 divide-x divide-y divide-white/5">
                                    {SLUG_ROUTES.map((route) => (
                                        <Link
                                            key={route.label}
                                            href={route.pattern(campaign.id)}
                                            target={route.external ? '_blank' : undefined}
                                            rel={route.external ? 'noopener noreferrer' : undefined}
                                            className="group flex flex-col gap-2 p-4 hover:bg-slate-800/60 transition-colors"
                                            title={route.description}
                                        >
                                            <div className="flex items-center justify-between">
                                                <route.icon className={`h-4 w-4 ${route.iconColor}`} />
                                                {route.external && (
                                                    <ArrowUpRight className="h-3 w-3 text-slate-600 group-hover:text-slate-400" />
                                                )}
                                            </div>
                                            <span className="text-xs font-semibold text-slate-400 group-hover:text-slate-200 leading-tight">
                                                {route.label}
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
