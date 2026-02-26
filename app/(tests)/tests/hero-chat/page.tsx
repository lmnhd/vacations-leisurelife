'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage, ChatResponse, ParsedFormDirective } from '@/lib/chat/types';
import type { GoogleImageResult } from '@/lib/services/media/google-images';

// ─── Component: ParticleOverlay ──────────────────────────────────────────────────

interface Particle {
    x: number;
    y: number;
    radius: number;
    speedY: number;
    speedX: number;
    opacity: number;
    opacityDrift: number;
}

function ParticleOverlay() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animFrameRef = useRef<number>(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        // Seed particles
        const COUNT = 55;
        const particles: Particle[] = Array.from({ length: COUNT }, () => ({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            radius: Math.random() * 1.8 + 0.4,
            speedY: -(Math.random() * 0.22 + 0.06),
            speedX: (Math.random() - 0.5) * 0.12,
            opacity: Math.random() * 0.18 + 0.04,
            opacityDrift: (Math.random() - 0.5) * 0.003,
        }));

        const draw = () => {
            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            for (const p of particles) {
                // Move
                p.y += p.speedY;
                p.x += p.speedX;
                p.opacity = Math.max(0.02, Math.min(0.28, p.opacity + p.opacityDrift));
                if (p.opacity <= 0.02 || p.opacity >= 0.28) p.opacityDrift *= -1;

                // Wrap
                if (p.y < -4) p.y = h + 4;
                if (p.x < -4) p.x = w + 4;
                if (p.x > w + 4) p.x = -4;

                // Draw soft glow droplet
                const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 3);
                grad.addColorStop(0, `rgba(148, 226, 255, ${p.opacity})`);
                grad.addColorStop(1, 'rgba(148, 226, 255, 0)');
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius * 3, 0, Math.PI * 2);
                ctx.fillStyle = grad;
                ctx.fill();
            }

            animFrameRef.current = requestAnimationFrame(draw);
        };

        animFrameRef.current = requestAnimationFrame(draw);

        return () => {
            cancelAnimationFrame(animFrameRef.current);
            window.removeEventListener('resize', resize);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 z-0 pointer-events-none"
            style={{ mixBlendMode: 'screen' }}
        />
    );
}

// ─── Mood Gradient Palette ────────────────────────────────────────────────────
// Maps each mood image path to a contrasting Tailwind gradient class.
// Designed to pop against the specific color temperature of each background.

const MOOD_GRADIENTS: Record<string, string> = {
    // Tropical — warm turquoise/sun warmth → contrast with bright coral/gold
    '/images/moods/tropical-day-outdoor.png': 'from-amber-300 via-orange-400 to-rose-400',
    '/images/moods/tropical-day-indoor.png': 'from-yellow-200 via-amber-300 to-orange-400',
    '/images/moods/tropical-night-outdoor.png': 'from-cyan-300 via-teal-400 to-emerald-500',
    '/images/moods/tropical-night-indoor.png': 'from-amber-400 via-orange-500 to-rose-500',
    // Arctic — icy blues → contrast with warm ivory/lavender
    '/images/moods/arctic-day-outdoor.png': 'from-white via-sky-200 to-blue-300',
    '/images/moods/arctic-day-indoor.png': 'from-amber-100 via-orange-200 to-amber-300',
    '/images/moods/arctic-night-outdoor.png': 'from-green-300 via-emerald-400 to-teal-500',
    '/images/moods/arctic-night-indoor.png': 'from-orange-300 via-amber-400 to-yellow-300',
    // Mediterranean — terracotta/azure → contrast with ivory/gold
    '/images/moods/mediterranean-day-outdoor.png': 'from-yellow-200 via-amber-300 to-orange-400',
    '/images/moods/mediterranean-day-indoor.png': 'from-sky-200 via-blue-300 to-indigo-400',
    '/images/moods/mediterranean-night-outdoor.png': 'from-rose-300 via-pink-400 to-purple-500',
    '/images/moods/mediterranean-night-indoor.png': 'from-amber-300 via-yellow-400 to-orange-300',
    // Asian — zen greens/cherry/mist → contrast with sakura/gold/crimson
    '/images/moods/asian-day-outdoor.png': 'from-pink-300 via-rose-400 to-pink-500',
    '/images/moods/asian-day-indoor.png': 'from-amber-200 via-yellow-300 to-orange-300',
    '/images/moods/asian-night-outdoor.png': 'from-amber-300 via-orange-400 to-red-400',
    '/images/moods/asian-night-indoor.png': 'from-yellow-300 via-amber-400 to-orange-300',
    // African — golden savanna/earthy → contrast with bright sky/coral
    '/images/moods/african-day-outdoor.png': 'from-sky-300 via-cyan-400 to-teal-400',
    '/images/moods/african-day-indoor.png': 'from-amber-200 via-yellow-300 to-lime-300',
    '/images/moods/african-night-outdoor.png': 'from-amber-400 via-orange-500 to-rose-400',
    '/images/moods/african-night-indoor.png': 'from-orange-300 via-amber-400 to-yellow-300',
    // European — cobblestone/midnight/candlelight → contrast with gold/azure/ivory
    '/images/moods/european-day-outdoor.png': 'from-sky-200 via-blue-300 to-indigo-400',
    '/images/moods/european-day-indoor.png': 'from-amber-200 via-yellow-300 to-orange-200',
    '/images/moods/european-night-outdoor.png': 'from-amber-300 via-yellow-400 to-orange-300',
    '/images/moods/european-night-indoor.png': 'from-yellow-300 via-amber-300 to-orange-200',

    // --- NEW SEASIDE CRUISE COLLECTION --- //
    // Ship Exterior (Sunny Azure / Deep Indigo)
    '/images/moods/ship-exterior-day-forward.png': 'from-amber-300 via-orange-400 to-rose-400',
    '/images/moods/ship-exterior-day-aft.png': 'from-emerald-300 via-teal-400 to-cyan-500',
    '/images/moods/ship-exterior-night-starboard.png': 'from-yellow-300 via-amber-400 to-orange-400',
    '/images/moods/ship-exterior-night-aft.png': 'from-cyan-200 via-sky-300 to-blue-400',
    // Interior Venues (Bright Atrium / Moody Lounges)
    '/images/moods/interior-venues-day-atrium.png': 'from-sky-300 via-blue-400 to-indigo-500',
    '/images/moods/interior-venues-day-promenade.png': 'from-orange-300 via-rose-400 to-pink-500',
    '/images/moods/interior-venues-night-ballroom.png': 'from-amber-400 via-yellow-300 to-orange-200',
    '/images/moods/interior-venues-night-lounge.png': 'from-cyan-300 via-emerald-400 to-teal-400',
    // Resort Decks (Vibrant Aqua / Amber Spa)
    '/images/moods/resort-decks-day-main-pool.png': 'from-rose-400 via-pink-500 to-purple-500',
    '/images/moods/resort-decks-day-solarium.png': 'from-amber-200 via-orange-300 to-rose-300',
    '/images/moods/resort-decks-night-main-pool.png': 'from-yellow-300 via-amber-400 to-orange-500',
    '/images/moods/resort-decks-night-spa.png': 'from-sky-300 via-cyan-400 to-teal-400',
    // Tropical Beaches (White Sand / Night Bonfires)
    '/images/moods/tropical-beaches-day-pristine-beach.png': 'from-amber-400 via-orange-500 to-rose-500',
    '/images/moods/tropical-beaches-day-private-island.png': 'from-fuchsia-400 via-purple-500 to-indigo-500',
    '/images/moods/tropical-beaches-night-beach-bonfire.png': 'from-cyan-300 via-sky-400 to-blue-500',
    '/images/moods/tropical-beaches-night-palm-silhouettes.png': 'from-emerald-300 via-teal-400 to-cyan-500',
    // Balcony Views (Endless Horizon / Sparkling Ports)
    '/images/moods/balcony-views-day-ocean-view.png': 'from-amber-300 via-orange-400 to-rose-400',
    '/images/moods/balcony-views-day-port-arrival.png': 'from-cyan-300 via-blue-400 to-indigo-500',
    '/images/moods/balcony-views-night-stargazing.png': 'from-amber-200 via-yellow-300 to-orange-400',
    '/images/moods/balcony-views-night-port-departure.png': 'from-sky-300 via-cyan-400 to-blue-500',
    // Culinary Venues (Bright Cafe / Romantic Dining)
    '/images/moods/culinary-venues-day-oceanfront-cafe.png': 'from-orange-400 via-rose-400 to-pink-500',
    '/images/moods/culinary-venues-day-fine-dining.png': 'from-sky-300 via-blue-400 to-indigo-500',
    '/images/moods/culinary-venues-night-main-dining-room.png': 'from-cyan-200 via-teal-300 to-emerald-400',
    '/images/moods/culinary-venues-night-specialty-restaurant.png': 'from-amber-300 via-yellow-400 to-orange-300',
};

const DEFAULT_GRADIENT = 'from-cyan-300 via-blue-400 to-indigo-400';

function getMoodGradient(mood: string | null): string {
    if (!mood) return DEFAULT_GRADIENT;
    return MOOD_GRADIENTS[mood] ?? DEFAULT_GRADIENT;
}

// ─── Component: MoodBackground ────────────────────────────────────────────────

function MoodBackground({ imagePath }: { imagePath: string | null }) {
    if (!imagePath) return null;

    return (
        <div
            key={imagePath}
            className="fixed inset-0 overflow-hidden pointer-events-none"
            style={{ zIndex: 1 }}
        >
            <img
                key={imagePath}
                src={imagePath}
                alt=""
                className="absolute inset-0 w-full h-full object-cover animate-in fade-in duration-1000 ease-out"
                style={{ filter: 'blur(7px) brightness(0.45) saturate(1.3)', opacity: 0.85 }}
            />
            {/* Dark vignette — keeps text readable */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(2,6,23,0.7)_100%)]" />
        </div>
    );
}


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
    const [activeForm, setActiveForm] = useState<ParsedFormDirective | null>(null);
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
            const response = await fetch('/api/chat', {
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
                    display: payload.display,
                },
            ]);

            // Set current UI state
            setHeadline(safeReply);
            setHeadlineTurn((n) => n + 1);
            if (payload.display?.form) {
                setActiveForm(payload.display.form);
            } else {
                setActiveForm(null);
            }

            // Need a way to pass images up. The page.tsx handles images itself via the dev test button right now.
            // But we actually want the chat flow to set it eventually. We'll handle that via a callback if needed,
            // or just let the HeroChatTestPage handle it via the viewPastTurn.
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

    const viewPastTurn = useCallback((index: number) => {
        const msg = messages[index];
        if (!msg) return;

        setHeadline(msg.content);
        setHeadlineTurn(index); // Just trigger re-render
        setActiveForm(msg.display?.form ?? null);
        // Image handling would also be restored here by the consumer using the display directive
    }, [messages]);

    return {
        messages,
        headline,
        headlineTurn,
        activeForm,
        isLoading,
        error,
        sessionId,
        hasUserHistory,
        sendText,
        setHeadline,
        setHeadlineTurn,
        setActiveForm,
        viewPastTurn,
    };
}

// ─── Component: DynamicForm ───────────────────────────────────────────────────

function DynamicForm({ form, onSubmit, isLoading }: { form: ParsedFormDirective, onSubmit: (data: Record<string, string>) => void, isLoading: boolean }) {
    const [formData, setFormData] = useState<Record<string, string>>({});

    const handleChange = (name: string, value: string) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="w-full max-w-lg mx-auto bg-slate-900/40 backdrop-blur border border-white/10 rounded-2xl p-6 mt-6 shadow-2xl animate-fade-in-up">
            {form.title && <h3 className="text-xl font-semibold text-white mb-6 text-center">{form.title}</h3>}

            <div className="space-y-4">
                {form.fields.map(field => (
                    <div key={field.name} className="flex flex-col gap-1.5">
                        <label className="text-sm text-cyan-200 ml-1">{field.label || field.name}</label>

                        {field.type === 'select' ? (
                            <div className="relative">
                                <select
                                    className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white appearance-none focus:outline-none focus:border-cyan-500/50 transition-colors"
                                    required={field.required}
                                    value={formData[field.name] || ''}
                                    onChange={(e) => handleChange(field.name, e.target.value)}
                                    disabled={isLoading}
                                >
                                    <option value="" disabled>Select an option...</option>
                                    {field.options?.map(opt => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">▼</div>
                            </div>
                        ) : (
                            <input
                                type={field.type}
                                min={field.min}
                                max={field.max}
                                required={field.required}
                                className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
                                placeholder={`Enter ${field.label || field.name}...`}
                                value={formData[field.name] || ''}
                                onChange={(e) => handleChange(field.name, e.target.value)}
                                disabled={isLoading}
                            />
                        )}
                    </div>
                ))}
            </div>

            <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-8 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:pointer-events-none"
            >
                {isLoading ? 'Sending...' : 'Submit Details'}
            </button>
        </form>
    );
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
    gradient,
}: {
    text: string;
    responseKey: number;
    isLoading: boolean;
    gradient: string;
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
                <TypewriterMode text={text} responseKey={responseKey} isLoading={isLoading} sizeClass={sizeClass} gradient={gradient} />
            )}
            {mode === 'wordstream' && (
                <WordStreamMode text={text} responseKey={responseKey} isLoading={isLoading} sizeClass={sizeClass} gradient={gradient} />
            )}
            {mode === 'cinematic' && (
                <CinematicMode text={text} responseKey={responseKey} isLoading={isLoading} sizeClass={sizeClass} gradient={gradient} />
            )}
        </div>
    );
}

// ─── Mode 1: Typewriter (< 100 chars) ─────────────────────────────────────────

function TypewriterMode({
    text, responseKey, isLoading, sizeClass, gradient,
}: { text: string; responseKey: number; isLoading: boolean; sizeClass: string; gradient: string }) {
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
            className={`${sizeClass} font-bold text-center leading-tight max-w-4xl bg-gradient-to-r ${gradient} bg-clip-text text-transparent transition-[background] duration-700`}
            style={{ opacity: isLoading && isComplete ? 0.5 : 1, transition: 'opacity 0.4s ease' }}
        >
            {text.slice(0, charIndex)}
            {!isComplete && <span className="animate-pulse text-cyan-400">|</span>}
        </h1>
    );
}

// ─── Mode 2: Word Stream (100–500 chars) ──────────────────────────────────────

function WordStreamMode({
    text, responseKey, isLoading, sizeClass, gradient,
}: { text: string; responseKey: number; isLoading: boolean; sizeClass: string; gradient: string }) {
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
                    <span className={`bg-gradient-to-r ${gradient} bg-clip-text text-transparent transition-[background] duration-700`}>
                        {word}
                    </span>
                </span>
            ))}
        </h1>
    );
}

// ─── Mode 3: Cinematic Fade (> 500 chars) ─────────────────────────────────────

function CinematicMode({
    text, responseKey, isLoading, sizeClass, gradient,
}: { text: string; responseKey: number; isLoading: boolean; sizeClass: string; gradient: string }) {
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
            className={`${sizeClass} font-bold text-center leading-tight max-w-4xl bg-gradient-to-r ${gradient} bg-clip-text text-transparent transition-[background] duration-700`}
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


// ─── Component: HeroImage ─────────────────────────────────────────────────────

function HeroImage({ images }: { images: GoogleImageResult[] }) {
    const [loaded, setLoaded] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);

    // Reset when images array changes
    useEffect(() => {
        setLoaded(false);
        setCurrentIndex(0);
    }, [images]);

    if (!images || images.length === 0) return null;
    const currentSrc = images[currentIndex]?.imageUrl;

    const goNext = () => {
        setLoaded(false);
        setCurrentIndex((i) => (i + 1) % images.length);
    };

    const goPrev = () => {
        setLoaded(false);
        setCurrentIndex((i) => (i === 0 ? images.length - 1 : i - 1));
    };

    return (
        <div className="relative w-full max-w-2xl mx-auto px-4 group">
            <div
                className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-cyan-500/10 bg-slate-900/50"
                style={{
                    opacity: loaded ? 1 : 0,
                    transform: loaded ? 'scale(1)' : 'scale(0.98)',
                    transition: 'opacity 0.8s ease, transform 0.8s ease',
                    minHeight: '200px'
                }}
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={currentSrc}
                    alt={images[currentIndex]?.title ?? 'Cruise image'}
                    className="w-full h-auto max-h-[400px] object-cover"
                    onLoad={() => setLoaded(true)}
                    onError={() => setLoaded(false)}
                />

                {images[currentIndex]?.title && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-8 pointer-events-none">
                        <p className="text-xs text-white/70 truncate pb-2">{images[currentIndex].title}</p>
                    </div>
                )}
            </div>

            {/* Slideshow Controls */}
            {images.length > 1 && (
                <>
                    <button
                        onClick={goPrev}
                        className="absolute left-6 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60 focus:opacity-100"
                    >
                        &larr;
                    </button>
                    <button
                        onClick={goNext}
                        className="absolute right-6 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60 focus:opacity-100"
                    >
                        &rarr;
                    </button>

                    {/* Indicators */}
                    <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
                        {images.map((_, i) => (
                            <div
                                key={i}
                                className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentIndex ? 'bg-white w-3' : 'bg-white/40'
                                    }`}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Component: UserMessageRail ───────────────────────────────────────────────

function UserMessageRail({ messages }: { messages: ChatMessage[] }) {
    // Exclude synthetic form-submission messages from the visible rail
    const userMessages = messages.filter(
        (m) => m.role === 'user' && !m.content.startsWith('Form Submitted:')
    );
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
    const [voiceMode, setVoiceMode] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            onSend(input);
            setInput('');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="px-4 w-full max-w-2xl mx-auto">
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-full px-4 py-3 backdrop-blur-sm focus-within:border-cyan-500/50 transition-colors">
                {/* Mic toggle — left side */}
                <button
                    type="button"
                    onClick={() => setVoiceMode((v) => !v)}
                    title={voiceMode ? 'Switch to text input' : 'Switch to voice input'}
                    className={`flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full transition-all ${voiceMode
                        ? 'bg-red-500/20 border border-red-500/50 text-red-400 animate-pulse'
                        : 'bg-white/5 border border-white/10 text-slate-500 hover:text-cyan-400 hover:border-cyan-500/30'
                        }`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                        <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                    </svg>
                </button>

                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                        voiceMode ? '🎤 Tap mic again to return to text...' :
                            isLoading ? 'Thinking...' : 'Tell me about your dream vacation...'
                    }
                    disabled={isLoading || voiceMode}
                    className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-base"
                    autoFocus={!voiceMode}
                />

                {/* Send button — right side */}
                <button
                    type="submit"
                    disabled={isLoading || voiceMode || !input.trim()}
                    className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white disabled:opacity-30 hover:scale-105 active:scale-95 transition-transform"
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

const TEST_IMAGE_QUERIES: string[] = [
    '[Image: "Royal Caribbean Harmony pool deck"]', // Single default image
    '[Images: "Cozumel Mexico cruise port" (3)]',   // Slideshow of 3 images
    '[Image: "Celebrity Edge cruise ship suite" (2)]', // The 2nd image specifically
    '[Images: "Norwegian Gem Bermuda sunset" (2)]', // Slideshow of 2 images
    '[Image: "Disney Fantasy cruise ship atrium" (4)]', // The 4th image specifically
];

import { parseResponse } from '@/lib/chat/response-parser';

// ─── Component: DevDrawer ─────────────────────────────────────────────────────

function DevDrawer({
    onInjectMessage,
    onImagesResult,
    currentMood,
    onMoodChange,
}: {
    onInjectMessage: (text: string, turn: number, form?: ParsedFormDirective) => void;
    onImagesResult: (images: GoogleImageResult[]) => void;
    currentMood: string | null;
    onMoodChange: (mood: string | null) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const abortRef = useRef(false);

    // Image test state
    const [imageTestRunning, setImageTestRunning] = useState(false);
    const [imageTestIndex, setImageTestIndex] = useState(-1);
    const imageAbortRef = useRef(false);

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

    const runImageTest = useCallback(async () => {
        if (imageTestRunning) return;
        setImageTestRunning(true);
        imageAbortRef.current = false;

        for (let i = 0; i < TEST_IMAGE_QUERIES.length; i++) {
            if (imageAbortRef.current) break;
            setImageTestIndex(i);
            const rawDirective = TEST_IMAGE_QUERIES[i];

            // Re-use our actual parser logic!
            const parsed = parseResponse(rawDirective);
            if (!parsed.image) {
                console.error('Test query is not a valid directive:', rawDirective);
                continue;
            }

            const payload: any = { query: parsed.image.query };
            if (parsed.image.count !== undefined) payload.count = parsed.image.count;
            if (parsed.image.index !== undefined) payload.index = parsed.image.index;

            try {
                const res = await fetch('/api/tests/image-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const json = await res.json();
                onImagesResult(json.data?.results ?? []);

                // Also inject a headline so we know what we are looking at
                const modeStr = payload.count ? `Slideshow (${payload.count} imgs)` : `Indexed Image #${(payload.index || 0) + 1}`;
                onInjectMessage(`${modeStr}: ${parsed.image.query}`, i + 100);
            } catch {
                console.error(`Image test failed for: ${rawDirective}`);
            }

            await new Promise((resolve) => setTimeout(resolve, 6000));
        }

        setImageTestRunning(false);
        setImageTestIndex(-1);
    }, [imageTestRunning, onImagesResult, onInjectMessage]);

    const stopImageTest = useCallback(() => {
        imageAbortRef.current = true;
    }, []);

    const runFormTest = useCallback(() => {
        const mockFormDirective = `[Form: {
            "id": "guest_preferences",
            "title": "Passenger Details",
            "fields": [
                { "name": "destination", "type": "select", "label": "Preferred Destination", "options": ["Caribbean", "Alaska", "Mediterranean", "Anywhere Warm"], "required": true },
                { "name": "passengers", "type": "number", "label": "Number of Passengers", "min": 1, "max": 10, "required": true },
                { "name": "email", "type": "email", "label": "Email Address", "required": false }
            ]
        }]`;

        const parsed = parseResponse(mockFormDirective);
        onInjectMessage("Great! I just need a few details to find the best packages for you.", 999, parsed.form);
    }, [onInjectMessage]);

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

                    {/* Divider */}
                    <div className="border-t border-white/5" />

                    {/* Image Search Test Button */}
                    <button
                        onClick={imageTestRunning ? stopImageTest : runImageTest}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${imageTestRunning
                            ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
                            : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:border-cyan-500/30'
                            }`}
                    >
                        <div className="flex items-center gap-2">
                            <span>{imageTestRunning ? '⏹' : '🖼'}</span>
                            <span>{imageTestRunning ? 'Stop Image Test' : 'Test Image Search'}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 ml-5">
                            5 queries via Google Custom Search
                        </p>
                    </button>

                    {/* Image test progress */}
                    {imageTestRunning && imageTestIndex >= 0 && (
                        <div className="bg-white/5 rounded-lg p-3 space-y-2">
                            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                                <span className="truncate mr-2">{TEST_IMAGE_QUERIES[imageTestIndex]}</span>
                                <span>{imageTestIndex + 1}/5</span>
                            </div>
                            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full transition-all duration-500"
                                    style={{ width: `${((imageTestIndex + 1) / 5) * 100}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Divider */}
                    <div className="border-t border-white/5" />

                    {/* Form Test Button */}
                    <button
                        onClick={runFormTest}
                        className="w-full text-left bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:border-cyan-500/30 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
                    >
                        <div className="flex items-center gap-2">
                            <span>📋</span>
                            <span>Test Dynamic Form</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 ml-5">
                            Injects a mock JSON form directive
                        </p>
                    </button>

                    {/* Divider */}
                    <div className="border-t border-white/5" />

                    {/* Mood Selector */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-slate-300 text-sm font-medium px-1">
                            <span>🎨</span>
                            <span>Mood Background</span>
                        </div>
                        <select
                            value={currentMood || ''}
                            onChange={(e) => onMoodChange(e.target.value || null)}
                            className="w-full bg-slate-900 border border-white/10 text-slate-300 rounded-lg px-3 py-2 text-xs outline-none focus:border-cyan-500/50"
                        >
                            <option value="">None (Solid Dark)</option>
                            <optgroup label="Tropical">
                                <option value="/images/moods/tropical-day-outdoor.png">Tropical - Day Outdoor</option>
                                <option value="/images/moods/tropical-day-indoor.png">Tropical - Day Indoor</option>
                                <option value="/images/moods/tropical-night-outdoor.png">Tropical - Night Outdoor</option>
                                <option value="/images/moods/tropical-night-indoor.png">Tropical - Night Indoor</option>
                            </optgroup>
                            <optgroup label="Arctic">
                                <option value="/images/moods/arctic-day-outdoor.png">Arctic - Day Outdoor</option>
                                <option value="/images/moods/arctic-day-indoor.png">Arctic - Day Indoor</option>
                                <option value="/images/moods/arctic-night-outdoor.png">Arctic - Night Outdoor</option>
                                <option value="/images/moods/arctic-night-indoor.png">Arctic - Night Indoor</option>
                            </optgroup>
                            <optgroup label="Mediterranean">
                                <option value="/images/moods/mediterranean-day-outdoor.png">Med - Day Outdoor</option>
                                <option value="/images/moods/mediterranean-day-indoor.png">Med - Day Indoor</option>
                                <option value="/images/moods/mediterranean-night-outdoor.png">Med - Night Outdoor</option>
                                <option value="/images/moods/mediterranean-night-indoor.png">Med - Night Indoor</option>
                            </optgroup>
                            <optgroup label="Asian">
                                <option value="/images/moods/asian-day-outdoor.png">Asian - Day Outdoor</option>
                                <option value="/images/moods/asian-day-indoor.png">Asian - Day Indoor</option>
                                <option value="/images/moods/asian-night-outdoor.png">Asian - Night Outdoor</option>
                                <option value="/images/moods/asian-night-indoor.png">Asian - Night Indoor</option>
                            </optgroup>
                            <optgroup label="African">
                                <option value="/images/moods/african-day-outdoor.png">African - Day Outdoor</option>
                                <option value="/images/moods/african-day-indoor.png">African - Day Indoor</option>
                                <option value="/images/moods/african-night-outdoor.png">African - Night Outdoor</option>
                                <option value="/images/moods/african-night-indoor.png">African - Night Indoor</option>
                            </optgroup>
                            <optgroup label="European">
                                <option value="/images/moods/european-day-outdoor.png">European - Day Outdoor</option>
                                <option value="/images/moods/european-day-indoor.png">European - Day Indoor</option>
                                <option value="/images/moods/european-night-outdoor.png">European - Night Outdoor</option>
                                <option value="/images/moods/european-night-indoor.png">European - Night Indoor</option>
                            </optgroup>

                            {/* --- NEW SEASIDE CRUISE COLLECTION --- */}
                            <optgroup label="🛳️ Ship Exterior">
                                <option value="/images/moods/ship-exterior-day-forward.png">Ship - Day Forward</option>
                                <option value="/images/moods/ship-exterior-day-aft.png">Ship - Day Aft</option>
                                <option value="/images/moods/ship-exterior-night-starboard.png">Ship - Night Starboard</option>
                                <option value="/images/moods/ship-exterior-night-aft.png">Ship - Night Aft</option>
                            </optgroup>
                            <optgroup label="✨ Interior Venues">
                                <option value="/images/moods/interior-venues-day-atrium.png">Atrium - Day</option>
                                <option value="/images/moods/interior-venues-day-promenade.png">Promenade - Day</option>
                                <option value="/images/moods/interior-venues-night-ballroom.png">Ballroom - Night</option>
                                <option value="/images/moods/interior-venues-night-lounge.png">Lounge/Casino - Night</option>
                            </optgroup>
                            <optgroup label="🏊 Resort Decks">
                                <option value="/images/moods/resort-decks-day-main-pool.png">Main Pool - Day</option>
                                <option value="/images/moods/resort-decks-day-solarium.png">Solarium - Day</option>
                                <option value="/images/moods/resort-decks-night-main-pool.png">Main Pool - Night</option>
                                <option value="/images/moods/resort-decks-night-spa.png">Spa/Thermal - Night</option>
                            </optgroup>
                            <optgroup label="🏝️ Tropical Beaches">
                                <option value="/images/moods/tropical-beaches-day-pristine-beach.png">Pristine Beach - Day</option>
                                <option value="/images/moods/tropical-beaches-day-private-island.png">Private Island - Day</option>
                                <option value="/images/moods/tropical-beaches-night-beach-bonfire.png">Beach Bonfire - Night</option>
                                <option value="/images/moods/tropical-beaches-night-palm-silhouettes.png">Palm Bay - Night</option>
                            </optgroup>
                            <optgroup label="🌅 Balcony Views">
                                <option value="/images/moods/balcony-views-day-ocean-view.png">Open Ocean View - Day</option>
                                <option value="/images/moods/balcony-views-day-port-arrival.png">Port Arrival - Day</option>
                                <option value="/images/moods/balcony-views-night-stargazing.png">Stargazing - Night</option>
                                <option value="/images/moods/balcony-views-night-port-departure.png">Port Departure - Night</option>
                            </optgroup>
                            <optgroup label="🍽️ Culinary Venues">
                                <option value="/images/moods/culinary-venues-day-oceanfront-cafe.png">Oceanfront Cafe - Day</option>
                                <option value="/images/moods/culinary-venues-day-fine-dining.png">Fine Dining - Day</option>
                                <option value="/images/moods/culinary-venues-night-main-dining-room.png">Main Dining Room - Night</option>
                                <option value="/images/moods/culinary-venues-night-specialty-restaurant.png">Specialty Restaurant - Night</option>
                            </optgroup>
                        </select>
                    </div>
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
    onMessageClick,
}: {
    messages: ChatMessage[];
    isOpen: boolean;
    onToggle: () => void;
    onMessageClick: (index: number) => void;
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
            {messages.map((msg, idx) => (
                <div
                    key={msg.id}
                    onClick={() => {
                        onMessageClick(idx);
                        if (isMobile) onToggle(); // Close drawer on mobile so they can see it
                    }}
                    className={`rounded-lg px-3 py-2 text-sm cursor-pointer hover:brightness-125 transition-all ${msg.role === 'user'
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
                    {msg.display?.form && (
                        <div className="mt-2 text-[10px] text-cyan-300 border border-cyan-500/20 bg-cyan-900/20 px-2 py-1 rounded inline-block">
                            📋 Form attached
                        </div>
                    )}
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
    const [heroImages, setHeroImages] = useState<GoogleImageResult[]>([]);

    // Test state for mood backgrounds
    const [currentMood, setCurrentMood] = useState<string | null>(null);

    const handleInjectMessage = useCallback(
        (text: string, turn: number, form?: ParsedFormDirective) => {
            chat.setHeadline(text);
            chat.setHeadlineTurn(turn);
            if (form) {
                chat.setActiveForm(form);
            }
        },
        [chat]
    );

    const handleImagesResult = useCallback(
        (images: GoogleImageResult[]) => {
            setHeroImages(images);
        },
        []
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
            className="min-h-[calc(100vh-3.5rem)] transition-all duration-300 ease-out relative"
            style={outerStyle}
        >
            {/* Mood background — z:1, sits above layout bg-gradient, below all content */}
            <MoodBackground imagePath={currentMood} />

            {/* All content at z:2 — always above the mood image */}
            <div className="relative" style={{ zIndex: 2 }}>
                {(() => {
                    const isCinematic = !isMobile && chat.headline.length > 500;
                    // Form takes priority — never show images and forms simultaneously
                    const hasRightPanel = !chat.activeForm && heroImages.length > 0 || chat.activeForm;

                    // ── Cinematic desktop split-view ──
                    if (isCinematic) {
                        return (
                            <div className={`flex flex-row items-start gap-10 px-10 xl:px-20 py-12 ${innerHeight} w-full transition-all duration-500`}>
                                {/* Left: Text + Input */}
                                <div className="flex flex-col gap-6 flex-1 min-w-0 justify-center h-full">
                                    <HeroHeadline
                                        text={chat.headline}
                                        responseKey={chat.headlineTurn}
                                        isLoading={chat.isLoading}
                                        gradient={getMoodGradient(currentMood)}
                                    />
                                    <UserMessageRail messages={chat.messages} />
                                    <HeroInputBar isLoading={chat.isLoading} onSend={chat.sendText} />
                                    {chat.error && (
                                        <p className="text-xs text-red-400 font-mono">⚠️ {chat.error}</p>
                                    )}
                                </div>

                                {/* Right: Form OR Image — never both */}
                                {hasRightPanel && (
                                    <div className="flex flex-col gap-6 w-[420px] xl:w-[480px] flex-shrink-0 justify-center h-full">
                                        {chat.activeForm ? (
                                            <DynamicForm
                                                form={chat.activeForm}
                                                isLoading={chat.isLoading}
                                                onSubmit={(data) => {
                                                    const summary = Object.entries(data)
                                                        .map(([k, v]) => `${k}: ${v}`)
                                                        .join(', ');
                                                    chat.sendText(`Form Submitted: [${summary}]`);
                                                    chat.setActiveForm(null);
                                                }}
                                            />
                                        ) : (
                                            <HeroImage images={heroImages} />
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    }

                    // ── Default: centered column ──
                    return (
                        <div className={`flex flex-col items-center justify-center ${innerHeight} gap-6 py-8 transition-all duration-300`}>
                            <HeroHeadline
                                text={chat.headline}
                                responseKey={chat.headlineTurn}
                                isLoading={chat.isLoading}
                                gradient={getMoodGradient(currentMood)}
                            />

                            {chat.activeForm && (
                                <DynamicForm
                                    form={chat.activeForm}
                                    isLoading={chat.isLoading}
                                    onSubmit={(data) => {
                                        const summary = Object.entries(data)
                                            .map(([k, v]) => `${k}: ${v}`)
                                            .join(', ');
                                        chat.sendText(`Form Submitted: [${summary}]`);
                                        chat.setActiveForm(null);
                                    }}
                                />
                            )}

                            {/* Image only when no form is active */}
                            {!chat.activeForm && <HeroImage images={heroImages} />}
                            <UserMessageRail messages={chat.messages} />
                            <HeroInputBar isLoading={chat.isLoading} onSend={chat.sendText} />

                            {chat.error && (
                                <p className="text-xs text-red-400 font-mono text-center">⚠️ {chat.error}</p>
                            )}
                        </div>
                    );
                })()}


                {/* Session info badge — overlaid in the top nav center */}
                <div className="fixed top-0 left-1/2 -translate-x-1/2 z-50 flex items-center h-[3.5rem] pointer-events-none">
                    <span className="text-[10px] font-mono text-slate-600 tracking-wide">
                        {chat.sessionId.slice(0, 28)}… &middot; {chat.messages.length} msgs
                    </span>
                </div>

                {/* Conversation History Drawer (responsive) */}
                <ConversationDrawer
                    messages={chat.messages}
                    isOpen={historyOpen}
                    onToggle={() => setHistoryOpen((o) => !o)}
                    onMessageClick={(index) => {
                        chat.viewPastTurn(index);
                        // Special case: Since our test page handles images separately right now,
                        // we can look at the selected message and clear the images so they don't awkwardly persist.
                        setHeroImages([]);
                    }}
                />

                {/* Secret Dev Drawer (Right — overlays) */}
                <DevDrawer
                    onInjectMessage={handleInjectMessage}
                    onImagesResult={handleImagesResult}
                    currentMood={currentMood}
                    onMoodChange={setCurrentMood}
                />

                {/* Background particle effect */}
                <ParticleOverlay />
            </div>

        </div>
    );
}
