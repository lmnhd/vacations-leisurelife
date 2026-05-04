'use client';

import { useEffect, useState, useTransition } from 'react';
import type { CampaignLandingViewModel } from '@/lib/campaigns/landing/view-model';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    displayName: string;
    content: string;
    createdAt: string;
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

interface LandingPageTourConductorProps {
    landing: CampaignLandingViewModel;
}

const SYSTEM_COPY: Record<CampaignLandingViewModel['designSystem']['system'], {
    shell: string;
    input: string;
    badge: string;
    label: string;
}> = {
    system_4_modular: {
        shell: 'border-white/10 bg-white/[0.06] text-white shadow-[0_26px_90px_rgba(0,0,0,0.24)] backdrop-blur',
        input: 'border-white/10 bg-black/20 text-white placeholder:text-white/40',
        badge: 'border-white/10 bg-white/10 text-white/70',
        label: 'MODULAR STATUS DESK',
    },
    system_1_editorial: {
        shell: 'border-stone-300 bg-[#f4ead8] text-stone-950 shadow-[0_28px_80px_rgba(92,54,32,0.18)]',
        input: 'border-stone-300 bg-[#fff8ea] text-stone-950 placeholder:text-stone-400',
        badge: 'border-stone-300 bg-[#fff8ea] text-stone-600',
        label: 'EDITORIAL LETTERS',
    },
    system_2_nostalgia: {
        shell: 'border-amber-800/25 bg-[#f6e4bf] text-amber-950 shadow-[0_28px_80px_rgba(120,73,24,0.18)]',
        input: 'border-amber-900/25 bg-[#fff3d6] text-amber-950 placeholder:text-amber-900/40',
        badge: 'border-amber-900/25 bg-[#fff3d6] text-amber-900/70',
        label: 'POSTCARD WIRE',
    },
    system_3_zine: {
        shell: 'border-zinc-950 bg-[#f3ead5] text-zinc-950 shadow-[9px_9px_0_rgba(0,0,0,0.9)]',
        input: 'border-zinc-950 bg-[#fff9e8] text-zinc-950 placeholder:text-zinc-500',
        badge: 'border-zinc-950 bg-white text-zinc-950',
        label: 'DECK NOTES THREAD',
    },
};

function fallbackMessages(landing: CampaignLandingViewModel): ChatMessage[] {
    return [
        {
            id: `${landing.slug}-starter-user`,
            role: 'user',
            displayName: 'Ghost Guest',
            content: landing.designSystem.chat.starterQuestion,
            createdAt: new Date(0).toISOString(),
            isStarterMessage: true,
        },
        {
            id: `${landing.slug}-starter-assistant`,
            role: 'assistant',
            displayName: landing.designSystem.chat.title,
            content: landing.designSystem.chat.starterAnswer,
            createdAt: new Date(0).toISOString(),
            isStarterMessage: true,
        },
    ];
}

export function LandingPageTourConductor({ landing }: LandingPageTourConductorProps) {
    const copy = SYSTEM_COPY[landing.designSystem.system];
    const [messages, setMessages] = useState<ChatMessage[]>(() => fallbackMessages(landing));
    const [message, setMessage] = useState('');
    const [signedUp, setSignedUp] = useState(false);
    const [error, setError] = useState('');
    const [isPending, startTransition] = useTransition();

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
                // The seeded local conversation is still useful if persistence is unavailable.
            }
        }

        void loadHistory();
        const interval = window.setInterval(loadHistory, 15000);

        return () => {
            alive = false;
            window.clearInterval(interval);
        };
    }, [landing.designSystem.chat.endpoint]);

    async function sendMessage() {
        const trimmed = message.trim();
        if (!trimmed || isPending || !signedUp) return;

        const optimistic: ChatMessage = {
            id: `local-${Date.now()}`,
            role: 'user',
            displayName: 'Guest',
            content: trimmed,
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
                    body: JSON.stringify({ message: trimmed, signedUp: true }),
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
        <section id="tour-conductor" className="mx-auto w-full max-w-7xl px-4 py-14 md:px-6 lg:px-8">
            <div className={`relative overflow-hidden border p-5 md:p-7 ${copy.shell}`}>
                <div
                    className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full opacity-25 blur-2xl"
                    style={{ backgroundColor: landing.designSystem.accentHex }}
                />
                <div className="relative grid gap-7 lg:grid-cols-[0.85fr_1.15fr]">
                    <div className="flex flex-col justify-between gap-6">
                        <div>
                            <div className={`inline-flex border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] ${copy.badge}`}>
                                {copy.label}
                            </div>
                            <h2 className="mt-5 text-3xl font-black leading-tight md:text-5xl">
                                Ask the {landing.designSystem.chat.title}.
                            </h2>
                            <p className="mt-4 max-w-xl text-sm leading-7 opacity-75">
                                Shared campaign history, status checks, guest ideas, and cruise logistics all live here. New visitors can read the thread first, then join updates to speak.
                            </p>
                        </div>

                        <div className="grid gap-3 text-sm">
                            <div className={`border p-4 ${copy.badge}`}>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] opacity-70">Campaign Progress</p>
                                <p className="mt-2 text-2xl font-black">{landing.threshold.percentOfThreshold}%</p>
                                <p className="mt-1 opacity-75">{landing.threshold.joinedPassengers} guests represented toward {landing.threshold.requiredCabins} cabins.</p>
                            </div>
                            <div className={`border p-4 ${copy.badge}`}>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] opacity-70">{landing.designSystem.chat.eyebrow}</p>
                                <p className="mt-2 opacity-75">{landing.designSystem.quote}</p>
                            </div>
                        </div>
                    </div>

                    <div className="relative grid min-h-[520px] grid-rows-[1fr_auto] overflow-hidden border border-current/20 bg-black/5">
                        <div className="grid max-h-[430px] gap-4 overflow-y-auto p-4 md:p-5">
                            {messages.map((item) => (
                                <div key={item.id} className={item.role === 'assistant' ? 'pr-8' : 'pl-8'}>
                                    <div className={`border p-4 ${item.role === 'assistant' ? copy.badge : 'border-current/10 bg-white/70 text-slate-950'}`}>
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">{item.displayName}</p>
                                            {item.isStarterMessage && (
                                                <span className="text-[10px] uppercase tracking-[0.18em] opacity-50">Starter</span>
                                            )}
                                        </div>
                                        <p className="mt-3 text-sm leading-7">{item.content}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="border-t border-current/20 p-4 md:p-5">
                            {!signedUp ? (
                                <div className={`grid gap-3 border p-4 ${copy.badge}`}>
                                    <p className="text-sm leading-6">{landing.designSystem.chat.signedOutMessage}</p>
                                    <Button
                                        type="button"
                                        className="w-full rounded-none font-semibold"
                                        style={{ backgroundColor: landing.designSystem.accentHex, color: '#0f172a' }}
                                        onClick={() => setSignedUp(true)}
                                    >
                                        I joined updates, unlock chat
                                    </Button>
                                </div>
                            ) : (
                                <div className="grid gap-3">
                                    <Textarea
                                        value={message}
                                        onChange={(event) => setMessage(event.target.value)}
                                        placeholder="Ask about the sailing, progress, cabin timing, or suggest an onboard idea..."
                                        className={`min-h-[96px] rounded-none ${copy.input}`}
                                    />
                                    {error && <p className="text-sm text-red-500">{error}</p>}
                                    <Button
                                        type="button"
                                        disabled={isPending || !message.trim()}
                                        onClick={sendMessage}
                                        className="rounded-none font-semibold"
                                        style={{ backgroundColor: landing.designSystem.accentHex, color: '#0f172a' }}
                                    >
                                        {isPending ? 'Conductor is writing...' : 'Send to shared thread'}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
