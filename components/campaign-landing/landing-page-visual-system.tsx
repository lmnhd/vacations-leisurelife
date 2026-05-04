import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import type {
    CampaignLandingViewModel,
    LandingFact,
    LandingFaqItem,
    LandingImageAsset,
    LandingPathChoice,
    LandingStorySection,
} from '@/lib/campaigns/landing/view-model';
import { Button } from '@/components/ui/button';
import { CampaignWaitlistForm } from '@/components/campaign-landing/waitlist-form';
import { LandingPageTourConductor } from '@/components/campaign-landing/landing-page-tour-conductor';
import { EditorialHero, ModularHero, NostalgiaHero, ZineHero } from '@/components/campaign-landing/landing-system-heroes';
import { alfa_slab_one, orbitron, prompt } from '@/lib/fonts';

interface CampaignLandingPageVisualSystemProps {
    landing: CampaignLandingViewModel;
    primaryHref?: string;
    secondaryHref?: string;
}

function resolveCtaHrefs(landing: CampaignLandingViewModel, primaryHref?: string, secondaryHref?: string): { primaryHref: string; secondaryHref: string } {
    const waitlistAnchor = '#save-your-place';
    const bookingHref = landing.links.retailBooking ?? landing.links.booking ?? waitlistAnchor;
    const primaryMode = landing.ctas.primary.mode;
    const computedPrimary = primaryHref ?? (primaryMode === 'BOOK_NOW' ? bookingHref : waitlistAnchor);
    const computedSecondary = secondaryHref ?? (landing.ctas.secondary.mode === 'BOOK_NOW' ? bookingHref : waitlistAnchor);
    return { primaryHref: computedPrimary, secondaryHref: computedSecondary };
}

type SystemKey = CampaignLandingViewModel['designSystem']['system'];

interface SystemTheme {
    pageBg: string;
    pageText: string;
    sectionAlt: string;
    surface: string;
    surfaceText: string;
    cardBorder: string;
    softText: string;
    softerText: string;
    accentText: string;
    eyebrowFont: string;
    headingFont: string;
    rule: string;
    badge: string;
    primaryBtnTextColor: string;
    secondaryBtnClasses: string;
    chip: string;
    accentRingShadow: (hex: string) => string;
}

function buildTheme(system: SystemKey): SystemTheme {
    if (system === 'system_1_editorial') {
        return {
            pageBg: 'bg-[#f2ead8] text-stone-950',
            pageText: 'text-stone-950',
            sectionAlt: 'bg-[#ebe1c9]',
            surface: 'bg-[#fff8ea] border border-stone-300',
            surfaceText: 'text-stone-950',
            cardBorder: 'border-stone-300',
            softText: 'text-stone-700',
            softerText: 'text-stone-500',
            accentText: 'text-stone-950',
            eyebrowFont: 'font-mono',
            headingFont: alfa_slab_one.className,
            rule: 'border-stone-400/60',
            badge: 'border border-stone-400 bg-[#fff8ea] text-stone-700',
            primaryBtnTextColor: '#1c1410',
            secondaryBtnClasses: 'border-stone-950 bg-transparent text-stone-950 hover:bg-stone-950/5',
            chip: 'bg-[#fff8ea] text-stone-700',
            accentRingShadow: () => '0 14px 36px rgba(76,46,26,0.18)',
        };
    }
    if (system === 'system_2_nostalgia') {
        return {
            pageBg: 'bg-[#f6e4bf] text-amber-950',
            pageText: 'text-amber-950',
            sectionAlt: 'bg-[#efd9a8]',
            surface: 'bg-[#fff8e8] border border-amber-900/25',
            surfaceText: 'text-amber-950',
            cardBorder: 'border-amber-900/25',
            softText: 'text-amber-900/80',
            softerText: 'text-amber-900/55',
            accentText: 'text-amber-950',
            eyebrowFont: 'font-mono',
            headingFont: alfa_slab_one.className,
            rule: 'border-amber-900/30',
            badge: 'border border-amber-900/30 bg-[#fff8e8] text-amber-900/80',
            primaryBtnTextColor: '#3a210b',
            secondaryBtnClasses: 'border-amber-900 bg-transparent text-amber-950 hover:bg-amber-900/5',
            chip: 'bg-[#fff8e8] text-amber-900/80',
            accentRingShadow: () => '0 14px 36px rgba(120,73,24,0.16)',
        };
    }
    if (system === 'system_3_zine') {
        return {
            pageBg: 'bg-[#f3ead5] text-zinc-950',
            pageText: 'text-zinc-950',
            sectionAlt: 'bg-[#eadfc1]',
            surface: 'bg-[#fff9e8] border-2 border-zinc-950',
            surfaceText: 'text-zinc-950',
            cardBorder: 'border-2 border-zinc-950',
            softText: 'text-zinc-800',
            softerText: 'text-zinc-600',
            accentText: 'text-zinc-950',
            eyebrowFont: 'font-mono',
            headingFont: orbitron.className,
            rule: 'border-zinc-950/40',
            badge: 'border-2 border-zinc-950 bg-[#fff9e8] text-zinc-950',
            primaryBtnTextColor: '#fff9e8',
            secondaryBtnClasses: 'border-2 border-zinc-950 bg-[#fff9e8] text-zinc-950 hover:bg-white shadow-[6px_6px_0_rgba(0,0,0,0.85)]',
            chip: 'bg-[#fff9e8] text-zinc-950 border-2 border-zinc-950',
            accentRingShadow: () => '6px 6px 0 rgba(0,0,0,0.85)',
        };
    }
    return {
        pageBg: 'bg-[#08090d] text-white',
        pageText: 'text-white',
        sectionAlt: 'bg-[#0c0e14]',
        surface: 'bg-white/[0.04] border border-white/10',
        surfaceText: 'text-white',
        cardBorder: 'border-white/10',
        softText: 'text-white/75',
        softerText: 'text-white/45',
        accentText: 'text-white',
        eyebrowFont: 'font-mono',
        headingFont: '',
        rule: 'border-white/10',
        badge: 'border border-white/15 bg-white/[0.05] text-white/75',
        primaryBtnTextColor: '#08090d',
        secondaryBtnClasses: 'border-white/20 bg-transparent text-white hover:bg-white/5',
        chip: 'bg-white/[0.05] text-white/80',
        accentRingShadow: (hex: string) => `0 16px 50px ${hex}33`,
    };
}

function HeroDispatcher(props: { landing: CampaignLandingViewModel; primaryHref: string; secondaryHref: string }) {
    const system = props.landing.designSystem.system;
    if (system === 'system_1_editorial') return <EditorialHero {...props} />;
    if (system === 'system_2_nostalgia') return <NostalgiaHero {...props} />;
    if (system === 'system_3_zine') return <ZineHero {...props} />;
    return <ModularHero {...props} />;
}

interface SectionShellProps {
    theme: SystemTheme;
    eyebrow: string;
    title: string;
    description?: string;
    children: ReactNode;
    alt?: boolean;
    accentHex: string;
}

function SectionShell({ theme, eyebrow, title, description, children, alt, accentHex }: SectionShellProps) {
    return (
        <section className={`${alt ? theme.sectionAlt : ''} border-t ${theme.rule}`}>
            <div className="mx-auto w-full max-w-7xl px-4 py-14 md:px-6 md:py-20 lg:px-8">
                <header className="max-w-2xl">
                    <p className={`${theme.eyebrowFont} text-[10px] uppercase tracking-[0.32em]`} style={{ color: accentHex }}>{eyebrow}</p>
                    <h2 className={`${theme.headingFont} mt-3 text-3xl leading-tight md:text-4xl ${theme.pageText}`}>{title}</h2>
                    {description && <p className={`mt-4 text-base leading-7 ${theme.softText}`}>{description}</p>}
                </header>
                <div className="mt-8">{children}</div>
            </div>
        </section>
    );
}

// ── Itinerary / How It Works (system-specific layouts) ───────────────────────

function ItineraryEditorial({ steps, theme, accentHex }: { steps: LandingStorySection[]; theme: SystemTheme; accentHex: string }) {
    return (
        <ol className={`divide-y ${theme.rule} border-y ${theme.rule}`}>
            {steps.map((step, i) => (
                <li key={step.title} className="grid gap-6 py-6 md:grid-cols-[5rem_1fr_2fr]">
                    <span className={`${alfa_slab_one.className} text-5xl leading-none`} style={{ color: accentHex }}>{String(i + 1).padStart(2, '0')}</span>
                    <h3 className={`font-serif text-xl italic ${theme.pageText}`}>{step.title.replace(/^\d+\.\s*/, '')}</h3>
                    <p className={`text-base leading-7 ${theme.softText}`}>{step.body}</p>
                </li>
            ))}
        </ol>
    );
}

function ItineraryNostalgia({ steps, theme, accentHex }: { steps: LandingStorySection[]; theme: SystemTheme; accentHex: string }) {
    return (
        <div className="grid gap-5">
            {steps.map((step, i) => (
                <div key={step.title} className={`relative grid gap-4 border border-dashed border-amber-900/40 bg-[#fff8e8] p-5 shadow-[0_14px_36px_rgba(120,73,24,0.14)] md:grid-cols-[7rem_1fr]`}>
                    <div className="border-r border-dashed border-amber-900/30 pr-4">
                        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-900/60">Stamp {i + 1}</p>
                        <p className={`${alfa_slab_one.className} mt-2 text-3xl`} style={{ color: accentHex }}>№{i + 1}</p>
                    </div>
                    <div>
                        <p className={`font-serif text-xl italic ${theme.pageText}`}>{step.title.replace(/^\d+\.\s*/, '')}</p>
                        <p className={`mt-2 text-sm leading-7 ${theme.softText}`}>{step.body}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}

function ItineraryZine({ steps, theme, accentHex }: { steps: LandingStorySection[]; theme: SystemTheme; accentHex: string }) {
    return (
        <div className="border-2 border-zinc-950 bg-[#fff9e8] shadow-[8px_8px_0_rgba(0,0,0,0.85)]">
            <div className="border-b-2 border-zinc-950 bg-zinc-950 px-5 py-3">
                <p className={`${orbitron.className} text-sm font-black uppercase tracking-[0.32em] text-[#fff9e8]`}>SIDE B — TRACKLIST</p>
            </div>
            <ol className="divide-y-2 divide-dashed divide-zinc-950/30">
                {steps.map((step, i) => (
                    <li key={step.title} className="grid gap-2 px-5 py-4 md:grid-cols-[3.5rem_1fr]">
                        <span className={`${orbitron.className} text-3xl font-black`} style={{ color: accentHex }}>{String(i + 1).padStart(2, '0')}</span>
                        <div>
                            <p className={`${orbitron.className} text-base font-black uppercase tracking-tight ${theme.pageText}`}>
                                {step.title.replace(/^\d+\.\s*/, '')}
                            </p>
                            <p className={`mt-1 text-sm leading-6 ${theme.softText}`}>{step.body}</p>
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    );
}

function ItineraryModular({ steps, theme, accentHex }: { steps: LandingStorySection[]; theme: SystemTheme; accentHex: string }) {
    return (
        <div className="grid gap-4 md:grid-cols-3">
            {steps.map((step, i) => (
                <div key={step.title} className={`${theme.surface} relative p-6`}>
                    <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-white/45">Step {String(i + 1).padStart(2, '0')}</span>
                        <span className="block h-1 w-8" style={{ backgroundColor: accentHex }} />
                    </div>
                    <h3 className={`mt-5 text-xl font-bold ${theme.pageText}`}>{step.title.replace(/^\d+\.\s*/, '')}</h3>
                    <p className={`mt-3 text-sm leading-7 ${theme.softText}`}>{step.body}</p>
                </div>
            ))}
        </div>
    );
}

function Itinerary({ system, steps, theme, accentHex }: { system: SystemKey; steps: LandingStorySection[]; theme: SystemTheme; accentHex: string }) {
    if (system === 'system_1_editorial') return <ItineraryEditorial steps={steps} theme={theme} accentHex={accentHex} />;
    if (system === 'system_2_nostalgia') return <ItineraryNostalgia steps={steps} theme={theme} accentHex={accentHex} />;
    if (system === 'system_3_zine') return <ItineraryZine steps={steps} theme={theme} accentHex={accentHex} />;
    return <ItineraryModular steps={steps} theme={theme} accentHex={accentHex} />;
}

// ── Generic styled sections ──────────────────────────────────────────────────

function StatusPanel({ landing, theme, accentHex }: { landing: CampaignLandingViewModel; theme: SystemTheme; accentHex: string }) {
    const pct = Math.max(0, Math.min(100, landing.threshold.percentOfThreshold));
    return (
        <div className={`${theme.surface} grid gap-6 p-6 md:p-8 lg:grid-cols-[1.1fr_0.9fr]`}>
            <div>
                <p className={`${theme.eyebrowFont} text-[10px] uppercase tracking-[0.32em]`} style={{ color: accentHex }}>Group Status</p>
                <h3 className={`mt-3 text-2xl font-bold leading-tight md:text-3xl ${theme.pageText}`}>{landing.threshold.headline}</h3>
                <p className={`mt-3 text-sm leading-7 ${theme.softText}`}>{landing.threshold.detail}</p>
                <div className="mt-6">
                    <div className={`relative h-2 w-full overflow-hidden ${theme.cardBorder} border`}>
                        <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, backgroundColor: accentHex }} />
                    </div>
                    <div className={`mt-3 flex items-center justify-between text-xs ${theme.softerText}`}>
                        <span>{landing.threshold.joinedPassengers} guests · {landing.threshold.joinedEntries} entries</span>
                        <span style={{ color: accentHex }}>{pct}% of {landing.threshold.requiredCabins} cabins</span>
                    </div>
                </div>
            </div>
            <div className={`grid gap-3 ${theme.cardBorder} border p-5`}>
                <p className={`${theme.eyebrowFont} text-[10px] uppercase tracking-[0.32em] ${theme.softerText}`}>Pricing Desk</p>
                <p className={`text-3xl font-black ${theme.pageText}`}>{landing.pricing.startingPriceLabel}</p>
                <p className="text-sm font-semibold" style={{ color: accentHex }}>{landing.pricing.sourceLabel}</p>
                <p className={`text-sm leading-7 ${theme.softText}`}>{landing.pricing.detail}</p>
            </div>
        </div>
    );
}

function Gallery({ images, theme, system }: { images: LandingImageAsset[]; theme: SystemTheme; system: SystemKey }) {
    if (images.length === 0) return null;
    if (system === 'system_3_zine') {
        return (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {images.slice(0, 6).map((img, i) => {
                    const tilt = ['rotate-[-2deg]', 'rotate-[1.5deg]', 'rotate-[-1deg]', 'rotate-[2deg]', 'rotate-[-2.5deg]', 'rotate-[1deg]'][i] ?? '';
                    return (
                        <div key={img.url} className={`${tilt} border-[10px] border-white bg-white p-1 shadow-[8px_8px_0_rgba(0,0,0,0.85)]`}>
                            <div className="aspect-square overflow-hidden bg-zinc-200">
                                <div className="h-full w-full bg-cover bg-center contrast-[1.05]" style={{ backgroundImage: `url(${img.url})` }} />
                            </div>
                            <p className="px-2 py-2 text-center font-mono text-[10px] uppercase tracking-wider text-zinc-700">deck note {String(i + 1).padStart(2, '0')}</p>
                        </div>
                    );
                })}
            </div>
        );
    }
    if (system === 'system_2_nostalgia') {
        return (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {images.slice(0, 6).map((img, i) => (
                    <div key={img.url} className={`${i % 2 === 0 ? 'rotate-[-1deg]' : 'rotate-[1deg]'} border-[10px] border-[#fff8e8] bg-[#fff8e8] p-1 shadow-[0_14px_40px_rgba(120,73,24,0.18)]`}>
                        <div className="aspect-[4/3] overflow-hidden bg-amber-200">
                            <div className="h-full w-full bg-cover bg-center sepia-[0.1]" style={{ backgroundImage: `url(${img.url})` }} />
                        </div>
                        <p className="px-2 py-3 text-center font-serif text-sm italic text-amber-900/70">{img.alt}</p>
                    </div>
                ))}
            </div>
        );
    }
    if (system === 'system_1_editorial') {
        return (
            <div className="grid gap-8 lg:grid-cols-3">
                {images.slice(0, 6).map((img, i) => (
                    <figure key={img.url} className="space-y-3">
                        <div className="aspect-[4/5] overflow-hidden border border-stone-400/50 bg-stone-200 grayscale-[0.15]">
                            <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${img.url})` }} />
                        </div>
                        <figcaption className="font-mono text-[10px] uppercase tracking-[0.28em] text-stone-500">
                            Plate {String(i + 1).padStart(2, '0')} — {img.alt}
                        </figcaption>
                    </figure>
                ))}
            </div>
        );
    }
    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {images.slice(0, 6).map((img) => (
                <div key={img.url} className={`${theme.cardBorder} border bg-white/[0.03]`}>
                    <div className="aspect-[4/3] overflow-hidden">
                        <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${img.url})` }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

function ExperienceList({ items, theme, accentHex }: { items: string[]; theme: SystemTheme; accentHex: string }) {
    return (
        <div className="grid gap-4 md:grid-cols-2">
            {items.map((item, i) => (
                <div key={i} className={`${theme.surface} flex items-start gap-4 p-5`}>
                    <span className={`${theme.eyebrowFont} mt-1 inline-block min-w-8 text-sm font-bold`} style={{ color: accentHex }}>
                        {String(i + 1).padStart(2, '0')}
                    </span>
                    <p className={`text-sm leading-7 ${theme.softText}`}>{item}</p>
                </div>
            ))}
        </div>
    );
}

function PathChoices({ choices, theme, accentHex }: { choices: LandingPathChoice[]; theme: SystemTheme; accentHex: string }) {
    return (
        <div className="grid gap-4 md:grid-cols-2">
            {choices.map((choice) => (
                <div
                    key={choice.mode}
                    className={`${theme.surface} relative p-6`}
                    style={choice.highlighted ? { boxShadow: theme.accentRingShadow(accentHex), borderColor: accentHex } : undefined}
                >
                    {choice.highlighted && (
                        <span className="absolute -top-3 left-5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.28em]" style={{ backgroundColor: accentHex, color: theme.primaryBtnTextColor }}>
                            Recommended
                        </span>
                    )}
                    <p className={`${theme.eyebrowFont} text-[10px] uppercase tracking-[0.32em] ${theme.softerText}`}>{choice.mode === 'GROUP_WAIT' ? 'Path A' : 'Path B'}</p>
                    <h3 className={`mt-2 text-xl font-bold ${theme.pageText}`}>{choice.label}</h3>
                    <p className={`mt-3 text-sm leading-7 ${theme.softText}`}>{choice.description}</p>
                </div>
            ))}
        </div>
    );
}

function FaqList({ items, theme }: { items: LandingFaqItem[]; theme: SystemTheme }) {
    return (
        <div className={`divide-y ${theme.rule} border-y ${theme.rule}`}>
            {items.map((item) => (
                <div key={item.question} className="grid gap-3 py-6 md:grid-cols-[1fr_2fr]">
                    <h4 className={`text-base font-bold ${theme.pageText}`}>{item.question}</h4>
                    <p className={`text-sm leading-7 ${theme.softText}`}>{item.answer}</p>
                </div>
            ))}
        </div>
    );
}

function FactsRail({ facts, theme, accentHex }: { facts: LandingFact[]; theme: SystemTheme; accentHex: string }) {
    if (facts.length === 0) return null;
    return (
        <div className={`${theme.surface} grid grid-cols-2 divide-x ${theme.rule} md:grid-cols-3 lg:grid-cols-6`}>
            {facts.slice(0, 6).map((fact) => (
                <div key={fact.label} className="px-4 py-5">
                    <p className="font-mono text-[9px] uppercase tracking-[0.32em]" style={{ color: accentHex }}>{fact.label}</p>
                    <p className={`mt-2 text-sm font-bold ${theme.pageText}`}>{fact.value}</p>
                </div>
            ))}
        </div>
    );
}

// ── Main entry ───────────────────────────────────────────────────────────────

export function CampaignLandingPageVisualSystem({ landing, primaryHref: primaryHrefProp, secondaryHref: secondaryHrefProp }: CampaignLandingPageVisualSystemProps) {
    const system = landing.designSystem.system;
    const theme = buildTheme(system);
    const accentHex = landing.designSystem.accentHex;
    const pageStyle: CSSProperties = { ['--accent' as string]: accentHex };
    const { primaryHref, secondaryHref } = resolveCtaHrefs(landing, primaryHrefProp, secondaryHrefProp);

    return (
        <div className={`${prompt.className} min-h-screen ${theme.pageBg}`} style={pageStyle}>
            {landing.preview && (
                <div className="border-b border-yellow-500/40 bg-yellow-500/15 px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.3em] text-yellow-700">
                    Draft preview · not yet public
                </div>
            )}

            <HeroDispatcher landing={landing} primaryHref={primaryHref} secondaryHref={secondaryHref} />

            <SectionShell theme={theme} eyebrow="Voyage Brief" title={landing.story.whatItIs.title} description={landing.story.whatItIs.body} accentHex={accentHex}>
                <FactsRail facts={landing.facts} theme={theme} accentHex={accentHex} />
            </SectionShell>

            <SectionShell theme={theme} eyebrow="Group Progress" title="Where this sailing stands today" accentHex={accentHex} alt>
                <StatusPanel landing={landing} theme={theme} accentHex={accentHex} />
            </SectionShell>

            <SectionShell theme={theme} eyebrow="What to expect" title="The mood we are designing for" description={landing.subSlogan} accentHex={accentHex}>
                <ExperienceList items={landing.story.whatToExpect} theme={theme} accentHex={accentHex} />
            </SectionShell>

            {landing.galleryImages.length > 0 && (
                <SectionShell theme={theme} eyebrow="Field Plates" title="What this voyage looks like" accentHex={accentHex} alt>
                    <Gallery images={landing.galleryImages} theme={theme} system={system} />
                </SectionShell>
            )}

            <SectionShell theme={theme} eyebrow="How it works" title="Three steps from interest to booking" accentHex={accentHex}>
                <Itinerary system={system} steps={landing.story.howItWorks} theme={theme} accentHex={accentHex} />
            </SectionShell>

            <SectionShell theme={theme} eyebrow="Choose your pace" title="Two ways to join this sailing" accentHex={accentHex} alt>
                <PathChoices choices={landing.bookingPathChoices} theme={theme} accentHex={accentHex} />
            </SectionShell>

            <SectionShell theme={theme} eyebrow="Why now" title="Reasons to raise your hand early" accentHex={accentHex}>
                <ul className={`grid gap-4 md:grid-cols-${Math.min(landing.story.whyJoinNow.length, 3)}`}>
                    {landing.story.whyJoinNow.map((reason, i) => (
                        <li key={i} className={`${theme.surface} relative p-5`}>
                            <span className="absolute right-4 top-3 font-mono text-[9px] uppercase tracking-[0.3em]" style={{ color: accentHex }}>0{i + 1}</span>
                            <p className={`pr-8 text-sm leading-7 ${theme.softText}`}>{reason}</p>
                        </li>
                    ))}
                </ul>
            </SectionShell>

            <LandingPageTourConductor landing={landing} />

            {landing.form.enabled && (
                <SectionShell theme={theme} eyebrow="Save your place" title="Hold a spot for this sailing" description="No payment is taken on this page. We hold your party size, cabin preference, and the right to reach out when the next step opens." accentHex={accentHex}>
                    <div className={`${theme.surface} p-6 md:p-8`}>
                        <CampaignWaitlistForm
                            campaignName={landing.title}
                            endpoint={landing.form.endpoint}
                            enabled={landing.form.enabled}
                            defaultMode={landing.form.defaultMode}
                            isGatheringInterest={landing.state === 'GATHERING_INTEREST'}
                        />
                    </div>
                </SectionShell>
            )}

            <SectionShell theme={theme} eyebrow="Trust" title="What stays steady on this page" accentHex={accentHex} alt>
                <ul className={`grid gap-3 md:grid-cols-3`}>
                    {landing.trustBullets.map((bullet, i) => (
                        <li key={i} className={`${theme.surface} p-5`}>
                            <p className={`text-sm leading-7 ${theme.softText}`}>{bullet}</p>
                        </li>
                    ))}
                </ul>
            </SectionShell>

            <SectionShell theme={theme} eyebrow="FAQ" title="Quick answers before you join" accentHex={accentHex}>
                <FaqList items={landing.faq} theme={theme} />
            </SectionShell>

            <section className={`border-t ${theme.rule}`}>
                <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-14 md:grid-cols-[1.4fr_1fr] md:px-6 lg:px-8">
                    <div>
                        <h2 className={`${theme.headingFont} text-3xl leading-tight md:text-4xl ${theme.pageText}`}>{landing.designSystem.cta}</h2>
                        <p className={`mt-3 max-w-xl text-base leading-7 ${theme.softText}`}>{landing.ctas.primary.description}</p>
                    </div>
                    <div className="grid gap-3 self-end sm:grid-cols-2">
                        <Button asChild disabled={landing.ctas.primary.disabled} className="min-h-[58px] rounded-none px-6 text-base font-bold" style={{ backgroundColor: accentHex, color: theme.primaryBtnTextColor }}>
                            <a href={primaryHref}>{landing.ctas.primary.label}</a>
                        </Button>
                        <Button asChild variant="outline" disabled={landing.ctas.secondary.disabled} className={`min-h-[58px] rounded-none px-6 text-base font-bold ${theme.secondaryBtnClasses}`}>
                            <a href={secondaryHref}>{landing.ctas.secondary.label}</a>
                        </Button>
                    </div>
                </div>
            </section>

            <footer className={`border-t ${theme.rule} py-10`}>
                <div className={`mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-4 text-xs md:flex-row md:px-6 lg:px-8 ${theme.softerText}`}>
                    <p>{landing.designSystem.issueLabel} · {landing.title}</p>
                    <Link href="/" className="hover:opacity-80">Leisure Life Interactive</Link>
                </div>
            </footer>
        </div>
    );
}
