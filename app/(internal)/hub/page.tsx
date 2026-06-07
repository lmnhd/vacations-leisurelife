import Link from 'next/link';
import { CampaignBrowser } from './campaign-browser';
import { scanAllCampaigns } from '@/lib/campaigns/campaign-store';
import type { Campaign } from '@/lib/campaigns/types';
import {
    BadgeDollarSign,
    ChevronRight,
    Code2,
    FlaskConical,
    Globe,
    ImageIcon,
    LayoutDashboard,
    MessageSquare,
    Music4,
    Newspaper,
    PartyPopper,
    Search,
} from 'lucide-react';
import type { ElementType } from 'react';

interface StaticLink {
    label: string;
    href: string;
    description: string;
    icon: ElementType;
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
                description: 'Main customer dashboard and cruise search entry point',
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
                description: 'Live RSS feeds from major cruise lines',
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
                description: 'Internal test pages from discovery through media and distribution',
                icon: FlaskConical,
                iconColor: 'text-cyan-400',
                bgColor: 'bg-cyan-500/10',
            },
        ],
    },
];

export const dynamic = 'force-dynamic';

export default async function HubPage() {
    let campaigns: Campaign[] = [];
    try {
        campaigns = await scanAllCampaigns();
        campaigns.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
        // Non-fatal: the static hub should remain usable if campaign storage is unavailable.
    }

    return (
        <div className="mx-auto max-w-6xl space-y-10 px-6 py-10">
            <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight text-white">Internal Hub</h1>
                <p className="text-sm text-slate-400">
                    Staff-only nav. {campaigns.length} campaign record{campaigns.length !== 1 ? 's' : ''} loaded.
                </p>
            </div>

            {STATIC_GROUPS.map((group) => (
                <section key={group.title} className="space-y-3">
                    <div className="flex items-center gap-2 border-b border-white/5 pb-1">
                        <h2 className={`text-xs font-semibold uppercase tracking-widest ${group.color}`}>
                            {group.title}
                        </h2>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {group.links.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`group flex items-start gap-3 rounded-xl border ${group.borderColor} bg-slate-900/60 p-4 transition-colors hover:bg-slate-800/70`}
                            >
                                <div className={`mt-0.5 rounded-lg ${link.bgColor} p-2`}>
                                    <link.icon className={`h-4 w-4 ${link.iconColor}`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1">
                                        <span className="text-sm font-semibold text-slate-200 group-hover:text-white">
                                            {link.label}
                                        </span>
                                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-600 group-hover:text-slate-400" />
                                    </div>
                                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
                                        {link.description}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            ))}

            <CampaignBrowser campaigns={campaigns} />
        </div>
    );
}
