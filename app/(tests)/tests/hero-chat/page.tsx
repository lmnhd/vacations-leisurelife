'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
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
    };
}

// ─── Component: TypewriterHeadline ────────────────────────────────────────────

function TypewriterHeadline({
    text,
    responseKey,
    isLoading,
}: {
    text: string;
    responseKey: number;
    isLoading: boolean;
}) {
    const [displayed, setDisplayed] = useState('');
    const [charIndex, setCharIndex] = useState(0);

    useEffect(() => {
        setDisplayed('');
        setCharIndex(0);
    }, [responseKey]);

    useEffect(() => {
        if (charIndex < text.length) {
            const timeout = setTimeout(() => {
                setDisplayed((prev) => prev + text[charIndex]);
                setCharIndex((i) => i + 1);
            }, 25);
            return () => clearTimeout(timeout);
        }
    }, [charIndex, text]);

    return (
        <div className="min-h-[120px] flex items-center justify-center px-4">
            <h1
                className="text-3xl md:text-5xl lg:text-6xl font-bold text-center leading-tight bg-gradient-to-r from-cyan-300 via-blue-400 to-indigo-400 bg-clip-text text-transparent transition-opacity duration-300"
                style={{ opacity: isLoading && charIndex >= text.length ? 0.5 : 1 }}
            >
                {displayed}
                {charIndex < text.length && (
                    <span className="animate-pulse text-cyan-400">|</span>
                )}
            </h1>
        </div>
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

// ─── Page: Hero Chat Test ─────────────────────────────────────────────────────

export default function HeroChatTestPage() {
    const chat = useHeroChat();

    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] gap-8 py-12">
            {/* Hero Headline */}
            <TypewriterHeadline
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
    );
}
