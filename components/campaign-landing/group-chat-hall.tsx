'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { CampaignLandingViewModel } from '@/lib/campaigns/landing/view-model';
import type { GuestIdentity } from '@/components/campaign-landing/waitlist-form';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { alfa_slab_one, orbitron, prompt as promptFont } from '@/lib/fonts';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SystemKey = CampaignLandingViewModel['designSystem']['system'];

type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    displayName: string;
    content: string;
    createdAt: string;
    channel?: 'main' | 'ideas' | 'logistics' | 'meetups';
    isStarterMessage?: boolean;
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
            wrapper: 'bg-[#f2ead8] text-stone-950',
            header: 'border-b-[3px] border-stone-950 bg-[#f2ead8]',
            rail: 'bg-[#fff8ea] border-r border-stone-300',
            aside: 'bg-[#fff8ea] border-l border-stone-300',
            panel: 'bg-[#f6efdc]',
            compose: 'border-t border-stone-300 bg-[#fff8ea]',
            bubbleAssistant: 'bg-[#fff8ea] text-stone-950 border border-stone-300',
            bubbleGuest: 'bg-stone-950 text-[#fff8ea]',
            bubbleStarter: 'bg-[#ebe1c9] text-stone-950 border border-stone-400 italic',
            channelActive: 'bg-stone-950 text-[#fff8ea]',
            channelInactive: 'text-stone-700 hover:bg-stone-200',
            displayFont: alfa_slab_one.className,
            badge: 'border border-stone-400 bg-[#fff8ea] text-stone-700',
            ideaCard: 'border border-stone-300 bg-[#fff8ea] text-stone-950',
            pinCard: 'border border-stone-300 bg-[#ebe1c9] text-stone-950',
            input: 'border-stone-300 bg-[#fff8ea] text-stone-950 placeholder:text-stone-400',
            gate: 'border border-stone-400 bg-[#ebe1c9] text-stone-950',
            ambient: 'rgba(196,142,72,0.12)',
            hostBadge: 'bg-stone-950 text-[#fff8ea]',
            guestBadge: 'bg-stone-300 text-stone-800',
            softText: 'text-stone-700',
            softerText: 'text-stone-500',
            roomLabel: 'LETTERS TO THE EDITOR',
        };
    }
    if (system === 'system_2_nostalgia') {
        return {
            wrapper: 'bg-[#f6e4bf] text-amber-950',
            header: 'border-b border-amber-900/30 bg-[#f6e4bf]',
            rail: 'bg-[#fff8e8] border-r border-amber-900/25',
            aside: 'bg-[#fff8e8] border-l border-amber-900/25',
            panel: 'bg-[#f1d9a8]',
            compose: 'border-t border-amber-900/25 bg-[#fff8e8]',
            bubbleAssistant: 'bg-[#fff8e8] text-amber-950 border border-amber-900/25',
            bubbleGuest: 'bg-amber-950 text-[#fff8e8]',
            bubbleStarter: 'bg-[#efd9a8] text-amber-950 border border-amber-900/40 italic',
            channelActive: 'bg-amber-950 text-[#fff8e8]',
            channelInactive: 'text-amber-900/80 hover:bg-amber-100',
            displayFont: alfa_slab_one.className,
            badge: 'border border-amber-900/30 bg-[#fff8e8] text-amber-900/80',
            ideaCard: 'border border-amber-900/25 bg-[#fff8e8] text-amber-950',
            pinCard: 'border border-amber-900/30 bg-[#efd9a8] text-amber-950',
            input: 'border-amber-900/25 bg-[#fff3d6] text-amber-950 placeholder:text-amber-900/40',
            gate: 'border border-amber-900/30 bg-[#efd9a8] text-amber-950',
            ambient: 'rgba(120,73,24,0.14)',
            hostBadge: 'bg-amber-950 text-[#fff8e8]',
            guestBadge: 'bg-amber-200 text-amber-900',
            softText: 'text-amber-900/80',
            softerText: 'text-amber-900/55',
            roomLabel: 'THE MAILROOM',
        };
    }
    if (system === 'system_3_zine') {
        return {
            wrapper: 'bg-[#f3ead5] text-zinc-950',
            header: 'border-b-2 border-zinc-950 bg-[#f3ead5]',
            rail: 'bg-[#fff9e8] border-r-2 border-zinc-950',
            aside: 'bg-[#fff9e8] border-l-2 border-zinc-950',
            panel: 'bg-[#eadfc1]',
            compose: 'border-t-2 border-zinc-950 bg-[#fff9e8]',
            bubbleAssistant: 'bg-[#fff9e8] text-zinc-950 border-2 border-zinc-950 shadow-[4px_4px_0_rgba(0,0,0,0.85)]',
            bubbleGuest: 'bg-zinc-950 text-[#fff9e8] shadow-[4px_4px_0_rgba(0,0,0,0.85)]',
            bubbleStarter: 'bg-yellow-200 text-zinc-950 border-2 border-zinc-950 shadow-[4px_4px_0_rgba(0,0,0,0.85)]',
            channelActive: 'bg-zinc-950 text-[#fff9e8] shadow-[3px_3px_0_rgba(0,0,0,0.85)]',
            channelInactive: 'border-2 border-zinc-950 bg-[#fff9e8] text-zinc-950 hover:bg-yellow-100',
            displayFont: orbitron.className,
            badge: 'border-2 border-zinc-950 bg-[#fff9e8] text-zinc-950',
            ideaCard: 'border-2 border-zinc-950 bg-[#fff9e8] text-zinc-950 shadow-[4px_4px_0_rgba(0,0,0,0.85)]',
            pinCard: 'border-2 border-zinc-950 bg-yellow-200 text-zinc-950 shadow-[4px_4px_0_rgba(0,0,0,0.85)]',
            input: 'border-2 border-zinc-950 bg-[#fff9e8] text-zinc-950 placeholder:text-zinc-500',
            gate: 'border-2 border-zinc-950 bg-yellow-100 text-zinc-950 shadow-[6px_6px_0_rgba(0,0,0,0.85)]',
            ambient: 'rgba(0,0,0,0.1)',
            hostBadge: 'bg-zinc-950 text-[#fff9e8]',
            guestBadge: 'bg-yellow-200 text-zinc-950 border border-zinc-950',
            softText: 'text-zinc-800',
            softerText: 'text-zinc-600',
            roomLabel: 'BACKSTAGE BULLETIN',
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
    messages,
    scrollRef,
    headline,
    activeChannel,
}: {
    theme: ChatHallTheme;
    accentHex: string;
    messages: ChatMessage[];
    scrollRef: React.RefObject<HTMLDivElement>;
    headline: string;
    activeChannel: ChatChannel;
}) {
    return (
        <div ref={scrollRef} className={`flex-1 overflow-y-auto ${theme.panel} px-5 py-6 md:px-8`}>
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                <header className={`mb-2 border-b border-current/10 pb-3 ${theme.softText}`}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.32em] opacity-55">{activeChannel.label}</p>
                    <p className="mt-1 text-sm">{activeChannel.hint}</p>
                </header>
                {messages.map((item) => {
                    const isAssistant = item.role === 'assistant';
                    const bubble = item.isStarterMessage
                        ? theme.bubbleStarter
                        : isAssistant
                            ? theme.bubbleAssistant
                            : theme.bubbleGuest;
                    return (
                        <div
                            key={item.id}
                            className={`flex flex-col gap-1.5 ${isAssistant ? 'items-start' : 'items-end'}`}
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    className={`inline-flex items-center px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.24em] ${
                                        isAssistant ? theme.hostBadge : theme.guestBadge
                                    }`}
                                >
                                    {isAssistant ? 'Host · Tour Conductor' : item.displayName}
                                </span>
                                {item.isStarterMessage && (
                                    <span className="text-[9px] font-mono uppercase tracking-[0.22em] opacity-55">starter</span>
                                )}
                            </div>
                            <div
                                className={`max-w-[80%] px-4 py-3 text-sm leading-[1.65] ${bubble}`}
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
    );
}

function IdeaBoard({
    theme,
    accentHex,
    landing,
    activeChannel,
}: {
    theme: ChatHallTheme;
    accentHex: string;
    landing: CampaignLandingViewModel;
    activeChannel: ChatChannel['id'];
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

    return (
        <aside className={`hidden xl:flex w-[300px] shrink-0 flex-col ${theme.aside}`}>
            <div className="border-b border-current/10 p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.32em] opacity-50">{section.eyebrow}</p>
                <p className={`${theme.displayFont} mt-2 text-lg font-bold leading-tight`}>{section.title}</p>
                <p className={`mt-1 text-[11px] ${theme.softerText}`}>
                    {section.description}
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                <p className="px-1 pb-2 font-mono text-[9px] uppercase tracking-[0.32em] opacity-45">Pinned</p>
                <ul className="flex flex-col gap-2">
                    {seedIdeas.map((idea) => (
                        <li key={idea.id} className={`p-3 ${theme.ideaCard}`}>
                            <p className="text-[11px] font-mono uppercase tracking-[0.18em] opacity-55">📌 {idea.author}</p>
                            <p className="mt-1 text-sm leading-5">{idea.text}</p>
                        </li>
                    ))}
                </ul>

                <p className="mt-5 px-1 pb-2 font-mono text-[9px] uppercase tracking-[0.32em] opacity-45">{section.factsTitle}</p>
                <ul className="flex flex-col gap-2">
                    {landing.facts.slice(0, 4).map((fact) => (
                        <li key={fact.label} className={`p-3 ${theme.pinCard}`}>
                            <p
                                className="font-mono text-[9px] uppercase tracking-[0.32em]"
                                style={{ color: accentHex }}
                            >
                                {fact.label}
                            </p>
                            <p className="mt-1 text-sm font-bold leading-tight">{fact.value}</p>
                        </li>
                    ))}
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
}: {
    theme: ChatHallTheme;
    accentHex: string;
    landing: CampaignLandingViewModel;
}) {
    function scrollToForm() {
        document.getElementById('save-your-place')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return (
        <div className={`p-4 md:p-5 ${theme.gate}`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="max-w-xl">
                    <p className="font-mono text-[10px] uppercase tracking-[0.32em] opacity-65">Join the room</p>
                    <p className={`${theme.displayFont} mt-1 text-lg font-bold leading-tight`}>
                        Join the list.
                    </p>
                    <p className="mt-2 text-sm leading-6 opacity-80">
                        It only takes a moment.
                    </p>
                </div>
                <Button
                    type="button"
                    onClick={scrollToForm}
                    className="shrink-0 rounded-none px-6 py-5 text-sm font-bold"
                    style={{ backgroundColor: accentHex, color: '#0f172a' }}
                >
                    Join the list
                </Button>
            </div>
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
}: {
    theme: ChatHallTheme;
    accentHex: string;
    message: string;
    setMessage: (value: string) => void;
    sending: boolean;
    error: string;
    onSend: () => void;
    activeChannel: ChatChannel;
}) {
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
                    className={`min-h-[88px] rounded-none text-sm ${theme.input}`}
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
    /** Populated by GuestPortal once the guest has submitted the waitlist form. Unlocks compose. */
    guestIdentity: GuestIdentity | null;
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

export function GroupChatHall({ landing, guestIdentity }: GroupChatHallProps) {
    const theme = chatHallTheme(landing.designSystem.system, landing.designSystem.accentHex);
    const accentHex = landing.designSystem.accentHex;
    const [messages, setMessages] = useState<ChatMessage[]>(() => fallbackMessages(landing));
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [activeChannel, setActiveChannel] = useState<ChatChannel['id']>('main');
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [isPending, startTransition] = useTransition();

    const isUnlocked = guestIdentity !== null;
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
                    />
                    {!isUnlocked ? (
                        <ScrollToFormCTA
                            theme={theme}
                            accentHex={accentHex}
                            landing={landing}
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
                        />
                    )}
                </div>

                {/* Right rail — idea board */}
                <IdeaBoard theme={theme} accentHex={accentHex} landing={landing} activeChannel={activeChannel} />
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
                />
                {!isUnlocked ? (
                    <ScrollToFormCTA
                        theme={theme}
                        accentHex={accentHex}
                        landing={landing}
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
