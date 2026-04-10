import Link from 'next/link';
import { scanAllCampaigns } from '@/lib/campaigns/campaign-store';
import { Campaign } from '@/lib/campaigns/types';
import {
    Search, BadgeDollarSign, Newspaper, PartyPopper,
    MessageSquare, ImageIcon, Music4, Code2, Home,
    Palette, Radio, TrendingUp, Globe, FlaskConical,
    ArrowUpRight, ChevronRight,
} from 'lucide-react';

// ─── Static dashboard links ───────────────────────────────────────────────────

interface StaticLink {
    label: string;
    href: string;
    description: string;
    icon: React.ElementType;
    iconColor: string;
}

interface StaticGroup {
    title: string;
    links: StaticLink[];
}

const STATIC_GROUPS: StaticGroup[] = [
    {
        title: 'Customer Tools',
        links: [
            {
                label: 'Cruise Search',
                href: '/search',
                description: 'VTG-powered cruise search with filters and pricing',
                icon: Search,
                iconColor: 'text-violet-500',
            },
            {
                label: 'Promotions & Deals',
                href: '/promotions',
                description: 'CB specials, top picks, and homepage deal tiles',
                icon: BadgeDollarSign,
                iconColor: 'text-green-500',
            },
            {
                label: 'Destination Deals',
                href: '/destinationdeal',
                description: 'Browse all CB destination deal cards',
                icon: Globe,
                iconColor: 'text-blue-500',
            },
            {
                label: 'Cruise News',
                href: '/news',
                description: 'Live RSS feeds from all major cruise lines',
                icon: Newspaper,
                iconColor: 'text-orange-500',
            },
            {
                label: 'Themed Cruises',
                href: '/themes',
                description: 'Specialty and themed cruise listings',
                icon: PartyPopper,
                iconColor: 'text-pink-500',
            },
        ],
    },
    {
        title: 'AI Tools',
        links: [
            {
                label: 'Conversation',
                href: '/conversation',
                description: 'General-purpose AI conversation',
                icon: MessageSquare,
                iconColor: 'text-violet-500',
            },
            {
                label: 'Image Generation',
                href: '/image',
                description: 'AI image generation utility',
                icon: ImageIcon,
                iconColor: 'text-red-500',
            },
            {
                label: 'Music Generation',
                href: '/music',
                description: 'AI music generation utility',
                icon: Music4,
                iconColor: 'text-blue-500',
            },
            {
                label: 'Code',
                href: '/code',
                description: 'AI code generation utility',
                icon: Code2,
                iconColor: 'text-emerald-500',
            },
        ],
    },
    {
        title: 'Test Lab',
        links: [
            {
                label: 'Test Lab Index',
                href: '/tests',
                description: 'All 21 test pages — discovery through media & distribution',
                icon: FlaskConical,
                iconColor: 'text-cyan-500',
            },
        ],
    },
];

// ─── Per-campaign slug links ──────────────────────────────────────────────────

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
        iconColor: 'text-violet-500',
    },
    {
        label: 'Distribution',
        pattern: (slug) => `/dashboard/campaigns/${slug}/media/distribution`,
        description: 'Campaign social distribution dashboard',
        icon: Radio,
        iconColor: 'text-amber-500',
    },
    {
        label: 'Conversion / Leads',
        pattern: (slug) => `/dashboard/campaigns/${slug}/conversion`,
        description: 'Waitlist, lead events, and funnel summary',
        icon: TrendingUp,
        iconColor: 'text-emerald-500',
    },
    {
        label: 'Public Landing',
        pattern: (slug) => `/groups/${slug}`,
        description: 'Live public-facing campaign landing page',
        icon: Globe,
        iconColor: 'text-blue-500',
        external: true,
    },
    {
        label: 'Landing Preview',
        pattern: (slug) => `/tests/campaign-landing/${slug}`,
        description: 'Test/preview the campaign landing page with review controls',
        icon: FlaskConical,
        iconColor: 'text-cyan-500',
    },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

export default async function DashboardNavPage() {
    let campaigns: Campaign[] = [];
    try {
        campaigns = await scanAllCampaigns();
        campaigns.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
        // Non-fatal — render page without campaign slugs
    }

    return (
        <div className="px-6 py-8 max-w-5xl mx-auto space-y-10">
            {/* Header */}
            <div className="space-y-1">
                <h1 className="text-2xl font-bold text-gray-900">Dashboard Nav</h1>
                <p className="text-sm text-gray-500">
                    Quick links to all dashboard pages and campaign-specific routes.
                </p>
            </div>

            {/* Static groups */}
            {STATIC_GROUPS.map((group) => (
                <section key={group.title} className="space-y-3">
                    <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">
                            {group.title}
                        </h2>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {group.links.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:border-primary/40 hover:shadow-sm transition-all"
                            >
                                <div className="mt-0.5 rounded-lg bg-gray-50 p-2 border border-gray-100">
                                    <link.icon className={`h-4 w-4 ${link.iconColor}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-1">
                                        <span className="text-sm font-semibold text-gray-800 group-hover:text-primary">
                                            {link.label}
                                        </span>
                                        <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-primary shrink-0" />
                                    </div>
                                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
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
                <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">
                        Campaign Pages by Slug
                    </h2>
                    <span className="ml-auto text-xs text-gray-400">
                        {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {campaigns.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No campaigns found.</p>
                ) : (
                    <div className="space-y-6">
                        {campaigns.map((campaign) => (
                            <div
                                key={campaign.id}
                                className="rounded-xl border border-gray-200 bg-white overflow-hidden"
                            >
                                {/* Campaign header */}
                                <div className="flex items-start justify-between gap-4 px-5 py-4 bg-gray-50 border-b border-gray-200">
                                    <div className="space-y-0.5">
                                        <h3 className="text-sm font-bold text-gray-800">
                                            {campaign.name}
                                        </h3>
                                        <p className="text-xs font-mono text-gray-400">
                                            {campaign.id}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                        {campaign.status && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                                {campaign.status}
                                            </span>
                                        )}
                                        {campaign.targetDates && (
                                            <span className="text-[10px] text-gray-400">
                                                {campaign.targetDates}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Slug route links */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y divide-gray-100">
                                    {SLUG_ROUTES.map((route) => (
                                        <Link
                                            key={route.label}
                                            href={route.pattern(campaign.id)}
                                            target={route.external ? '_blank' : undefined}
                                            rel={route.external ? 'noopener noreferrer' : undefined}
                                            className="group flex flex-col gap-2 p-4 hover:bg-gray-50 transition-colors"
                                            title={route.description}
                                        >
                                            <div className="flex items-center justify-between">
                                                <route.icon className={`h-4 w-4 ${route.iconColor}`} />
                                                {route.external && (
                                                    <ArrowUpRight className="h-3 w-3 text-gray-300 group-hover:text-gray-500" />
                                                )}
                                            </div>
                                            <span className="text-xs font-semibold text-gray-700 group-hover:text-primary leading-tight">
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
