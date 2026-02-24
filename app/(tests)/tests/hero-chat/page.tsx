'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage, ChatResponse } from '@/lib/chat/types';

// ─── Hook: useHeroChat ────────────────────────────────────────────────────────

function useHeroChat() {
    const INITIAL_HEADLINE = 'Welcome aboard! Ready to find your perfect cruise?';

    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'assistant-seed',
            role: 'assistant',
            content: INITIAL_HEADLINE,
            timestamp: Date.now(),
        },
    ]);
    const [headline, setHeadline] = useState(INITIAL_HEADLINE);
    const [headlineTurn, setHeadlineTurn] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sessionId] = useState(
        () => `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );

    const hasUserHistory = useMemo(
        () => messages.some((m) => m.role === 'user'),
        [messages]
    );

    const sendText = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || isLoading) return;

        setError(null);
        setIsLoading(true);

        setMessages((prev) => [
            ...prev,
            {
                id: `u-${Date.now()}`,
                role: 'user',
                content: trimmed,
                timestamp: Date.now(),
            },
        ]);

        try {
            const response = await fetch('/api/tests/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: trimmed, sessionId, channel: 'text' }),
            });

            const payload = (await response.json()) as ChatResponse;
            if (!response.ok) throw new Error(payload.error || 'Chat request failed');

            const safeReply =
                payload.reply?.trim() ||
                "I'd love to help — tell me about your dream vacation!";

            setMessages((prev) => [
                ...prev,
                {
                    id: `a-${Date.now()}`,
                    role: 'assistant',
                    content: safeReply,
                    timestamp: Date.now(),
                },
            ]);
            setHeadline(safeReply);
            setHeadlineTurn((n) => n + 1);
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Unknown chat error';
            setError(message);
            setHeadline(`Sorry — ${message}`);
            setHeadlineTurn((n) => n + 1);
        } finally {
            setIsLoading(false);
        }
    };

    return {
        messages,
        headline,
        headlineTurn,
        isLoading,
        error,
        sessionId,
        hasUserHistory,
        sendText,
        setHeadline,
        setHeadlineTurn,
    };
}

// ─── Component: HeroHeadline ──────────────────────────────────────────────────
// Three display modes based on response length:
//   < 100 chars  → Typewriter (character stream)
//   100–500 chars → Word Stream (word-by-word fade)
//   > 500 chars  → Cinematic Fade (full text fade-in)

type HeadlineMode = 'typewriter' | 'wordstream' | 'cinematic';

function resolveMode(text: string): HeadlineMode {
    const len = text.length;
    if (len < 100) return 'typewriter';
    if (len <= 500) return 'wordstream';
    return 'cinematic';
}

function HeroHeadline({
    text,
    responseKey,
    isLoading,
}: {
    text: string;
    responseKey: number;
    isLoading: boolean;
}) {
    const mode = useMemo(() => resolveMode(text), [text]);

    // Adaptive font size: shrink as text gets longer
    const sizeClass = useMemo(() => {
        if (text.length < 60) return 'text-3xl md:text-5xl lg:text-6xl';
        if (text.length < 150) return 'text-2xl md:text-4xl lg:text-5xl';
        if (text.length < 300) return 'text-xl md:text-3xl lg:text-4xl';
        return 'text-lg md:text-2xl lg:text-3xl';
    }, [text.length]);

    return (
        <div className="min-h-[120px] flex items-center justify-center px-6 md:px-12">
            {mode === 'typewriter' && (
                <TypewriterMode text={text} responseKey={responseKey} isLoading={isLoading} sizeClass={sizeClass} />
            )}
            {mode === 'wordstream' && (
                <WordStreamMode text={text} responseKey={responseKey} isLoading={isLoading} sizeClass={sizeClass} />
            )}
            {mode === 'cinematic' && (
                <CinematicMode text={text} responseKey={responseKey} isLoading={isLoading} sizeClass={sizeClass} />
            )}
        </div>
    );
}

// ─── Mode 1: Typewriter (< 100 chars) ─────────────────────────────────────────

function TypewriterMode({
    text, responseKey, isLoading, sizeClass,
}: { text: string; responseKey: number; isLoading: boolean; sizeClass: string }) {
    const [charIndex, setCharIndex] = useState(0);

    useEffect(() => { setCharIndex(0); }, [responseKey]);

    useEffect(() => {
        if (charIndex < text.length) {
            const timeout = setTimeout(() => setCharIndex((i) => i + 1), 30);
            return () => clearTimeout(timeout);
        }
    }, [charIndex, text.length]);

    const isComplete = charIndex >= text.length;

    return (
        <h1
            className={`${sizeClass} font-bold text-center leading-tight max-w-4xl bg-gradient-to-r from-cyan-300 via-blue-400 to-indigo-400 bg-clip-text text-transparent`}
            style={{ opacity: isLoading && isComplete ? 0.5 : 1, transition: 'opacity 0.4s ease' }}
        >
            {text.slice(0, charIndex)}
            {!isComplete && <span className="animate-pulse text-cyan-400">|</span>}
        </h1>
    );
}

// ─── Mode 2: Word Stream (100–500 chars) ──────────────────────────────────────

function WordStreamMode({
    text, responseKey, isLoading, sizeClass,
}: { text: string; responseKey: number; isLoading: boolean; sizeClass: string }) {
    const [visibleCount, setVisibleCount] = useState(0);
    const [mounted, setMounted] = useState(false);
    const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);

    const delayPerWord = useMemo(() => {
        const count = words.length;
        if (count <= 10) return 100;
        if (count <= 25) return 65;
        return 45;
    }, [words.length]);

    // On new response: reset everything, wait for paint, then start streaming
    useEffect(() => {
        setVisibleCount(0);
        setMounted(false);
        // Double rAF: first ensures React flushes the opacity:0 render,
        // second ensures the browser actually paints it
        const raf1 = requestAnimationFrame(() => {
            const raf2 = requestAnimationFrame(() => {
                setMounted(true);
            });
            return () => cancelAnimationFrame(raf2);
        });
        return () => cancelAnimationFrame(raf1);
    }, [responseKey]);

    // Stream words only after mounted (so transitions are visible)
    useEffect(() => {
        if (mounted && visibleCount < words.length) {
            const timeout = setTimeout(() => setVisibleCount((n) => n + 1), delayPerWord);
            return () => clearTimeout(timeout);
        }
    }, [mounted, visibleCount, words.length, delayPerWord]);

    const isComplete = visibleCount >= words.length;

    return (
        <h1
            className={`${sizeClass} font-bold text-center leading-tight max-w-4xl`}
            style={{ opacity: isLoading && isComplete ? 0.5 : 1, transition: 'opacity 0.4s ease' }}
        >
            {words.map((word, i) => (
                <span
                    key={`${responseKey}-${i}`}
                    className="inline-block mr-[0.3em] last:mr-0"
                    style={{
                        opacity: mounted && i < visibleCount ? 1 : 0,
                        transform: mounted && i < visibleCount ? 'translateY(0)' : 'translateY(6px)',
                        transition: 'opacity 0.3s ease, transform 0.3s ease',
                    }}
                >
                    <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
                        {word}
                    </span>
                </span>
            ))}
        </h1>
    );
}

// ─── Mode 3: Cinematic Fade (> 500 chars) ─────────────────────────────────────

function CinematicMode({
    text, responseKey, isLoading, sizeClass,
}: { text: string; responseKey: number; isLoading: boolean; sizeClass: string }) {
    const [visible, setVisible] = useState(false);

    // Double rAF: guarantees browser paints the invisible frame
    // before we trigger the transition to visible
    useEffect(() => {
        setVisible(false);
        const raf1 = requestAnimationFrame(() => {
            const raf2 = requestAnimationFrame(() => {
                setVisible(true);
            });
            // Store raf2 for cleanup
            cleanupRef.current = raf2;
        });
        const cleanupRef = { current: 0 };
        return () => {
            cancelAnimationFrame(raf1);
            cancelAnimationFrame(cleanupRef.current);
        };
    }, [responseKey]);

    return (
        <h1
            className={`${sizeClass} font-bold text-center leading-tight max-w-4xl bg-gradient-to-r from-cyan-300 via-blue-400 to-indigo-400 bg-clip-text text-transparent`}
            style={{
                opacity: visible ? (isLoading ? 0.5 : 1) : 0,
                transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.97)',
                transition: 'opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1), transform 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
        >
            {text}
        </h1>
    );
}


// ─── Component: UserMessageRail ───────────────────────────────────────────────

function UserMessageRail({ messages }: { messages: ChatMessage[] }) {
    const userMessages = messages.filter((m) => m.role === 'user');
    const railRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (railRef.current) {
            railRef.current.scrollTop = railRef.current.scrollHeight;
        }
    }, [userMessages.length]);

    if (userMessages.length === 0) return null;

    return (
        <div
            ref={railRef}
            className="max-h-32 overflow-y-auto space-y-2 px-4 scrollbar-thin"
        >
            {userMessages.map((m) => (
                <div
                    key={m.id}
                    className="text-right text-sm text-slate-400 bg-white/5 rounded-lg px-3 py-1.5 ml-auto max-w-[80%] w-fit"
                >
                    {m.content}
                </div>
            ))}
        </div>
    );
}

// ─── Component: HeroInputBar ──────────────────────────────────────────────────

function HeroInputBar({
    isLoading,
    onSend,
}: {
    isLoading: boolean;
    onSend: (text: string) => void;
}) {
    const [input, setInput] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            onSend(input);
            setInput('');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="px-4 w-full max-w-2xl mx-auto">
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-full px-5 py-3 backdrop-blur-sm focus-within:border-cyan-500/50 transition-colors">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                        isLoading ? 'Thinking...' : 'Tell me about your dream vacation...'
                    }
                    disabled={isLoading}
                    className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-base"
                    autoFocus
                />
                <button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white disabled:opacity-30 hover:scale-105 active:scale-95 transition-transform"
                >
                    {isLoading ? (
                        <span className="animate-spin text-sm">⏳</span>
                    ) : (
                        <span className="text-lg">→</span>
                    )}
                </button>
            </div>
        </form>
    );
}

// ─── Test Data: 10 messages spanning all 3 modes ──────────────────────────────

const TEST_STREAM_MESSAGES: { label: string; text: string }[] = [
    { label: 'Typewriter #1 (15 chars)', text: 'Welcome aboard!' },
    { label: 'Typewriter #2 (45 chars)', text: 'Ready to find your perfect cruise vacation?' },
    { label: 'Typewriter #3 (85 chars)', text: 'Let me help you discover the best cruise deals from over 30 cruise lines worldwide!' },
    { label: 'WordStream #1 (120 chars)', text: 'I specialize in finding hidden cruise deals that most travelers never see. Tell me your dream destination and I will work my magic!' },
    { label: 'WordStream #2 (200 chars)', text: 'Based on what you have told me, I think a 7-night Western Caribbean cruise departing from Galveston would be absolutely perfect for your family. The ports of call include Cozumel, Grand Cayman, and Jamaica!' },
    { label: 'WordStream #3 (350 chars)', text: 'Here is what I found for you! Royal Caribbean\'s Harmony of the Seas has an incredible deal for a 7-night Eastern Caribbean itinerary. You will visit St. Maarten, San Juan, and their private island CocoCay. The ship features a FlowRider surf simulator, the tallest slide at sea, and 20 restaurants. Prices start at just $899 per person for an interior cabin with all meals included!' },
    { label: 'WordStream #4 (480 chars)', text: 'I have been analyzing your preferences and I have noticed some exciting patterns! You love tropical destinations with great food, your family enjoys water activities, and you prefer ships with plenty of entertainment options for the kids. Based on all of this, I have narrowed down your perfect cruise to three amazing options. Each one has been specifically selected to match your family\'s unique preferences. Would you like me to present them to you one by one with full details and pricing breakdowns?' },
    { label: 'Cinematic #1 (550 chars)', text: 'After extensive research across all major cruise lines, I have curated three exclusive packages just for your family. Package one is a Norwegian Gem sailing from New York to Bermuda, featuring the resort-style pool deck and specialty dining. Package two is Celebrity Edge cruising the Southern Caribbean with visits to Aruba, Bonaire, and Curacao, known for incredible snorkeling and Dutch colonial architecture. Package three is Disney Fantasy for a magical family experience with character dining and Broadway-caliber shows. Each package includes our exclusive Cruise Brothers agent perks!' },
    { label: 'Cinematic #2 (700 chars)', text: 'Let me share the complete breakdown of your top pick, the Celebrity Edge Southern Caribbean cruise. The 9-night itinerary departs from Fort Lauderdale on March 15th with stops in Aruba, Bonaire, Curacao, and Grand Cayman. Your Veranda Stateroom on Deck 9 includes a private balcony with ocean views, premium beverage package for all adults, unlimited specialty dining at venues like Le Petit Chef and Raw on 5, complimentary Wi-Fi for all devices, and a $200 onboard credit per cabin. Through our Cruise Brothers partnership, we have secured an additional upgrade to the Aqua Class with exclusive access to the solarium pool deck and priority restaurant reservations. The total price for your party of four comes to $5,396, that is just $1,349 per person all inclusive!' },
    { label: 'Cinematic #3 (90 chars)', text: 'Your cruise is booked! Confirmation sent to your email. Bon voyage, and happy sailing!' },
];

// ─── Component: DevDrawer ─────────────────────────────────────────────────────

function DevDrawer({
    onInjectMessage,
}: {
    onInjectMessage: (text: string, turn: number) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const abortRef = useRef(false);

    const runTestStream = useCallback(async () => {
        if (isRunning) return;
        setIsRunning(true);
        abortRef.current = false;

        for (let i = 0; i < TEST_STREAM_MESSAGES.length; i++) {
            if (abortRef.current) break;
            setCurrentIndex(i);
            const msg = TEST_STREAM_MESSAGES[i];

            // Calculate display time: longer text gets more time
            const displayMs = Math.max(2500, Math.min(msg.text.length * 12, 8000));
            onInjectMessage(msg.text, i + 1);

            await new Promise((resolve) => setTimeout(resolve, displayMs));
        }

        setIsRunning(false);
        setCurrentIndex(-1);
    }, [isRunning, onInjectMessage]);

    const stopTest = useCallback(() => {
        abortRef.current = true;
    }, []);

    return (
        <>
            {/* Toggle tab — tiny sliver on right edge */}
            <button
                onClick={() => setIsOpen((o) => !o)}
                className="fixed right-0 top-1/2 -translate-y-1/2 z-[100] w-3 h-16 rounded-l-md transition-all duration-300 hover:w-5"
                style={{ background: isOpen ? '#06b6d4' : 'rgba(255,255,255,0.06)' }}
                title="Dev Tools"
            />

            {/* Drawer panel */}
            <div
                className="fixed right-0 top-0 bottom-0 z-[99] w-72 bg-slate-950/95 backdrop-blur-xl border-l border-white/5 flex flex-col transition-transform duration-300 ease-out"
                style={{ transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                    <span className="text-xs font-mono text-cyan-400 tracking-widest uppercase">⚡ Dev Tools</span>
                    <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white text-sm">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {/* Test Stream Button */}
                    <button
                        onClick={isRunning ? stopTest : runTestStream}
                        disabled={false}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isRunning
                            ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
                            : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:border-cyan-500/30'
                            }`}
                    >
                        <div className="flex items-center gap-2">
                            <span>{isRunning ? '⏹' : '▶'}</span>
                            <span>{isRunning ? 'Stop Test' : 'Test Chat Text Stream'}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 ml-5">
                            10 messages across all 3 display modes
                        </p>
                    </button>

                    {/* Progress indicator */}
                    {isRunning && currentIndex >= 0 && (
                        <div className="bg-white/5 rounded-lg p-3 space-y-2">
                            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                                <span>{TEST_STREAM_MESSAGES[currentIndex].label}</span>
                                <span>{currentIndex + 1}/10</span>
                            </div>
                            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
                                    style={{ width: `${((currentIndex + 1) / 10) * 100}%` }}
                                />
                            </div>
                            <p className="text-[10px] text-slate-600">
                                {TEST_STREAM_MESSAGES[currentIndex].text.length} chars
                            </p>
                        </div>
                    )}
                </div>

                <div className="px-4 py-2 border-t border-white/5 text-[9px] text-slate-700 font-mono">
                    Leisure Life Dev Kit v0.1
                </div>
            </div>
        </>
    );
}
// ─── Hook: useIsMobile ────────────────────────────────────────────────────────

function useIsMobile(breakpoint = 768) {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
        setIsMobile(mql.matches);
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
    }, [breakpoint]);

    return isMobile;
}

// ─── Component: ConversationDrawer (Responsive) ──────────────────────────────
// Desktop (md+): Left side, pushes content horizontally
// Mobile (<md):  Bottom, slides up 50vh, pushes content up

function ConversationDrawer({
    messages,
    isOpen,
    onToggle,
}: {
    messages: ChatMessage[];
    isOpen: boolean;
    onToggle: () => void;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const isMobile = useIsMobile();

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages.length, isOpen]);

    // ── Shared message list ──
    const messageList = (
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.map((msg) => (
                <div
                    key={msg.id}
                    className={`rounded-lg px-3 py-2 text-sm ${msg.role === 'user'
                        ? 'bg-blue-500/10 border border-blue-500/15 ml-6'
                        : 'bg-white/5 border border-white/5 mr-6'
                        }`}
                >
                    <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] font-mono uppercase tracking-wider ${msg.role === 'user' ? 'text-blue-400' : 'text-cyan-400'
                            }`}>
                            {msg.role}
                        </span>
                        <span className="text-[9px] text-slate-600 font-mono">
                            {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                    </div>
                    <p className="text-slate-300 text-xs leading-relaxed break-words">
                        {msg.content.length > 200 ? msg.content.slice(0, 200) + '…' : msg.content}
                    </p>
                </div>
            ))}
            {messages.length === 0 && (
                <p className="text-slate-600 text-xs text-center mt-8">No messages yet</p>
            )}
        </div>
    );

    if (isMobile) {
        // ── Mobile: Bottom drawer ──
        return (
            <>
                {/* Toggle tab — bottom edge, horizontal bar */}
                <button
                    onClick={onToggle}
                    className="fixed left-1/2 -translate-x-1/2 z-[100] h-3 w-16 rounded-t-md transition-all duration-300 hover:h-4"
                    style={{
                        bottom: isOpen ? '50vh' : '0',
                        background: isOpen ? '#06b6d4' : 'rgba(255,255,255,0.12)',
                        transition: 'bottom 0.3s ease-out, background 0.3s ease',
                    }}
                    title="Conversation History"
                />

                <div
                    className="fixed left-0 right-0 bottom-0 z-[99] h-[50vh] bg-slate-950/95 backdrop-blur-xl border-t border-white/5 flex flex-col transition-transform duration-300 ease-out"
                    style={{ transform: isOpen ? 'translateY(0)' : 'translateY(100%)' }}
                >
                    <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
                        <span className="text-xs font-mono text-cyan-400 tracking-widest uppercase">💬 History</span>
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] text-slate-600 font-mono">{messages.length} msgs</span>
                            <button onClick={onToggle} className="text-slate-500 hover:text-white text-sm">✕</button>
                        </div>
                    </div>
                    {messageList}
                </div>
            </>
        );
    }

    // ── Desktop: Left drawer ──
    return (
        <>
            <button
                onClick={onToggle}
                className="fixed top-1/2 -translate-y-1/2 z-[100] w-3 h-16 rounded-r-md transition-all duration-300 hover:w-5"
                style={{
                    left: isOpen ? '20rem' : '0',
                    background: isOpen ? '#06b6d4' : 'rgba(255,255,255,0.12)',
                    transition: 'left 0.3s ease-out, background 0.3s ease',
                }}
                title="Conversation History"
            />

            <div
                className="fixed left-0 top-0 bottom-0 z-[99] w-80 bg-slate-950/95 backdrop-blur-xl border-r border-white/5 flex flex-col transition-transform duration-300 ease-out"
                style={{ transform: isOpen ? 'translateX(0)' : 'translateX(-100%)' }}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                    <span className="text-xs font-mono text-cyan-400 tracking-widest uppercase">💬 History</span>
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] text-slate-600 font-mono">{messages.length} msgs</span>
                        <button onClick={onToggle} className="text-slate-500 hover:text-white text-sm">✕</button>
                    </div>
                </div>
                {messageList}
                <div className="px-4 py-2 border-t border-white/5 text-[9px] text-slate-700 font-mono">
                    Session Transcript
                </div>
            </div>
        </>
    );
}

// ─── Page: Hero Chat Test ─────────────────────────────────────────────────────

export default function HeroChatTestPage() {
    const chat = useHeroChat();
    const [historyOpen, setHistoryOpen] = useState(false);
    const isMobile = useIsMobile();

    const handleInjectMessage = useCallback(
        (text: string, turn: number) => {
            chat.setHeadline(text);
            chat.setHeadlineTurn(turn);
        },
        [chat]
    );

    // Mobile: squeeze into top half. Desktop: push right.
    const outerStyle: React.CSSProperties = historyOpen
        ? isMobile
            ? { height: 'calc(50vh - 3.5rem)', overflow: 'hidden' }
            : { marginLeft: '20rem' }
        : {};

    const innerHeight = historyOpen && isMobile
        ? 'h-[calc(50vh-3.5rem)]'
        : 'min-h-[calc(100vh-3.5rem)]';

    return (
        <div
            className="min-h-[calc(100vh-3.5rem)] transition-all duration-300 ease-out"
            style={outerStyle}
        >
            <div className={`flex flex-col items-center justify-center ${innerHeight} gap-6 py-8 transition-all duration-300`}>
                {/* Hero Headline */}
                <HeroHeadline
                    text={chat.headline}
                    responseKey={chat.headlineTurn}
                    isLoading={chat.isLoading}
                />

                {/* User Message Rail */}
                <UserMessageRail messages={chat.messages} />

                {/* Input Bar */}
                <HeroInputBar isLoading={chat.isLoading} onSend={chat.sendText} />

                {/* Dev Info */}
                <div className="text-xs text-slate-600 font-mono space-y-1 text-center">
                    <p>Session: {chat.sessionId}</p>
                    <p>
                        Messages: {chat.messages.length} | History:{' '}
                        {chat.hasUserHistory ? 'Yes' : 'No'}
                    </p>
                    {chat.error && (
                        <p className="text-red-400">Error: {chat.error}</p>
                    )}
                </div>
            </div>

            {/* Conversation History Drawer (responsive) */}
            <ConversationDrawer
                messages={chat.messages}
                isOpen={historyOpen}
                onToggle={() => setHistoryOpen((o) => !o)}
            />

            {/* Secret Dev Drawer (Right — overlays) */}
            <DevDrawer onInjectMessage={handleInjectMessage} />
        </div>
    );
}
