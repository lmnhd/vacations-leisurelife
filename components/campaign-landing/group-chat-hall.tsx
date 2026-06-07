'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { CampaignLandingViewModel } from '@/lib/campaigns/landing/view-model';
import type { GuestIdentity } from '@/components/campaign-landing/waitlist-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { alfa_slab_one, orbitron, prompt as promptFont, righteous } from '@/lib/fonts';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SystemKey = CampaignLandingViewModel['designSystem']['system'];

type TextScale = 'sm' | 'md' | 'lg';

const TEXT_SCALE_STORAGE_KEY = 'group-chat-hall.text-scale';

interface TextScaleTokens {
    bubble: string;
    bubblePad: string;
    threadGap: string;
    starterLabel: string;
    nameBadge: string;
    composeText: string;
    composeMinH: string;
}

const TEXT_SCALE_TOKENS: Record<TextScale, TextScaleTokens> = {
    sm: {
        bubble: 'text-[12.5px] leading-[1.55]',
        bubblePad: 'px-3 py-2',
        threadGap: 'gap-2.5',
        starterLabel: 'text-[9px]',
        nameBadge: 'text-[8.5px] px-1.5 py-0.5',
        composeText: 'text-[12.5px]',
        composeMinH: 'min-h-[72px]',
    },
    md: {
        bubble: 'text-[14px] leading-[1.6]',
        bubblePad: 'px-3.5 py-2.5',
        threadGap: 'gap-3',
        starterLabel: 'text-[10px]',
        nameBadge: 'text-[9px] px-2 py-0.5',
        composeText: 'text-[14px]',
        composeMinH: 'min-h-[88px]',
    },
    lg: {
        bubble: 'text-[15.5px] leading-[1.7]',
        bubblePad: 'px-4 py-3',
        threadGap: 'gap-3.5',
        starterLabel: 'text-[11px]',
        nameBadge: 'text-[10px] px-2 py-0.5',
        composeText: 'text-[15.5px]',
        composeMinH: 'min-h-[104px]',
    },
};

type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    displayName: string;
    content: string;
    createdAt: string;
    channel?: 'main' | 'ideas' | 'logistics' | 'meetups';
    isStarterMessage?: boolean;
};

type GuestIdeaItem = {
    id: string;
    text: string;
    guestName: string;
    submittedAt: string;
    likes: number;
    dislikes: number;
    likedBy: string[];
    dislikedBy: string[];
};

type ChatHistoryResponse = {
    success?: boolean;
    messages?: ChatMessage[];
    error?: string;
};

type ChatPostResponse = ChatHistoryResponse & {
    reply?: string;
};

interface ChatChannel {
    id: 'main' | 'ideas' | 'logistics' | 'meetups';
    label: string;
    hint: string;
}

interface ChannelSidebarSection {
    eyebrow: string;
    title: string;
    description: string;
    items: string[];
    factsTitle: string;
}

const CHANNELS: ChatChannel[] = [
    { id: 'main', label: '# voyage-main', hint: 'Everything goes here by default' },
    { id: 'ideas', label: '# ideas', hint: 'Onboard activities, get-togethers, projects' },
    { id: 'logistics', label: '# logistics', hint: 'Cabins, dates, pricing, booking' },
    { id: 'meetups', label: '# meetups', hint: 'Meet-ups + ports + plans' },
];

function buildChannelSidebarSection(
    landing: CampaignLandingViewModel,
    activeChannel: ChatChannel['id'],
): ChannelSidebarSection {
    const guestIdeas = landing.story.guestInvitations.slice(0, 4);
    const expectations = landing.story.whatToExpect.slice(0, 4);
    const logisticsItems = [
        `${landing.pricing.sourceLabel}: ${landing.pricing.startingPriceLabel}`,
        landing.pricing.detail,
        `${landing.threshold.joinedEntries} entries so far · ${landing.threshold.percentOfThreshold}% to launch`,
        'Use the form on this page to save your spot and get updates.',
    ];
    const meetupItems = [
        ...guestIdeas.slice(0, 2),
        ...expectations.slice(0, 2),
    ];

    switch (activeChannel) {
        case 'ideas':
            return {
                eyebrow: 'Idea board',
                title: 'What should we do?',
                description: 'Optional onboard moments and easy group energy.',
                items: guestIdeas,
                factsTitle: 'Channel cues',
            };
        case 'logistics':
            return {
                eyebrow: 'Logistics desk',
                title: 'Key trip details',
                description: 'Practical facts for booking and next steps.',
                items: logisticsItems,
                factsTitle: 'Voyage facts',
            };
        case 'meetups':
            return {
                eyebrow: 'Meetup board',
                title: 'How people may connect',
                description: 'Casual meetups, port plans, and low-pressure ways to join in.',
                items: meetupItems,
                factsTitle: 'Good to know',
            };
        case 'main':
        default:
            return {
                eyebrow: 'Idea board',
                title: 'What should we do?',
                description: 'Group-suggested onboard moments. The Conductor pins the strongest ones.',
                items: guestIdeas,
                factsTitle: 'Voyage facts',
            };
    }
}

function getComposePlaceholder(activeChannel: ChatChannel['id'], label: string): string {
    switch (activeChannel) {
        case 'ideas':
            return `Share an idea or ask about onboard fun (${label})...`;
        case 'logistics':
            return `Ask a trip question or booking detail (${label})...`;
        case 'meetups':
            return `Suggest a meetup or port-day plan (${label})...`;
        case 'main':
        default:
            return `Ask the Tour Conductor (${label})...`;
    }
}

function getComposeSendLabel(activeChannel: ChatChannel['id']): string {
    switch (activeChannel) {
        case 'ideas':
            return 'Send to ideas';
        case 'logistics':
            return 'Send to logistics';
        case 'meetups':
            return 'Send to meetups';
        case 'main':
        default:
            return 'Send to shared thread';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// System theming — single source of truth, not duplicated components
// ─────────────────────────────────────────────────────────────────────────────

interface ChatHallTheme {
    /** Outer wrapper — full-bleed, sets the room's mood. */
    wrapper: string;
    /** Header strip with channel name + presence. */
    header: string;
    /** Left rail (channel list, presence, pinned). */
    rail: string;
    /** Right rail (idea board). */
    aside: string;
    /** Center conversation panel. */
    panel: string;
    /** Compose surface at bottom. */
    compose: string;
    /** Single message bubble (assistant gets accent border via prop). */
    bubbleAssistant: string;
    bubbleGuest: string;
    bubbleStarter: string;
    /** Channel chip when active vs. inactive. */
    channelActive: string;
    channelInactive: string;
    /** Headline / display font for the room name. */
    displayFont: string;
    /** "Channel name" badge style. */
    badge: string;
    /** Idea card surface. */
    ideaCard: string;
    /** Pin item. */
    pinCard: string;
    /** Input + textarea theme. */
    input: string;
    /** Signup gate overlay surface. */
    gate: string;
    /** Decorative ambient color/texture. */
    ambient: string;
    /** Role labels: how to present "HOST" / "GUEST" badges. */
    hostBadge: string;
    guestBadge: string;
    /** Body text emphasis. */
    softText: string;
    softerText: string;
    /** Plate label of the room type ("THE GAME ROOM", "THE MAILROOM" etc.). */
    roomLabel: string;
}

function chatHallTheme(system: SystemKey, accentHex: string): ChatHallTheme {
    if (system === 'system_1_editorial') {
        return {
            wrapper: 'bg-[#f5f8f4] text-slate-950',
            header: 'border-b-[3px] border-teal-950 bg-[#f5f8f4]',
            rail: 'bg-white/90 border-r border-teal-950/20',
            aside: 'bg-white/90 border-l border-teal-950/20',
            panel: 'bg-[#dbeee7]',
            compose: 'border-t border-teal-950/20 bg-white/90',
            bubbleAssistant: 'bg-white/90 text-slate-950 border border-teal-950/20',
            bubbleGuest: 'bg-teal-950 text-white',
            bubbleStarter: 'bg-[#dbeee7] text-slate-950 border border-teal-950/25 italic',
            channelActive: 'bg-teal-950 text-white',
            channelInactive: 'text-slate-700 hover:bg-teal-100',
            displayFont: alfa_slab_one.className,
            badge: 'border border-teal-950/25 bg-white/90 text-slate-700',
            ideaCard: 'border border-teal-950/20 bg-white/90 text-slate-950',
            pinCard: 'border border-teal-950/20 bg-[#dbeee7] text-slate-950',
            input: 'border-teal-950/20 bg-white/90 text-slate-950 placeholder:text-slate-400',
            gate: 'border border-teal-950/25 bg-[#dbeee7] text-slate-950',
            ambient: 'rgba(15,83,77,0.16)',
            hostBadge: 'bg-teal-950 text-white',
            guestBadge: 'bg-teal-100 text-teal-950',
            softText: 'text-slate-700',
            softerText: 'text-teal-950/55',
            roomLabel: 'LETTERS TO THE EDITOR',
        };
    }
    if (system === 'system_2_nostalgia') {
        return {
            wrapper: 'bg-[#eef8f7] text-[#143d3b]',
            header: 'border-b border-cyan-950/25 bg-[#eef8f7]',
            rail: 'bg-white/88 border-r border-cyan-950/20',
            aside: 'bg-white/88 border-l border-cyan-950/20',
            panel: 'bg-[#d6f0ea]',
            compose: 'border-t border-cyan-950/20 bg-white/88',
            bubbleAssistant: 'bg-white/90 text-[#143d3b] border border-cyan-950/20',
            bubbleGuest: 'bg-cyan-950 text-white',
            bubbleStarter: 'bg-[#d6f0ea] text-[#143d3b] border border-cyan-950/25 italic',
            channelActive: 'bg-cyan-950 text-white',
            channelInactive: 'text-[#315f5a] hover:bg-cyan-100',
            displayFont: alfa_slab_one.className,
            badge: 'border border-cyan-950/25 bg-white/88 text-[#315f5a]',
            ideaCard: 'border border-cyan-950/20 bg-white/88 text-[#143d3b]',
            pinCard: 'border border-cyan-950/25 bg-[#d6f0ea] text-[#143d3b]',
            input: 'border-cyan-950/20 bg-white/90 text-[#143d3b] placeholder:text-cyan-950/35',
            gate: 'border border-cyan-950/25 bg-[#d6f0ea] text-[#143d3b]',
            ambient: 'rgba(8,91,101,0.16)',
            hostBadge: 'bg-cyan-950 text-white',
            guestBadge: 'bg-cyan-100 text-cyan-950',
            softText: 'text-[#315f5a]',
            softerText: 'text-[#48756f]',
            roomLabel: 'THE MAILROOM',
        };
    }
    if (system === 'system_3_zine') {
        return {
            wrapper: 'bg-[#fbf7ff] text-zinc-950',
            header: 'border-b-2 border-zinc-950 bg-[#fbf7ff]',
            rail: 'bg-white border-r-2 border-zinc-950',
            aside: 'bg-white border-l-2 border-zinc-950',
            panel: 'bg-[#e5fbff]',
            compose: 'border-t-2 border-zinc-950 bg-white',
            bubbleAssistant: 'bg-white text-zinc-950 border-2 border-zinc-950 shadow-[4px_4px_0_rgba(0,0,0,0.85)]',
            bubbleGuest: 'bg-zinc-950 text-white shadow-[4px_4px_0_rgba(0,0,0,0.85)]',
            bubbleStarter: 'bg-yellow-200 text-zinc-950 border-2 border-zinc-950 shadow-[4px_4px_0_rgba(0,0,0,0.85)]',
            channelActive: 'bg-zinc-950 text-white shadow-[3px_3px_0_rgba(0,0,0,0.85)]',
            channelInactive: 'border-2 border-zinc-950 bg-white text-zinc-950 hover:bg-[#e5fbff]',
            displayFont: orbitron.className,
            badge: 'border-2 border-zinc-950 bg-white text-zinc-950',
            ideaCard: 'border-2 border-zinc-950 bg-white text-zinc-950 shadow-[4px_4px_0_rgba(0,0,0,0.85)]',
            pinCard: 'border-2 border-zinc-950 bg-yellow-200 text-zinc-950 shadow-[4px_4px_0_rgba(0,0,0,0.85)]',
            input: 'border-2 border-zinc-950 bg-white text-zinc-950 placeholder:text-zinc-500',
            gate: 'border-2 border-zinc-950 bg-yellow-100 text-zinc-950 shadow-[6px_6px_0_rgba(0,0,0,0.85)]',
            ambient: 'rgba(0,0,0,0.1)',
            hostBadge: 'bg-zinc-950 text-white',
            guestBadge: 'bg-yellow-200 text-zinc-950 border border-zinc-950',
            softText: 'text-zinc-800',
            softerText: 'text-zinc-600',
            roomLabel: 'BACKSTAGE BULLETIN',
        };
    }
    if (system === 'system_5_broadsheet') {
        return {
            wrapper: 'bg-[#f4f1ea] text-black',
            header: 'border-b-[3px] border-black bg-[#f4f1ea]',
            rail: 'bg-white border-r-[3px] border-black',
            aside: 'bg-white border-l-[3px] border-black',
            panel: 'bg-[#e7e2d6]',
            compose: 'border-t-[3px] border-black bg-white',
            bubbleAssistant: 'bg-white text-black border-[3px] border-black',
            bubbleGuest: 'bg-black text-[#f4f1ea]',
            bubbleStarter: 'bg-[#ffe600] text-black border-[3px] border-black italic',
            channelActive: 'bg-black text-[#f4f1ea]',
            channelInactive: 'border-[3px] border-black bg-white text-black hover:bg-[#ffe600]',
            displayFont: righteous.className,
            badge: 'border-2 border-black bg-[#ffe600] text-black',
            ideaCard: 'border-[3px] border-black bg-white text-black',
            pinCard: 'border-[3px] border-black bg-[#ffe600] text-black',
            input: 'border-[3px] border-black bg-white text-black placeholder:text-neutral-500',
            gate: 'border-[3px] border-black bg-white text-black',
            ambient: 'rgba(0,0,0,0.06)',
            hostBadge: 'bg-black text-[#f4f1ea]',
            guestBadge: 'bg-[#ffe600] text-black border-2 border-black',
            softText: 'text-neutral-800',
            softerText: 'text-neutral-600',
            roomLabel: 'THE BULLETIN DESK',
        };
    }
    if (system === 'system_6_glass') {
        return {
            wrapper: 'bg-[#eaf1f8] text-slate-900',
            header: 'border-b border-white/50 bg-white/40 backdrop-blur-xl',
            rail: 'bg-white/40 border-r border-white/50 backdrop-blur-xl',
            aside: 'bg-white/40 border-l border-white/50 backdrop-blur-xl',
            panel: 'bg-white/30',
            compose: 'border-t border-white/50 bg-white/45 backdrop-blur-xl',
            bubbleAssistant: 'bg-white/55 text-slate-900 border border-white/60 backdrop-blur-md',
            bubbleGuest: 'bg-sky-600/85 text-white backdrop-blur-md',
            bubbleStarter: 'bg-white/40 text-slate-700 border border-white/50 italic backdrop-blur-md',
            channelActive: 'bg-sky-600/85 text-white backdrop-blur-md',
            channelInactive: 'text-slate-600 hover:bg-white/50',
            displayFont: promptFont.className,
            badge: 'border border-white/60 bg-white/50 text-slate-700 backdrop-blur-md',
            ideaCard: 'border border-white/60 bg-white/45 text-slate-900 backdrop-blur-md',
            pinCard: 'border border-white/60 bg-white/55 text-slate-900 backdrop-blur-md',
            input: 'border border-white/60 bg-white/50 text-slate-900 placeholder:text-slate-400 backdrop-blur-md',
            gate: 'border border-white/60 bg-white/50 text-slate-900 backdrop-blur-md',
            ambient: 'rgba(31,67,114,0.08)',
            hostBadge: 'bg-sky-600/85 text-white',
            guestBadge: 'bg-white/55 text-slate-700 border border-white/60',
            softText: 'text-slate-700',
            softerText: 'text-slate-500',
            roomLabel: 'THE CONCIERGE LOUNGE',
        };
    }
    return {
        wrapper: 'bg-[#08090d] text-white',
        header: 'border-b border-white/10 bg-[#0c0e14]',
        rail: 'bg-[#0a0c12] border-r border-white/10',
        aside: 'bg-[#0a0c12] border-l border-white/10',
        panel: 'bg-[#0d1018]',
        compose: 'border-t border-white/10 bg-[#0c0e14]',
        bubbleAssistant: 'bg-white/[0.06] text-white border border-white/10',
        bubbleGuest: 'bg-white text-[#08090d]',
        bubbleStarter: 'bg-white/[0.04] text-white/85 border border-white/15 italic',
        channelActive: 'bg-white text-[#08090d]',
        channelInactive: 'text-white/70 hover:bg-white/[0.05]',
        displayFont: '',
        badge: 'border border-white/15 bg-white/[0.05] text-white/75',
        ideaCard: 'border border-white/10 bg-white/[0.04] text-white',
        pinCard: 'border border-white/10 bg-white/[0.06] text-white',
        input: 'border-white/10 bg-black/30 text-white placeholder:text-white/40',
        gate: 'border border-white/15 bg-white/[0.06] text-white',
        ambient: 'rgba(255,255,255,0.04)',
        hostBadge: 'bg-white text-[#08090d]',
        guestBadge: 'bg-white/[0.08] text-white/80 border border-white/15',
        softText: 'text-white/75',
        softerText: 'text-white/45',
        roomLabel: 'GROUP CHAT HALL',
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ChannelRail({
    theme,
    accentHex,
    activeChannel,
    onChannelChange,
    activeMembers,
    landing,
}: {
    theme: ChatHallTheme;
    accentHex: string;
    activeChannel: ChatChannel['id'];
    onChannelChange: (id: ChatChannel['id']) => void;
    activeMembers: string[];
    landing: CampaignLandingViewModel;
}) {
    return (
        <aside className={`hidden lg:flex flex-col h-full overflow-y-auto ${theme.rail}`}>
            <div className="border-b border-current/10 p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.32em] opacity-50">{theme.roomLabel}</p>
                <p className={`${theme.displayFont} mt-2 text-xl font-bold leading-tight`}>{landing.title}</p>
                <p className={`mt-1 text-[11px] ${theme.softerText}`}>
                    {landing.threshold.percentOfThreshold}% to launch · {landing.threshold.joinedPassengers} guests
                </p>
            </div>

            <nav className="flex flex-col gap-1.5 p-4">
                <p className="px-2 pb-1 font-mono text-[9px] uppercase tracking-[0.32em] opacity-45">Channels</p>
                {CHANNELS.map((channel) => {
                    const isActive = channel.id === activeChannel;
                    return (
                        <button
                            key={channel.id}
                            type="button"
                            onClick={() => onChannelChange(channel.id)}
                            className={`flex flex-col items-start gap-0.5 rounded-none px-3 py-2 text-left text-sm transition-colors ${
                                isActive ? theme.channelActive : theme.channelInactive
                            }`}
                        >
                            <span className="font-mono text-[12px] font-bold">{channel.label}</span>
                            <span className="text-[10px] opacity-70">{channel.hint}</span>
                        </button>
                    );
                })}
            </nav>

            <div className="mt-2 border-t border-current/10 px-4 py-4">
                <p className="px-2 pb-2 font-mono text-[9px] uppercase tracking-[0.32em] opacity-45">Active now</p>
                <ul className="flex flex-col gap-2 px-2">
                    {activeMembers.length === 0 && (
                        <li className={`text-[11px] ${theme.softerText}`}>Be the first to speak.</li>
                    )}
                    {activeMembers.slice(0, 6).map((name) => (
                        <li key={name} className="flex items-center gap-2 text-[12px]">
                            <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ backgroundColor: accentHex }}
                            />
                            <span>{name}</span>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="mt-auto border-t border-current/10 px-4 py-4">
                <p className="px-2 pb-2 font-mono text-[9px] uppercase tracking-[0.32em] opacity-45">House rules</p>
                <ul className={`px-2 text-[11px] leading-5 ${theme.softerText}`}>
                    <li>· Ask anything cruise-related.</li>
                    <li>· Suggest activities — they go to ideas.</li>
                    <li>· Tour Conductor hosts the room.</li>
                    <li>· No payment happens here.</li>
                </ul>
            </div>
        </aside>
    );
}

function MessageThread({
    theme,
    accentHex,
    palette,
    messages,
    scrollRef,
    headline,
    activeChannel,
    backgroundImageUrl,
    textScale,
    isDarkSystem,
}: {
    theme: ChatHallTheme;
    accentHex: string;
    palette: CampaignLandingViewModel['designSystem']['palette'];
    messages: ChatMessage[];
    scrollRef: React.RefObject<HTMLDivElement>;
    headline: string;
    activeChannel: ChatChannel;
    backgroundImageUrl: string | null;
    textScale: TextScale;
    isDarkSystem: boolean;
}) {
    const tokens = TEXT_SCALE_TOKENS[textScale];
    // Darker overlay for the dark "modular" system so text stays legible; lighter
    // overlay on the light editorial/nostalgia/zine systems so the photo can breathe.
    const overlayGradient = isDarkSystem
        ? 'linear-gradient(180deg, rgba(8,9,13,0.78) 0%, rgba(8,9,13,0.84) 50%, rgba(8,9,13,0.92) 100%)'
        : 'linear-gradient(180deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.78) 100%)';
    return (
        <div className={`relative flex flex-1 min-h-0 ${theme.panel}`}>
            {backgroundImageUrl && (
                <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                    <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{
                            backgroundImage: `url(${backgroundImageUrl})`,
                            filter: 'blur(40px) saturate(1.25) brightness(0.92)',
                            transform: 'scale(1.15)',
                            opacity: isDarkSystem ? 0.55 : 0.45,
                        }}
                    />
                    <div className="absolute inset-0" style={{ background: overlayGradient }} />
                    {/* Accent halos — picked highlights echoed through the panel. */}
                    <div
                        className="absolute inset-0"
                        style={{
                            background: `radial-gradient(60% 40% at 12% 18%, ${accentHex}26 0%, transparent 60%), radial-gradient(50% 35% at 88% 82%, ${accentHex}1f 0%, transparent 65%)`,
                        }}
                    />
                </div>
            )}
            <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto px-5 py-6 md:px-8">
            <div className={`mx-auto flex w-full max-w-3xl flex-col ${tokens.threadGap}`}>
                <header className={`mb-2 border-b border-current/10 pb-3 ${theme.softText}`}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.32em]" style={{ color: palette.secondary, opacity: 0.85 }}>{activeChannel.label}</p>
                    <p className="mt-1 text-sm">{activeChannel.hint}</p>
                </header>
                {messages.map((item) => {
                    const isAssistant = item.role === 'assistant';
                    const bubble = item.isStarterMessage
                        ? theme.bubbleStarter
                        : isAssistant
                            ? theme.bubbleAssistant
                            : theme.bubbleGuest;
                    // Backdrop blur lets the hero image shimmer through assistant/starter
                    // bubbles on the dark system without sacrificing readability.
                    const bubbleExtra = backgroundImageUrl && isDarkSystem && !item.isStarterMessage && isAssistant
                        ? 'backdrop-blur-md shadow-[0_8px_28px_rgba(0,0,0,0.35)]'
                        : backgroundImageUrl && isDarkSystem && !isAssistant
                            ? 'shadow-[0_8px_24px_rgba(0,0,0,0.4)]'
                            : '';
                    return (
                        <div
                            key={item.id}
                            className={`flex flex-col gap-1.5 ${isAssistant ? 'items-start' : 'items-end'}`}
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    className={`inline-flex items-center font-bold uppercase tracking-[0.24em] ${tokens.nameBadge} ${
                                        isAssistant ? theme.hostBadge : theme.guestBadge
                                    }`}
                                    style={isAssistant ? { boxShadow: `0 0 0 1px ${accentHex}55, 0 0 12px ${accentHex}33` } : undefined}
                                >
                                    {isAssistant ? 'Host · Tour Conductor' : item.displayName}
                                </span>
                                {item.isStarterMessage && (
                                    <span
                                        className={`font-mono uppercase tracking-[0.22em] ${tokens.starterLabel}`}
                                        style={{ color: palette.secondary, opacity: 0.85 }}
                                    >
                                        starter
                                    </span>
                                )}
                            </div>
                            <div
                                className={`max-w-[80%] ${tokens.bubblePad} ${tokens.bubble} ${bubble} ${bubbleExtra}`}
                                style={isAssistant ? { borderLeftWidth: 3, borderLeftColor: accentHex } : undefined}
                            >
                                {item.content}
                            </div>
                        </div>
                    );
                })}
                {messages.length === 0 && (
                    <p className={`text-sm ${theme.softText}`}>The thread is quiet so far. Say hi to {headline}.</p>
                )}
            </div>
            </div>
        </div>
    );
}

function IdeaBoard({
    theme,
    accentHex,
    palette,
    landing,
    activeChannel,
    guestIdeas,
    guestToken,
    slug,
    onIdeaVoted,
}: {
    theme: ChatHallTheme;
    accentHex: string;
    palette: CampaignLandingViewModel['designSystem']['palette'];
    landing: CampaignLandingViewModel;
    activeChannel: ChatChannel['id'];
    guestIdeas: GuestIdeaItem[];
    guestToken: string | null;
    slug: string;
    onIdeaVoted: (ideas: GuestIdeaItem[]) => void;
}) {
    const section = useMemo(
        () => buildChannelSidebarSection(landing, activeChannel),
        [landing, activeChannel],
    );
    const seedIdeas = useMemo(
        () => section.items.map((text, i) => ({
            id: `seed-${i}`,
            text,
            author: 'Tour Conductor',
        })),
        [section.items],
    );

    // Local optimistic vote state: ideaId → 'like' | 'dislike' | null
    const [myVotes, setMyVotes] = useState<Record<string, 'like' | 'dislike' | null>>({});

    async function handleVote(ideaId: string, voteType: 'like' | 'dislike') {
        if (!guestToken) return;
        const prev = myVotes[ideaId] ?? null;
        const next = prev === voteType ? null : voteType;
        setMyVotes((v) => ({ ...v, [ideaId]: next }));
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/ideas/${ideaId}/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voteType, voterToken: guestToken }),
            });
            const data = await res.json() as { success?: boolean; idea?: GuestIdeaItem };
            if (res.ok && data.idea) {
                onIdeaVoted(
                    guestIdeas.map((i) => i.id === ideaId ? data.idea! : i),
                );
            }
        } catch {
            setMyVotes((v) => ({ ...v, [ideaId]: prev }));
        }
    }

    return (
        <aside className={`hidden xl:flex w-[300px] shrink-0 flex-col min-h-0 ${theme.aside}`}>
            <div className="border-b border-current/10 p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.32em] opacity-50">{section.eyebrow}</p>
                <p className={`${theme.displayFont} mt-2 text-lg font-bold leading-tight`}>{section.title}</p>
                <p className={`mt-1 text-[11px] ${theme.softerText}`}>
                    {section.description}
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {guestIdeas.length > 0 ? (
                    <>
                        <p className="px-1 pb-2 font-mono text-[9px] uppercase tracking-[0.32em] opacity-45">From guests</p>
                        <ul className="flex flex-col gap-2">
                            {guestIdeas.map((idea) => {
                                const myVote = myVotes[idea.id] ?? null;
                                return (
                                    <li key={idea.id} className={`p-3 ${theme.ideaCard}`}>
                                        <p className="mt-1 text-sm leading-5">{idea.text}</p>
                                        <div className="mt-2 flex items-center justify-between">
                                            <p className="text-[10px] font-mono opacity-45 truncate">{idea.guestName}</p>
                                            {guestToken ? (
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleVote(idea.id, 'like')}
                                                        className="flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 transition-opacity"
                                                        style={myVote === 'like' ? { color: accentHex } : { opacity: 0.5 }}
                                                        title="Like this idea"
                                                    >
                                                        👍 {idea.likes}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleVote(idea.id, 'dislike')}
                                                        className="flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 transition-opacity"
                                                        style={myVote === 'dislike' ? { color: '#ef4444' } : { opacity: 0.5 }}
                                                        title="Pass on this idea"
                                                    >
                                                        👎 {idea.dislikes}
                                                    </button>
                                                </div>
                                            ) : (
                                                <p className={`text-[10px] font-mono ${theme.softerText}`}>
                                                    👍 {idea.likes} · 👎 {idea.dislikes}
                                                </p>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                        {seedIdeas.length > 0 && (
                            <>
                                <p className="mt-5 px-1 pb-2 font-mono text-[9px] uppercase tracking-[0.32em] opacity-45">Pinned</p>
                                <ul className="flex flex-col gap-2">
                                    {seedIdeas.slice(0, 2).map((idea) => (
                                        <li key={idea.id} className={`p-3 ${theme.ideaCard}`}>
                                            <p className="text-[11px] font-mono uppercase tracking-[0.18em] opacity-55">📌 {idea.author}</p>
                                            <p className="mt-1 text-sm leading-5">{idea.text}</p>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </>
                ) : (
                    <>
                        <p className="px-1 pb-2 font-mono text-[9px] uppercase tracking-[0.32em] opacity-45">Pinned</p>
                        <ul className="flex flex-col gap-2">
                            {seedIdeas.map((idea) => (
                                <li key={idea.id} className={`p-3 ${theme.ideaCard}`}>
                                    <p className="text-[11px] font-mono uppercase tracking-[0.18em] opacity-55">📌 {idea.author}</p>
                                    <p className="mt-1 text-sm leading-5">{idea.text}</p>
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                <p className="mt-5 px-1 pb-2 font-mono text-[9px] uppercase tracking-[0.32em]" style={{ color: palette.primary, opacity: 0.85 }}>{section.factsTitle}</p>
                <ul className="flex flex-col gap-2">
                    {landing.facts.slice(0, 4).map((fact, i) => {
                        const labelColor = i % 2 === 0 ? palette.primary : palette.secondary;
                        return (
                            <li key={fact.label} className={`p-3 ${theme.pinCard}`}>
                                <p
                                    className="font-mono text-[9px] uppercase tracking-[0.32em]"
                                    style={{ color: labelColor }}
                                >
                                    {fact.label}
                                </p>
                                <p className="mt-1 text-sm font-bold leading-tight">{fact.value}</p>
                            </li>
                        );
                    })}
                </ul>

                <p className="mt-5 px-1 pb-2 font-mono text-[9px] uppercase tracking-[0.32em] opacity-45">Group status</p>
                <div className={`p-3 ${theme.pinCard}`}>
                    <div className="flex items-baseline justify-between">
                        <span className="text-2xl font-black" style={{ color: accentHex }}>
                            {landing.threshold.percentOfThreshold}%
                        </span>
                        <span className={`text-[10px] uppercase tracking-[0.24em] ${theme.softerText}`}>
                            of {landing.threshold.requiredCabins} cabins
                        </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden bg-current/10">
                        <div
                            className="h-full transition-all duration-700"
                            style={{ width: `${landing.threshold.percentOfThreshold}%`, backgroundColor: accentHex }}
                        />
                    </div>
                    <p className={`mt-2 text-[11px] leading-4 ${theme.softerText}`}>
                        {landing.threshold.joinedPassengers} guests · {landing.threshold.joinedEntries} entries
                    </p>
                </div>
            </div>
        </aside>
    );
}

function ScrollToFormCTA({
    theme,
    accentHex,
    landing,
    pendingVerification = false,
    onResumeGuest,
}: {
    theme: ChatHallTheme;
    accentHex: string;
    landing: CampaignLandingViewModel;
    pendingVerification?: boolean;
    onResumeGuest?: (identity: GuestIdentity) => void;
}) {
    const [resumeEmail, setResumeEmail] = useState('');
    const [resumeLoading, setResumeLoading] = useState(false);
    const [resumeError, setResumeError] = useState('');

    function scrollToForm() {
        document.getElementById('save-your-place')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function handleResume(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const email = resumeEmail.trim();
        if (!email || resumeLoading) return;

        setResumeLoading(true);
        setResumeError('');

        try {
            const response = await fetch(`/api/groups/campaign/${landing.slug}/resume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const payload = await response.json() as {
                success?: boolean;
                error?: string;
                guestToken?: string;
                displayName?: string;
                emailVerified?: boolean;
            };

            if (!response.ok || !payload.success || !payload.guestToken || !payload.displayName) {
                throw new Error(payload.error ?? 'We could not find an active chat identity for that email.');
            }

            onResumeGuest?.({
                guestToken: payload.guestToken,
                displayName: payload.displayName,
                emailVerified: payload.emailVerified === true,
            });
        } catch (error) {
            setResumeError(error instanceof Error ? error.message : 'We could not find an active chat identity for that email.');
        } finally {
            setResumeLoading(false);
        }
    }

    return (
        <div className={`grid gap-4 p-4 md:p-5 ${theme.gate}`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="max-w-xl">
                    <p className="font-mono text-[10px] uppercase tracking-[0.32em] opacity-65">Join the room</p>
                    <p className={`${theme.displayFont} mt-1 text-lg font-bold leading-tight`}>
                        {pendingVerification ? 'Check your inbox to unlock chat.' : 'Join the list.'}
                    </p>
                    <p className="mt-2 text-sm leading-6 opacity-80">
                        {pendingVerification
                            ? 'Your signup is saved. Click the verification link we emailed you before posting here.'
                            : 'It only takes a moment.'}
                    </p>
                </div>
                <Button
                    type="button"
                    onClick={scrollToForm}
                    className="shrink-0 rounded-none px-6 py-5 text-sm font-bold"
                    style={{ backgroundColor: accentHex, color: '#0f172a' }}
                >
                    {pendingVerification ? 'Back to signup' : 'Join the list'}
                </Button>
            </div>

            <form onSubmit={handleResume} className="grid gap-3 rounded-none border border-current/15 bg-black/10 p-4">
                <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
                    <div className="grid gap-2">
                        <label className="font-mono text-[10px] uppercase tracking-[0.28em] opacity-65" htmlFor="resume-email">
                            Already joined?
                        </label>
                        <Input
                            id="resume-email"
                            type="email"
                            value={resumeEmail}
                            onChange={(event) => setResumeEmail(event.target.value)}
                            placeholder="Enter the email you used"
                            className={theme.input}
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={resumeLoading || !resumeEmail.trim()}
                        className="rounded-none px-5 py-5 text-sm font-bold"
                        style={{ backgroundColor: accentHex, color: '#0f172a' }}
                    >
                        {resumeLoading ? 'Checking...' : 'Resume chat'}
                    </Button>
                </div>
                <div className="flex flex-col gap-2">
                    <p className="text-xs leading-6 opacity-80">
                        If that email is on file and verified, we will restore your chat access in this browser.
                    </p>
                    {resumeError ? <p className="text-xs font-semibold text-rose-300">{resumeError}</p> : null}
                </div>
            </form>
        </div>
    );
}

function ComposeBox({
    theme,
    accentHex,
    message,
    setMessage,
    sending,
    error,
    onSend,
    activeChannel,
    textScale,
}: {
    theme: ChatHallTheme;
    accentHex: string;
    message: string;
    setMessage: (value: string) => void;
    sending: boolean;
    error: string;
    onSend: () => void;
    activeChannel: ChatChannel;
    textScale: TextScale;
}) {
    const tokens = TEXT_SCALE_TOKENS[textScale];
    return (
        <div className={`p-4 md:p-5 ${theme.compose}`}>
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.24em]">
                    <span className="font-mono opacity-55">Posting to {activeChannel.label}</span>
                    <span className="font-mono opacity-45">⌘/Ctrl + Enter to send</span>
                </div>
                <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={getComposePlaceholder(activeChannel.id, activeChannel.label)}
                    className={`rounded-none ${tokens.composeMinH} ${tokens.composeText} ${theme.input}`}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            onSend();
                        }
                    }}
                />
                {error && <p className="text-xs text-red-500">{error}</p>}
                <div className="flex items-center justify-end gap-2">
                    <Button
                    type="button"
                    disabled={sending || !message.trim()}
                    onClick={onSend}
                    className="rounded-none px-5 py-3 text-sm font-bold"
                    style={{ backgroundColor: accentHex, color: '#0f172a' }}
                >
                    {sending ? 'Conductor is writing...' : getComposeSendLabel(activeChannel.id)}
                </Button>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface GroupChatHallProps {
    landing: CampaignLandingViewModel;
    /** Populated by GuestPortal once the guest has submitted the waitlist form. Unlocks compose after verification. */
    guestIdentity: GuestIdentity | null;
    onGuestIdentityRestored?: (identity: GuestIdentity) => void;
}

function fallbackMessages(landing: CampaignLandingViewModel): ChatMessage[] {
    return landing.designSystem.chat.starterConversation.map((turn, i) => ({
        id: `${landing.slug}-starter-${i}`,
        role: turn.role,
        displayName: turn.role === 'assistant' ? landing.designSystem.chat.title : 'guest_123',
        content: turn.content,
        channel: turn.channel ?? 'main',
        createdAt: new Date(0).toISOString(),
        isStarterMessage: true,
    }));
}

export function GroupChatHall({ landing, guestIdentity, onGuestIdentityRestored }: GroupChatHallProps) {
    const theme = chatHallTheme(landing.designSystem.system, landing.designSystem.accentHex);
    const accentHex = landing.designSystem.accentHex;
    const palette = landing.designSystem.palette;
    const isDarkSystem = landing.designSystem.system === 'system_4_modular';
    const backgroundImageUrl = landing.imagePlacements.chatBackdrop?.url
        ?? landing.heroImage?.url
        ?? landing.galleryImages[0]?.url
        ?? null;
    const [messages, setMessages] = useState<ChatMessage[]>(() => fallbackMessages(landing));
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [activeChannel, setActiveChannel] = useState<ChatChannel['id']>('main');
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [guestIdeas, setGuestIdeas] = useState<GuestIdeaItem[]>([]);
    const [textScale, setTextScale] = useState<TextScale>('sm');

    // Restore the user's preferred text size across visits.
    useEffect(() => {
        try {
            const saved = window.localStorage.getItem(TEXT_SCALE_STORAGE_KEY);
            if (saved === 'sm' || saved === 'md' || saved === 'lg') setTextScale(saved);
        } catch {
            // localStorage unavailable — keep the small default.
        }
    }, []);

    function changeTextScale(next: TextScale) {
        setTextScale(next);
        try {
            window.localStorage.setItem(TEXT_SCALE_STORAGE_KEY, next);
        } catch {
            // Best-effort persistence.
        }
    }

    const ideasEndpoint = `/api/groups/campaign/${landing.slug}/ideas`;

    const isUnlocked = guestIdentity?.emailVerified === true;
    // The non-null assertion is a workaround for React 18 vs 19 ref typing —
    // RefObject<T> requires .current: T but we know the ref starts null.
    const scrollRef = useRef<HTMLDivElement>(null!);

    useEffect(() => {
        let alive = true;
        async function loadHistory() {
            try {
                const response = await fetch(landing.designSystem.chat.endpoint, { cache: 'no-store' });
                const data = await response.json() as ChatHistoryResponse;
                if (!alive) return;
                if (response.ok && data.messages?.length) {
                    setMessages(data.messages);
                }
            } catch {
                // Seeded local conversation still useful if persistence is unavailable.
            }
        }
        void loadHistory();
        const interval = window.setInterval(loadHistory, 15000);
        return () => {
            alive = false;
            window.clearInterval(interval);
        };
    }, [landing.designSystem.chat.endpoint]);

    useEffect(() => {
        let alive = true;
        async function loadIdeas() {
            try {
                const res = await fetch(ideasEndpoint, { cache: 'no-store' });
                const data = await res.json() as { success?: boolean; ideas?: GuestIdeaItem[] };
                if (alive && res.ok && Array.isArray(data.ideas)) {
                    setGuestIdeas(data.ideas);
                }
            } catch {
                // Non-fatal — board shows seed ideas as fallback.
            }
        }
        void loadIdeas();
        const interval = window.setInterval(loadIdeas, 20000);
        return () => {
            alive = false;
            window.clearInterval(interval);
        };
    }, [ideasEndpoint]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, activeChannel]);

    const activeChannelConfig = useMemo(
        () => CHANNELS.find((c) => c.id === activeChannel) ?? CHANNELS[0],
        [activeChannel],
    );
    const sidebarSection = useMemo(
        () => buildChannelSidebarSection(landing, activeChannel),
        [landing, activeChannel],
    );

    const visibleMessages = useMemo(
        () => messages.filter((item) => (item.channel ?? 'main') === activeChannel),
        [messages, activeChannel],
    );

    // "Active now" presence — derive from recent guest message authors so the
    // rail doesn't sit empty before websockets are added.
    const activeMembers = useMemo(() => {
        const seen = new Set<string>();
        const list: string[] = [];
        const recent = messages.slice(-12).reverse();
        for (const m of recent) {
            if (m.isStarterMessage) continue;
            const name = m.role === 'assistant' ? 'Tour Conductor' : m.displayName;
            if (seen.has(name)) continue;
            seen.add(name);
            list.push(name);
            if (list.length >= 6) break;
        }
        if (list.length === 0) {
            list.push('Tour Conductor');
        }
        return list;
    }, [messages]);

    async function sendMessage() {
        const trimmed = message.trim();
        if (!trimmed || isPending || !isUnlocked || !guestIdentity) return;

        const optimistic: ChatMessage = {
            id: `local-${Date.now()}`,
            role: 'user',
            displayName: guestIdentity.displayName,
            content: trimmed,
            channel: activeChannel,
            createdAt: new Date().toISOString(),
        };

        setMessage('');
        setError('');
        setMessages((current) => [...current, optimistic]);

        startTransition(async () => {
            try {
                const response = await fetch(landing.designSystem.chat.endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: trimmed,
                        guestToken: guestIdentity.guestToken,
                        displayName: guestIdentity.displayName,
                        channel: activeChannel,
                    }),
                });
                const data = await response.json() as ChatPostResponse;
                if (!response.ok) {
                    throw new Error(data.error ?? 'The Tour Conductor could not reply right now.');
                }
                if (data.messages?.length) {
                    setMessages(data.messages);
                }
                if (activeChannel === 'ideas') {
                    // Delay to let extraction run server-side before polling.
                    setTimeout(() => {
                        fetch(ideasEndpoint, { cache: 'no-store' })
                            .then((r) => r.json())
                            .then((d: { success?: boolean; ideas?: GuestIdeaItem[] }) => {
                                if (Array.isArray(d.ideas)) setGuestIdeas(d.ideas);
                            })
                            .catch(() => {});
                    }, 3000);
                }
            } catch (sendError) {
                setError(sendError instanceof Error ? sendError.message : 'The Tour Conductor could not reply right now.');
            }
        });
    }

    return (
        <section
            id="group-chat-hall"
            className={`${promptFont.className} relative w-full ${theme.wrapper}`}
        >
            {/* Header strip — full bleed */}
            <div className={theme.header}>
                <div className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-end md:justify-between md:px-8 md:py-5">
                    <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.32em] opacity-55">{theme.roomLabel}</p>
                        <h2 className={`${theme.displayFont} mt-1 text-3xl font-black leading-[0.95] md:text-5xl`}>
                            {landing.title}
                            <span className="ml-3 align-middle text-base opacity-50">/ chat</span>
                        </h2>
                        <p className={`mt-2 text-sm ${theme.softText}`}>
                            Shared room · {landing.threshold.joinedPassengers} guests are here · the Tour Conductor hosts.
                            New visitors can read everything before joining.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <span
                            className={`inline-flex items-center gap-2 border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.28em] ${theme.badge}`}
                        >
                            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: accentHex }} />
                            {landing.threshold.percentOfThreshold}% to launch
                        </span>
                        <span className={`inline-flex items-center border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.28em] ${theme.badge}`}>
                            {activeMembers.length} active now
                        </span>
                        <div
                            role="group"
                            aria-label="Chat text size"
                            className={`inline-flex items-center border font-mono text-[10px] uppercase tracking-[0.28em] ${theme.badge}`}
                        >
                            {(['sm', 'md', 'lg'] as const).map((size, idx) => {
                                const active = textScale === size;
                                const label = size === 'sm' ? 'A' : size === 'md' ? 'A' : 'A';
                                const sizeClass = size === 'sm' ? 'text-[10px]' : size === 'md' ? 'text-[12px]' : 'text-[14px]';
                                return (
                                    <button
                                        key={size}
                                        type="button"
                                        onClick={() => changeTextScale(size)}
                                        aria-pressed={active}
                                        aria-label={`Text size ${size === 'sm' ? 'small' : size === 'md' ? 'medium' : 'large'}`}
                                        className={`px-2.5 py-1 transition-colors ${sizeClass} ${idx > 0 ? 'border-l border-current/15' : ''} ${active ? '' : 'opacity-55 hover:opacity-90'}`}
                                        style={active ? { backgroundColor: accentHex, color: '#0f172a' } : undefined}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Desktop: three-column hall (lg+) ─────────────────────── */}
            <div
                className="hidden lg:flex w-full overflow-hidden"
                style={{ height: 'calc(100vh - 180px)' }}
            >
                {/* Left rail */}
                <div className="w-[260px] shrink-0">
                    <ChannelRail
                        theme={theme}
                        accentHex={accentHex}
                        activeChannel={activeChannel}
                        onChannelChange={setActiveChannel}
                        activeMembers={activeMembers}
                        landing={landing}
                    />
                </div>

                {/* Center conversation */}
                <div className="flex min-w-0 flex-1 flex-col">
                    <MessageThread
                        theme={theme}
                        accentHex={accentHex}
                        messages={visibleMessages}
                        scrollRef={scrollRef}
                        headline={landing.designSystem.chat.title}
                        activeChannel={activeChannelConfig}
                        backgroundImageUrl={backgroundImageUrl}
                        textScale={textScale}
                        isDarkSystem={isDarkSystem}
                        palette={palette}
                    />
                    {!isUnlocked ? (
                        <ScrollToFormCTA
                            theme={theme}
                            accentHex={accentHex}
                            landing={landing}
                            pendingVerification={guestIdentity !== null && !guestIdentity.emailVerified}
                            onResumeGuest={onGuestIdentityRestored}
                        />
                    ) : (
                        <ComposeBox
                            theme={theme}
                            accentHex={accentHex}
                            message={message}
                            setMessage={setMessage}
                            sending={isPending}
                            error={error}
                            onSend={sendMessage}
                            activeChannel={activeChannelConfig}
                            textScale={textScale}
                        />
                    )}
                </div>

                {/* Right rail — idea board */}
                <IdeaBoard
                    theme={theme}
                    accentHex={accentHex}
                    palette={palette}
                    landing={landing}
                    activeChannel={activeChannel}
                    guestIdeas={guestIdeas}
                    guestToken={guestIdentity?.guestToken ?? null}
                    slug={landing.slug}
                    onIdeaVoted={setGuestIdeas}
                />
            </div>

            {/* ── Mobile: full-width single column (< lg) ──────────────── */}
            <div
                className="flex lg:hidden w-full flex-col overflow-hidden"
                style={{ height: 'calc(100vh - 160px)' }}
            >
                <MessageThread
                    theme={theme}
                    accentHex={accentHex}
                    messages={visibleMessages}
                    scrollRef={scrollRef}
                    headline={landing.designSystem.chat.title}
                    activeChannel={activeChannelConfig}
                    backgroundImageUrl={backgroundImageUrl}
                    textScale={textScale}
                    isDarkSystem={isDarkSystem}
                    palette={palette}
                />
                {!isUnlocked ? (
                    <ScrollToFormCTA
                        theme={theme}
                        accentHex={accentHex}
                        landing={landing}
                        pendingVerification={guestIdentity !== null && !guestIdentity.emailVerified}
                        onResumeGuest={onGuestIdentityRestored}
                    />
                ) : (
                    <ComposeBox
                        theme={theme}
                        accentHex={accentHex}
                        message={message}
                        setMessage={setMessage}
                        sending={isPending}
                        error={error}
                        onSend={sendMessage}
                        activeChannel={activeChannelConfig}
                        textScale={textScale}
                    />
                )}

                {/* Floating drawer toggle button */}
                <div className="sticky bottom-4 z-30 flex justify-start px-4 py-2">
                    <button
                        type="button"
                        onClick={() => setDrawerOpen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.22em] shadow-lg"
                        style={{ backgroundColor: accentHex, color: '#0f172a' }}
                    >
                        <span>☰</span>
                        <span>Channels · Info</span>
                    </button>
                </div>
            </div>

            {/* ── Mobile drawer overlay ────────────────────────────────── */}
            {drawerOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                        onClick={() => setDrawerOpen(false)}
                    />
                    {/* Drawer panel — slides in from left */}
                    <div
                        className={`fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-sm flex-col overflow-y-auto shadow-2xl lg:hidden ${theme.rail}`}
                    >
                        {/* Drawer header */}
                        <div className={`flex items-center justify-between border-b border-current/10 px-5 py-4 ${theme.header}`}>
                            <div>
                                <p className="font-mono text-[10px] uppercase tracking-[0.32em] opacity-50">{theme.roomLabel}</p>
                                <p className={`${theme.displayFont} mt-1 text-lg font-bold leading-tight`}>{landing.title}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDrawerOpen(false)}
                                className="flex h-8 w-8 items-center justify-center text-lg opacity-60 hover:opacity-100"
                                aria-label="Close"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Channel list */}
                        <nav className="flex flex-col gap-1.5 p-4">
                            <p className="px-2 pb-1 font-mono text-[9px] uppercase tracking-[0.32em] opacity-45">Channels</p>
                            {CHANNELS.map((channel) => {
                                const isActive = channel.id === activeChannel;
                                return (
                                    <button
                                        key={channel.id}
                                        type="button"
                                        onClick={() => { setActiveChannel(channel.id); setDrawerOpen(false); }}
                                        className={`flex flex-col items-start gap-0.5 rounded-none px-3 py-2.5 text-left text-sm transition-colors ${
                                            isActive ? theme.channelActive : theme.channelInactive
                                        }`}
                                    >
                                        <span className="font-mono text-[12px] font-bold">{channel.label}</span>
                                        <span className="text-[10px] opacity-70">{channel.hint}</span>
                                    </button>
                                );
                            })}
                        </nav>

                        {/* Active members */}
                        <div className="border-t border-current/10 px-4 py-4">
                            <p className="px-2 pb-2 font-mono text-[9px] uppercase tracking-[0.32em] opacity-45">Active now</p>
                            <ul className="flex flex-col gap-2 px-2">
                                {activeMembers.map((name) => (
                                    <li key={name} className="flex items-center gap-2 text-[12px]">
                                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: accentHex }} />
                                        <span>{name}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Pinned ideas + voyage facts */}
                        <div className="border-t border-current/10 px-4 py-4">
                            <p className="px-1 pb-2 font-mono text-[9px] uppercase tracking-[0.32em] opacity-45">📌 {sidebarSection.eyebrow}</p>
                            <ul className="flex flex-col gap-2">
                                {sidebarSection.items.slice(0, 3).map((text, i) => (
                                    <li key={i} className={`p-3 ${theme.ideaCard}`}>
                                        <p className="text-sm leading-5">{text}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="border-t border-current/10 px-4 py-4">
                            <p className="px-1 pb-2 font-mono text-[9px] uppercase tracking-[0.32em] opacity-45">{sidebarSection.factsTitle}</p>
                            <ul className="flex flex-col gap-2">
                                {landing.facts.slice(0, 4).map((fact) => (
                                    <li key={fact.label} className={`p-3 ${theme.pinCard}`}>
                                        <p className="font-mono text-[9px] uppercase tracking-[0.32em]" style={{ color: accentHex }}>{fact.label}</p>
                                        <p className="mt-1 text-sm font-bold">{fact.value}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Group status */}
                        <div className="border-t border-current/10 px-4 py-4">
                            <div className={`p-3 ${theme.pinCard}`}>
                                <div className="flex items-baseline justify-between">
                                    <span className="text-2xl font-black" style={{ color: accentHex }}>
                                        {landing.threshold.percentOfThreshold}%
                                    </span>
                                    <span className={`text-[10px] uppercase tracking-[0.22em] ${theme.softerText}`}>
                                        of {landing.threshold.requiredCabins} cabins
                                    </span>
                                </div>
                                <div className="mt-2 h-1.5 w-full overflow-hidden bg-current/10">
                                    <div
                                        className="h-full"
                                        style={{ width: `${landing.threshold.percentOfThreshold}%`, backgroundColor: accentHex }}
                                    />
                                </div>
                                <p className={`mt-1.5 text-[11px] ${theme.softerText}`}>
                                    {landing.threshold.joinedPassengers} guests · {landing.threshold.joinedEntries} entries
                                </p>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </section>
    );
}
