import type { CampaignLandingViewModel, LandingImageAsset } from '@/lib/campaigns/landing/view-model';
import { Button } from '@/components/ui/button';
import { alfa_slab_one, orbitron } from '@/lib/fonts';

interface HeroProps {
    landing: CampaignLandingViewModel;
    primaryHref: string;
    secondaryHref: string;
}

function externalTarget(href: string) {
    return href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {};
}

function getImage(images: LandingImageAsset[], index: number): LandingImageAsset | null {
    if (images.length === 0) return null;
    return images[index % images.length] ?? null;
}

function splitItalicHeadline(headline: string, italicWord: string): { before: string; italic: string; after: string } {
    if (!italicWord) return { before: headline, italic: '', after: '' };
    const idx = headline.toLowerCase().indexOf(italicWord.toLowerCase());
    if (idx === -1) {
        return { before: headline + ' ', italic: italicWord, after: '' };
    }
    return {
        before: headline.slice(0, idx),
        italic: headline.slice(idx, idx + italicWord.length),
        after: headline.slice(idx + italicWord.length),
    };
}

// =============================================================================
// SYSTEM 4 — Modular: massive type, italic-serif accent word, 4-col metadata
// =============================================================================

export function ModularHero({ landing, primaryHref, secondaryHref }: HeroProps) {
    const { before, italic, after } = splitItalicHeadline(landing.heroSlogan, landing.designSystem.italicWord);
    const trustImage = getImage(landing.trustImages, 0) ?? landing.heroImage;
    const accent = landing.designSystem.accentHex;

    return (
        <section className="relative overflow-hidden border-b border-white/10 bg-[#08090d]">
            <div
                className="pointer-events-none absolute -right-40 -top-40 h-[28rem] w-[28rem] rounded-full opacity-25 blur-3xl"
                style={{ backgroundColor: accent }}
            />
            <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 pb-16 pt-12 md:px-6 lg:grid-cols-[1.35fr_0.65fr] lg:gap-16 lg:px-8 lg:pt-20">
                <div className="flex flex-col justify-between gap-10">
                    <div>
                        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.4em] text-white/45">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
                            <span>{landing.designSystem.issueLabel}</span>
                            <span className="text-white/20">/</span>
                            <span>{landing.stateLabel}</span>
                        </div>
                        <h1 className="mt-7 text-[3.25rem] font-black leading-[0.92] tracking-tight text-white md:text-[5.5rem] lg:text-[6.25rem]">
                            {before}
                            <span className="font-serif italic" style={{ color: accent }}>{italic}</span>
                            {after}
                        </h1>
                        <p className="mt-7 max-w-xl text-base leading-8 text-white/70 md:text-lg">{landing.subSlogan}</p>
                    </div>

                    <div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Button
                                asChild
                                disabled={landing.ctas.primary.disabled}
                                className="min-h-[60px] rounded-none px-6 text-base font-bold text-[#08090d]"
                                style={{ backgroundColor: accent }}
                            >
                                <a href={primaryHref} {...externalTarget(primaryHref)}>{landing.ctas.primary.label} →</a>
                            </Button>
                            <Button
                                asChild
                                variant="outline"
                                disabled={landing.ctas.secondary.disabled}
                                className="min-h-[60px] rounded-none border-white/20 bg-transparent px-6 text-base font-bold text-white hover:bg-white/5"
                            >
                                <a href={secondaryHref} {...externalTarget(secondaryHref)}>{landing.ctas.secondary.label}</a>
                            </Button>
                        </div>
                    </div>
                </div>

                <aside className="flex flex-col gap-5">
                    <div className="border border-white/10 bg-white/[0.03] p-5">
                        <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-white/45">VOYAGE BRIEF</p>
                        <p className="mt-3 text-sm leading-7 text-white/75">{landing.elevatorPitch}</p>
                    </div>
                    <div className="border-l-2 pl-5" style={{ borderColor: accent }}>
                        <p className="font-serif text-xl italic leading-8 text-white/85">&ldquo;{landing.designSystem.quote}&rdquo;</p>
                        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.28em] text-white/40">— {landing.designSystem.quoteCite}</p>
                    </div>
                    {trustImage?.url && (
                        <div className="aspect-[7/5] overflow-hidden border border-white/10 bg-white/5">
                            <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${trustImage.url})` }} />
                        </div>
                    )}
                </aside>
            </div>

            <div className="border-t border-white/10 bg-black/30">
                <div className="mx-auto grid w-full max-w-7xl grid-cols-2 px-4 md:grid-cols-4 md:px-6 lg:px-8">
                    {landing.facts.slice(0, 4).map((fact, i) => (
                        <div key={fact.label} className={`px-2 py-5 ${i > 0 ? 'border-l border-white/10' : ''}`}>
                            <p className="font-mono text-[9px] uppercase tracking-[0.32em] text-white/40">{fact.label}</p>
                            <p className="mt-2 text-base font-bold text-white">{fact.value}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

// =============================================================================
// SYSTEM 1 — Editorial Magazine: masthead, blurb teasers, folio, cover photo
// =============================================================================

export function EditorialHero({ landing, primaryHref, secondaryHref }: HeroProps) {
    const heroImage = landing.heroImage;
    const accent = landing.designSystem.accentHex;
    const blurbs = [
        landing.designSystem.sectionLabels[0],
        landing.designSystem.sectionLabels[1],
        landing.designSystem.sectionLabels[2],
    ].filter(Boolean);

    return (
        <section className="bg-[#f2ead8] text-stone-950">
            <div className="mx-auto w-full max-w-7xl px-4 pb-12 pt-10 md:px-6 lg:px-8 lg:pt-16">
                <header className="flex items-end justify-between border-b-[3px] border-stone-950 pb-4">
                    <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-stone-500">Vol. 01 · {landing.designSystem.issueLabel}</p>
                        <h1 className={`${alfa_slab_one.className} mt-2 text-5xl leading-[0.85] tracking-tight md:text-7xl lg:text-[7rem]`}>
                            {landing.title}
                        </h1>
                    </div>
                    <div className="hidden text-right md:block">
                        <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-stone-500">{landing.stateLabel}</p>
                        <p className="mt-2 font-serif text-sm italic">{landing.designSystem.quoteCite}</p>
                    </div>
                </header>

                <div className="grid gap-10 pt-10 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="relative">
                        <div className="aspect-[3/4] overflow-hidden border border-stone-950 bg-stone-200 shadow-[20px_20px_0_rgba(76,46,26,0.18)]">
                            {heroImage?.url ? (
                                <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${heroImage.url})` }} />
                            ) : (
                                <div className="h-full w-full" style={{ background: `linear-gradient(135deg, ${accent}, #5b3a1a)` }} />
                            )}
                        </div>
                        <span
                            className={`${alfa_slab_one.className} absolute -left-2 top-6 -rotate-90 origin-top-left text-[10px] uppercase tracking-[0.4em]`}
                            style={{ color: accent }}
                        >
                            FEATURE — {landing.designSystem.sectionLabels[0]}
                        </span>
                    </div>

                    <div className="flex flex-col gap-7">
                        <div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.32em]" style={{ color: accent }}>The Cover Story</p>
                            <h2 className="mt-3 font-serif text-4xl leading-[1.05] md:text-5xl">
                                <span className="italic">{landing.designSystem.italicWord}</span>{' '}
                                <span>— {landing.heroSlogan.replace(landing.designSystem.italicWord, '').trim()}</span>
                            </h2>
                            <p className="mt-5 max-w-xl text-base leading-8 text-stone-700">{landing.subSlogan}</p>
                        </div>

                        <div className="border-y border-stone-400/50 py-5">
                            <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-stone-500">Inside this issue</p>
                            <ul className="mt-4 grid gap-3">
                                {blurbs.map((blurb, i) => (
                                    <li key={blurb} className="flex items-baseline gap-4">
                                        <span className={`${alfa_slab_one.className} text-2xl`} style={{ color: accent }}>
                                            {String(i + 1).padStart(2, '0')}
                                        </span>
                                        <span className="font-serif text-lg leading-7">{blurb}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <blockquote className="border-l-4 pl-5" style={{ borderColor: accent }}>
                            <p className="font-serif text-xl italic leading-8 text-stone-800">&ldquo;{landing.designSystem.quote}&rdquo;</p>
                            <cite className="mt-3 block font-mono text-[10px] uppercase not-italic tracking-[0.32em] text-stone-500">
                                — {landing.designSystem.quoteCite}
                            </cite>
                        </blockquote>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <Button
                                asChild
                                disabled={landing.ctas.primary.disabled}
                                className="min-h-[58px] rounded-none px-6 text-base font-bold"
                                style={{ backgroundColor: '#1c1410', color: '#f2ead8' }}
                            >
                                <a href={primaryHref} {...externalTarget(primaryHref)}>{landing.ctas.primary.label}</a>
                            </Button>
                            <Button
                                asChild
                                variant="outline"
                                disabled={landing.ctas.secondary.disabled}
                                className="min-h-[58px] rounded-none border-stone-950 bg-transparent text-base font-bold text-stone-950 hover:bg-stone-950/5"
                            >
                                <a href={secondaryHref} {...externalTarget(secondaryHref)}>{landing.ctas.secondary.label}</a>
                            </Button>
                        </div>
                    </div>
                </div>

                <footer className="mt-12 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-stone-400/50 pt-5 font-mono text-[10px] uppercase tracking-[0.28em] text-stone-600 md:grid-cols-4">
                    {landing.facts.slice(0, 4).map((fact) => (
                        <div key={fact.label}>
                            <span className="text-stone-400">{fact.label}: </span>
                            <span className="text-stone-900">{fact.value}</span>
                        </div>
                    ))}
                </footer>
            </div>
        </section>
    );
}

// =============================================================================
// SYSTEM 2 — Travel Nostalgia: postcard with stamp, postmark, handwriting
// =============================================================================

export function NostalgiaHero({ landing, primaryHref, secondaryHref }: HeroProps) {
    const heroImage = landing.heroImage;
    const accent = landing.designSystem.accentHex;

    return (
        <section className="relative bg-[#f6e4bf] py-12 text-amber-950 md:py-16">
            <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 md:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
                {/* The postcard */}
                <div className="relative">
                    <div className="relative rotate-[-1.2deg] border-[14px] border-[#fff8e8] bg-[#fff8e8] p-2 shadow-[0_30px_70px_rgba(101,60,18,0.25)]">
                        <div className="aspect-[5/3] overflow-hidden bg-amber-200">
                            {heroImage?.url ? (
                                <div className="h-full w-full bg-cover bg-center sepia-[0.15] saturate-[0.9]" style={{ backgroundImage: `url(${heroImage.url})` }} />
                            ) : (
                                <div className="h-full w-full" style={{ background: `linear-gradient(135deg, ${accent}, #b16f24)` }} />
                            )}
                        </div>

                        {/* Postage stamp */}
                        <div className="absolute -right-3 -top-3 rotate-[6deg] border-2 border-amber-900 bg-[#fff8e8] p-2" style={{ boxShadow: '0 0 0 4px #fff8e8, 0 0 0 5px #78491880' }}>
                            <div className="h-20 w-16 border border-dashed border-amber-900/50 px-1 py-2 text-center">
                                <p className={`${alfa_slab_one.className} text-[8px] uppercase leading-tight`} style={{ color: accent }}>
                                    {landing.designSystem.issueLabel}
                                </p>
                                <p className="mt-1 font-serif text-[9px] italic leading-tight text-amber-950">{landing.designSystem.italicWord}</p>
                                <p className={`${alfa_slab_one.className} mt-1 text-[10px]`}>$1</p>
                            </div>
                        </div>

                        {/* Circular postmark */}
                        <div className="absolute -left-4 top-2 flex h-24 w-24 rotate-[-12deg] items-center justify-center rounded-full border-[2px] border-amber-900/60 text-center">
                            <div className="font-mono text-[8px] uppercase leading-tight tracking-widest text-amber-900/80">
                                <p>★ POSTED ★</p>
                                <p className="my-1 border-y border-amber-900/40 py-1 text-[9px]">{landing.facts.find(f => f.label === 'Sailing')?.value ?? landing.designSystem.issueLabel}</p>
                                <p>{landing.facts.find(f => f.label === 'Departure Port')?.value?.split(',')[0] ?? 'Port'}</p>
                            </div>
                        </div>
                    </div>

                    {/* Handwritten greeting card below */}
                    <div className="relative mt-8 ml-8 max-w-md rotate-[1deg] border border-amber-900/20 bg-[#fff8e8] p-6 shadow-[0_18px_50px_rgba(101,60,18,0.18)]">
                        <p className="font-serif text-2xl italic leading-snug text-amber-950">
                            Wish you were here —
                        </p>
                        <p className="mt-3 font-serif text-base leading-7 italic text-amber-900/85">
                            {landing.designSystem.quote}
                        </p>
                        <p className="mt-4 text-right font-serif text-sm italic text-amber-900/70">— {landing.designSystem.quoteCite}</p>
                    </div>
                </div>

                <div className="flex flex-col justify-between gap-8">
                    <div>
                        <div className="inline-flex items-center gap-3 border border-amber-900/40 bg-[#fff8e8] px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.32em] text-amber-900/80">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
                            {landing.stateLabel} · Voyage Post
                        </div>
                        <h1 className={`${alfa_slab_one.className} mt-6 text-5xl leading-[0.95] tracking-tight md:text-7xl`}>
                            {landing.heroSlogan}
                        </h1>
                        <p className="mt-6 max-w-xl font-serif text-lg leading-8 italic text-amber-900/80">
                            {landing.subSlogan}
                        </p>
                    </div>

                    {/* Boarding pass mini-artifact */}
                    <div className="border border-amber-900/30 bg-[#fff8e8] shadow-[0_18px_50px_rgba(101,60,18,0.16)]">
                        <div className="grid grid-cols-[1.2fr_auto_1fr]">
                            <div className="p-4">
                                <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-amber-900/60">From</p>
                                <p className={`${alfa_slab_one.className} mt-1 text-2xl`}>
                                    {landing.facts.find(f => f.label === 'Departure Port')?.value?.split(',')[0]?.toUpperCase() ?? 'PORT'}
                                </p>
                            </div>
                            <div className="flex items-center justify-center border-x border-dashed border-amber-900/30 px-3 text-3xl text-amber-900/50">
                                ✈
                            </div>
                            <div className="p-4 text-right">
                                <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-amber-900/60">To</p>
                                <p className={`${alfa_slab_one.className} mt-1 text-2xl`}>
                                    {landing.facts.find(f => f.label === 'Destination')?.value?.toUpperCase() ?? 'AT SEA'}
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 border-t border-dashed border-amber-900/30 bg-[#f6e4bf]/40 p-3 font-mono text-[9px] uppercase tracking-[0.24em] text-amber-900/70">
                            <div>
                                <p className="text-amber-900/50">Vessel</p>
                                <p className="mt-1 text-amber-950">{landing.facts.find(f => f.label === 'Ship')?.value ?? '—'}</p>
                            </div>
                            <div>
                                <p className="text-amber-900/50">Sailing</p>
                                <p className="mt-1 text-amber-950">{landing.facts.find(f => f.label === 'Sailing')?.value ?? '—'}</p>
                            </div>
                            <div>
                                <p className="text-amber-900/50">Cabin</p>
                                <p className="mt-1 text-amber-950">{landing.facts.find(f => f.label === 'Duration')?.value ?? 'TBA'}</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <Button
                            asChild
                            disabled={landing.ctas.primary.disabled}
                            className="min-h-[58px] rounded-none px-6 text-base font-bold text-amber-950"
                            style={{ backgroundColor: accent }}
                        >
                            <a href={primaryHref} {...externalTarget(primaryHref)}>{landing.ctas.primary.label}</a>
                        </Button>
                        <Button
                            asChild
                            variant="outline"
                            disabled={landing.ctas.secondary.disabled}
                            className="min-h-[58px] rounded-none border-amber-900 bg-transparent text-base font-bold text-amber-950 hover:bg-amber-900/5"
                        >
                            <a href={secondaryHref} {...externalTarget(secondaryHref)}>{landing.ctas.secondary.label}</a>
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    );
}

// =============================================================================
// SYSTEM 3 — Indie Zine: polaroids, masking tape, marker, torn banner
// =============================================================================

export function ZineHero({ landing, primaryHref, secondaryHref }: HeroProps) {
    const accent = landing.designSystem.accentHex;
    const polaroids = [
        landing.heroImage,
        getImage(landing.galleryImages, 0),
        getImage(landing.galleryImages, 1),
        getImage(landing.trustImages, 0),
    ].filter((img): img is LandingImageAsset => Boolean(img?.url));

    const tilts = ['rotate-[-4deg]', 'rotate-[3deg]', 'rotate-[-1deg]', 'rotate-[5deg]'];
    const captions = landing.designSystem.sectionLabels.slice(0, 4);

    return (
        <section className="relative overflow-hidden bg-[#f3ead5] py-12 text-zinc-950 md:py-16">
            {/* Photocopy grain overlay */}
            <div
                className="pointer-events-none absolute inset-0 opacity-30 mix-blend-multiply"
                style={{
                    backgroundImage: 'radial-gradient(circle at 25% 35%, rgba(0,0,0,0.08) 1px, transparent 1.5px), radial-gradient(circle at 75% 65%, rgba(0,0,0,0.06) 1px, transparent 1.5px)',
                    backgroundSize: '6px 6px, 9px 9px',
                }}
            />

            <div className="relative mx-auto w-full max-w-7xl px-4 md:px-6 lg:px-8">
                {/* Torn banner top */}
                <div className="relative mb-8">
                    <div
                        className="inline-block -rotate-1 px-6 py-3 shadow-[8px_8px_0_rgba(0,0,0,0.85)]"
                        style={{
                            backgroundColor: accent,
                            color: '#fff9e8',
                            clipPath: 'polygon(0 8%, 5% 0, 12% 6%, 22% 0, 32% 8%, 45% 2%, 60% 8%, 75% 0, 88% 6%, 100% 0, 100% 92%, 95% 100%, 85% 94%, 70% 100%, 55% 92%, 40% 100%, 25% 92%, 12% 100%, 0 94%)',
                        }}
                    >
                        <p className={`${orbitron.className} text-2xl font-black uppercase tracking-tight md:text-4xl`}>
                            ★ {landing.designSystem.issueLabel} ★ {landing.stateLabel}
                        </p>
                    </div>
                </div>

                <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
                    {/* Polaroid collage */}
                    <div className="relative min-h-[460px]">
                        {polaroids.map((img, i) => {
                            const positions = [
                                'left-0 top-0',
                                'left-[35%] top-6',
                                'left-[12%] top-[55%]',
                                'left-[55%] top-[48%]',
                            ];
                            return (
                                <div
                                    key={i}
                                    className={`absolute w-[58%] max-w-[280px] ${positions[i]} ${tilts[i]} border-[10px] border-white bg-white p-1 shadow-[8px_8px_0_rgba(0,0,0,0.85)]`}
                                    style={{ zIndex: 10 + i }}
                                >
                                    {/* masking tape */}
                                    <div
                                        className="absolute -top-3 left-1/3 h-5 w-16 -rotate-12 opacity-80"
                                        style={{ backgroundColor: 'rgba(255, 235, 130, 0.7)', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }}
                                    />
                                    <div className="aspect-square overflow-hidden bg-zinc-200">
                                        <div className="h-full w-full bg-cover bg-center contrast-[1.05]" style={{ backgroundImage: `url(${img.url})` }} />
                                    </div>
                                    <p className="px-2 py-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-700">
                                        {captions[i] ?? `track ${String(i + 1).padStart(2, '0')}`}
                                    </p>
                                </div>
                            );
                        })}
                        {/* Sticky note */}
                        <div className="absolute bottom-0 right-0 z-30 w-44 rotate-[4deg] bg-yellow-200 p-4 shadow-[6px_6px_0_rgba(0,0,0,0.7)]">
                            <p className="font-serif text-lg italic leading-tight text-zinc-900">
                                &ldquo;{landing.designSystem.quote.slice(0, 80)}{landing.designSystem.quote.length > 80 ? '...' : ''}&rdquo;
                            </p>
                            <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-zinc-700">— {landing.designSystem.quoteCite}</p>
                        </div>
                    </div>

                    {/* Right column */}
                    <div className="flex flex-col justify-between gap-7">
                        <div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-zinc-600">Side A · Track Listing</p>
                            <h1 className={`${orbitron.className} mt-4 text-5xl font-black uppercase leading-[0.92] tracking-tight md:text-6xl`}>
                                {landing.heroSlogan}
                            </h1>
                            {/* marker scribble */}
                            <p
                                className="mt-3 inline-block -rotate-2 font-serif text-2xl italic"
                                style={{ color: accent, textDecoration: `underline wavy ${accent}` }}
                            >
                                {landing.designSystem.italicWord}!!
                            </p>
                            <p className="mt-5 max-w-xl text-base leading-7 text-zinc-800">{landing.subSlogan}</p>
                        </div>

                        {/* Tracklist mini facts */}
                        <div className="border-2 border-zinc-950 bg-[#fff9e8] shadow-[6px_6px_0_rgba(0,0,0,0.85)]">
                            <div className="border-b-2 border-zinc-950 bg-zinc-950 px-4 py-2">
                                <p className={`${orbitron.className} font-black uppercase tracking-widest text-[#fff9e8]`}>RUN OF SHOW</p>
                            </div>
                            <ul className="divide-y-2 divide-dashed divide-zinc-950/30">
                                {landing.facts.slice(0, 4).map((fact, i) => (
                                    <li key={fact.label} className="flex items-baseline gap-3 px-4 py-2.5">
                                        <span className={`${orbitron.className} text-sm font-black`} style={{ color: accent }}>
                                            {String(i + 1).padStart(2, '0')}.
                                        </span>
                                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">{fact.label}</span>
                                        <span className="ml-auto text-sm font-bold text-zinc-950">{fact.value}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <Button
                                asChild
                                disabled={landing.ctas.primary.disabled}
                                className="min-h-[58px] rounded-none border-2 border-zinc-950 px-6 text-base font-black uppercase shadow-[6px_6px_0_rgba(0,0,0,0.95)]"
                                style={{ backgroundColor: accent, color: '#fff9e8' }}
                            >
                                <a href={primaryHref} {...externalTarget(primaryHref)}>► {landing.ctas.primary.label}</a>
                            </Button>
                            <Button
                                asChild
                                variant="outline"
                                disabled={landing.ctas.secondary.disabled}
                                className="min-h-[58px] rounded-none border-2 border-zinc-950 bg-[#fff9e8] px-6 text-base font-black uppercase text-zinc-950 shadow-[6px_6px_0_rgba(0,0,0,0.95)] hover:bg-white"
                            >
                                <a href={secondaryHref} {...externalTarget(secondaryHref)}>{landing.ctas.secondary.label}</a>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
