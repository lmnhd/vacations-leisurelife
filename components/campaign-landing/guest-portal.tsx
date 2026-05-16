'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type {
    CampaignLandingViewModel,
    LandingFact,
    LandingFaqItem,
    LandingImageAsset,
    LandingPathChoice,
} from '@/lib/campaigns/landing/view-model';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { CampaignWaitlistForm, type GuestIdentity } from '@/components/campaign-landing/waitlist-form';
import { GroupChatHall } from '@/components/campaign-landing/group-chat-hall';
import { EditorialHero, ModularHero, NostalgiaHero, ZineHero } from '@/components/campaign-landing/landing-system-heroes';
import { Itinerary } from '@/components/campaign-landing/landing-system-itinerary';
import { alfa_slab_one, orbitron, prompt as promptFont } from '@/lib/fonts';

interface GuestPortalProps {
    landing: CampaignLandingViewModel;
    primaryHref?: string;
    secondaryHref?: string;
    /** True when the guest just arrived from the verification email link. */
    emailJustVerified?: boolean;
    /** True when the verification link failed. */
    emailVerifyError?: boolean;
    /** Optional guest token returned from the verification redirect. */
    verifiedGuestToken?: string;
}

type SystemKey = CampaignLandingViewModel['designSystem']['system'];

interface SystemTheme {
    pageBg: string;
    pageText: string;
    sectionAlt: string;
    surface: string;
    cardBorder: string;
    softText: string;
    softerText: string;
    eyebrowFont: string;
    headingFont: string;
    rule: string;
    primaryBtnTextColor: string;
    secondaryBtnClasses: string;
    accentRingShadow: (hex: string) => string;
}

function buildTheme(system: SystemKey): SystemTheme {
    if (system === 'system_1_editorial') {
        return {
            pageBg: 'bg-[#f2ead8] text-stone-950',
            pageText: 'text-stone-950',
            sectionAlt: 'bg-[#ebe1c9]',
            surface: 'bg-[#fff8ea] border border-stone-300',
            cardBorder: 'border-stone-300',
            softText: 'text-stone-700',
            softerText: 'text-stone-500',
            eyebrowFont: 'font-mono',
            headingFont: alfa_slab_one.className,
            rule: 'border-stone-400/60',
            primaryBtnTextColor: '#1c1410',
            secondaryBtnClasses: 'border-stone-950 bg-transparent text-stone-950 hover:bg-stone-950/5',
            accentRingShadow: () => '0 14px 36px rgba(76,46,26,0.18)',
        };
    }
    if (system === 'system_2_nostalgia') {
        return {
            pageBg: 'bg-[#f6e4bf] text-amber-950',
            pageText: 'text-amber-950',
            sectionAlt: 'bg-[#efd9a8]',
            surface: 'bg-[#fff8e8] border border-amber-900/25',
            cardBorder: 'border-amber-900/25',
            softText: 'text-amber-900/80',
            softerText: 'text-amber-900/55',
            eyebrowFont: 'font-mono',
            headingFont: alfa_slab_one.className,
            rule: 'border-amber-900/30',
            primaryBtnTextColor: '#3a210b',
            secondaryBtnClasses: 'border-amber-900 bg-transparent text-amber-950 hover:bg-amber-900/5',
            accentRingShadow: () => '0 14px 36px rgba(120,73,24,0.16)',
        };
    }
    if (system === 'system_3_zine') {
        return {
            pageBg: 'bg-[#f3ead5] text-zinc-950',
            pageText: 'text-zinc-950',
            sectionAlt: 'bg-[#eadfc1]',
            surface: 'bg-[#fff9e8] border-2 border-zinc-950',
            cardBorder: 'border-2 border-zinc-950',
            softText: 'text-zinc-800',
            softerText: 'text-zinc-600',
            eyebrowFont: 'font-mono',
            headingFont: orbitron.className,
            rule: 'border-zinc-950/40',
            primaryBtnTextColor: '#fff9e8',
            secondaryBtnClasses: 'border-2 border-zinc-950 bg-[#fff9e8] text-zinc-950 hover:bg-white shadow-[6px_6px_0_rgba(0,0,0,0.85)]',
            accentRingShadow: () => '6px 6px 0 rgba(0,0,0,0.85)',
        };
    }
    return {
        pageBg: 'bg-[#08090d] text-white',
        pageText: 'text-white',
        sectionAlt: 'bg-[#0c0e14]',
        surface: 'bg-white/[0.04] border border-white/10',
        cardBorder: 'border-white/10',
        softText: 'text-white/75',
        softerText: 'text-white/45',
        eyebrowFont: 'font-mono',
        headingFont: '',
        rule: 'border-white/10',
        primaryBtnTextColor: '#08090d',
        secondaryBtnClasses: 'border-white/20 bg-transparent text-white hover:bg-white/5',
        accentRingShadow: (hex: string) => `0 16px 50px ${hex}33`,
    };
}

function resolveCtaHrefs(
    landing: CampaignLandingViewModel,
    primaryHref?: string,
    secondaryHref?: string,
): { primaryHref: string; secondaryHref: string; bookingHref: string | null } {
    const waitlistAnchor = '#save-your-place';
    const bookingHref = landing.links.retailBooking ?? landing.links.booking ?? null;
    const primaryMode = landing.ctas.primary.mode;
    const computedPrimary =
        primaryHref ??
        (primaryMode === 'BOOK_NOW' && !landing.ctas.primary.disabled
            ? bookingHref ?? waitlistAnchor
            : waitlistAnchor);
    const computedSecondary =
        secondaryHref ??
        (landing.ctas.secondary.mode === 'BOOK_NOW'
            ? bookingHref ?? waitlistAnchor
            : waitlistAnchor);
    return { primaryHref: computedPrimary, secondaryHref: computedSecondary, bookingHref };
}

function HeroDispatcher(props: { landing: CampaignLandingViewModel; primaryHref: string; secondaryHref: string }) {
    const system = props.landing.designSystem.system;
    if (system === 'system_1_editorial') return <EditorialHero {...props} />;
    if (system === 'system_2_nostalgia') return <NostalgiaHero {...props} />;
    if (system === 'system_3_zine') return <ZineHero {...props} />;
    return <ModularHero {...props} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sections — full bleed wrappers
// ─────────────────────────────────────────────────────────────────────────────

interface BleedSectionProps {
    theme: SystemTheme;
    eyebrow: string;
    title: string;
    description?: string;
    children: ReactNode;
    alt?: boolean;
    accentHex: string;
    /** Cap content width inside the full-bleed shell. */
    contentMaxWidth?: 'narrow' | 'wide' | 'full';
}

function BleedSection({ theme, eyebrow, title, description, children, alt, accentHex, contentMaxWidth = 'wide' }: BleedSectionProps) {
    const widthClass = contentMaxWidth === 'narrow' ? 'max-w-4xl' : contentMaxWidth === 'full' ? 'max-w-none' : 'max-w-7xl';
    return (
        <section className={`w-full ${alt ? theme.sectionAlt : ''} border-t ${theme.rule}`}>
            <div className={`mx-auto w-full ${widthClass} px-4 py-14 md:px-8 md:py-20`}>
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

function PhotoStrip({ images, system }: { images: LandingImageAsset[]; system: SystemKey }) {
    const active = images.filter((img) => img.url).slice(0, 4);
    if (active.length === 0) return null;
    const filter = system === 'system_1_editorial' ? 'grayscale(0.2) contrast(1.05) saturate(0.85)'
        : system === 'system_2_nostalgia' ? 'sepia(0.18) saturate(0.9)'
        : system === 'system_3_zine' ? 'contrast(1.08) saturate(1.08)'
        : 'saturate(0.65) brightness(0.75)';
    return (
        <div className="grid w-full overflow-hidden" style={{ gridTemplateColumns: `repeat(${active.length}, 1fr)`, height: 168 }}>
            {active.map((img, i) => (
                <div key={i} className="relative overflow-hidden">
                    <div
                        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 hover:scale-105"
                        style={{ backgroundImage: `url(${img.url})`, filter }}
                    />
                </div>
            ))}
        </div>
    );
}

function StatusStrip({ landing, theme, accentHex }: { landing: CampaignLandingViewModel; theme: SystemTheme; accentHex: string }) {
    const pct = Math.max(0, Math.min(100, landing.threshold.percentOfThreshold));
    return (
        <div className={`grid w-full grid-cols-1 gap-0 md:grid-cols-[2fr_1fr_1fr] divide-x ${theme.rule} divide-y md:divide-y-0`}>
            <div className="px-6 py-7 md:px-8">
                <p className={`${theme.eyebrowFont} text-[10px] uppercase tracking-[0.32em]`} style={{ color: accentHex }}>Group Status</p>
                <h3 className={`mt-2 text-xl font-bold leading-tight md:text-2xl ${theme.pageText}`}>{landing.threshold.headline}</h3>
                <p className={`mt-2 text-sm leading-6 ${theme.softText}`}>{landing.threshold.detail}</p>
                <div className="mt-4">
                    <div className={`relative h-2 w-full overflow-hidden ${theme.cardBorder} border`}>
                        <div className="absolute inset-y-0 left-0 transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: accentHex }} />
                    </div>
                    <div className={`mt-2 flex items-center justify-between text-xs ${theme.softerText}`}>
                        <span>{landing.threshold.joinedPassengers} guests · {landing.threshold.joinedEntries} entries</span>
                        <span style={{ color: accentHex }}>{pct}% of {landing.threshold.requiredCabins} cabins</span>
                    </div>
                </div>
            </div>
            <div className="px-6 py-7 md:px-8">
                <p className={`${theme.eyebrowFont} text-[10px] uppercase tracking-[0.32em] ${theme.softerText}`}>Pricing</p>
                <p className={`mt-2 text-3xl font-black ${theme.pageText}`}>{landing.pricing.startingPriceLabel}</p>
                <p className="mt-1 text-sm font-semibold" style={{ color: accentHex }}>{landing.pricing.sourceLabel}</p>
                <p className={`mt-2 text-xs leading-5 ${theme.softText}`}>{landing.pricing.detail}</p>
            </div>
            <div className="px-6 py-7 md:px-8">
                <p className={`${theme.eyebrowFont} text-[10px] uppercase tracking-[0.32em] ${theme.softerText}`}>Voyage</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                    {landing.facts.slice(0, 4).map((fact) => (
                        <li key={fact.label} className={theme.pageText}>
                            <span className={`mr-2 font-mono text-[10px] uppercase tracking-[0.22em] ${theme.softerText}`}>{fact.label}</span>
                            <span className="font-semibold">{fact.value}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function ExperienceList({ items, theme, accentHex }: { items: string[]; theme: SystemTheme; accentHex: string }) {
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item, i) => (
                <div key={i} className={`${theme.surface} relative flex items-start gap-4 overflow-hidden p-5`}>
                    <span
                        className="pointer-events-none absolute -bottom-3 -right-1 select-none font-mono text-8xl font-black"
                        style={{ color: accentHex, opacity: 0.06 }}
                    >
                        {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className={`${theme.eyebrowFont} mt-1 shrink-0 text-sm font-bold`} style={{ color: accentHex }}>
                        {String(i + 1).padStart(2, '0')}
                    </span>
                    <p className={`relative z-10 text-sm leading-7 ${theme.softText}`}>{item}</p>
                </div>
            ))}
        </div>
    );
}

function PathChoices({
    choices,
    theme,
    accentHex,
}: {
    choices: LandingPathChoice[];
    theme: SystemTheme;
    accentHex: string;
}) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Main entry — full-bleed Guest Portal
// ─────────────────────────────────────────────────────────────────────────────

const IDENTITY_KEY_PREFIX = 'chat-guest:';
const IDENTITY_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const FORMING_NOTICE_KEY_PREFIX = 'campaign-forming-notice:v1:';

interface StoredIdentity extends GuestIdentity {
    expiresAt: number;
}

function readStoredIdentity(slug: string): GuestIdentity | null {
    try {
        const raw = localStorage.getItem(`${IDENTITY_KEY_PREFIX}${slug}`);
        if (!raw) return null;
        const stored = JSON.parse(raw) as StoredIdentity;
        if (stored.expiresAt < Date.now()) {
            localStorage.removeItem(`${IDENTITY_KEY_PREFIX}${slug}`);
            return null;
        }
        return {
            guestToken: stored.guestToken,
            displayName: stored.displayName,
            emailVerified: Boolean(stored.emailVerified),
        };
    } catch {
        return null;
    }
}

function writeStoredIdentity(slug: string, identity: GuestIdentity) {
    try {
        const stored: StoredIdentity = {
            ...identity,
            expiresAt: Date.now() + IDENTITY_TTL_MS,
        };
        localStorage.setItem(`${IDENTITY_KEY_PREFIX}${slug}`, JSON.stringify(stored));
    } catch {
        // localStorage unavailable (SSR, private browsing with blocked storage) — silent fail.
    }
}

export function GuestPortal({ landing, primaryHref: primaryHrefProp, secondaryHref: secondaryHrefProp, emailJustVerified, emailVerifyError, verifiedGuestToken }: GuestPortalProps) {
    const system = landing.designSystem.system;
    const theme = buildTheme(system);
    const accentHex = landing.designSystem.accentHex;
    const pageStyle: CSSProperties = { ['--accent' as string]: accentHex };
    const { primaryHref, secondaryHref } = resolveCtaHrefs(landing, primaryHrefProp, secondaryHrefProp);
    const images = landing.galleryImages.filter((img) => img.url.trim().length > 0);

    const [guestIdentity, setGuestIdentity] = useState<GuestIdentity | null>(null);
    const [isCampaignNoticeOpen, setIsCampaignNoticeOpen] = useState(false);

    // Restore identity from localStorage on mount (client-only).
    useEffect(() => {
        const stored = readStoredIdentity(landing.slug);
        if (stored) setGuestIdentity(stored);
    }, [landing.slug]);

    useEffect(() => {
        if (!emailJustVerified) return;

        const stored = readStoredIdentity(landing.slug);
        if (stored) {
            const verifiedIdentity: GuestIdentity = {
                ...stored,
                emailVerified: true,
            };
            writeStoredIdentity(landing.slug, verifiedIdentity);
            setGuestIdentity(verifiedIdentity);
        } else if (verifiedGuestToken) {
            const verifiedIdentity: GuestIdentity = {
                guestToken: verifiedGuestToken,
                displayName: 'Guest',
                emailVerified: true,
            };
            writeStoredIdentity(landing.slug, verifiedIdentity);
            setGuestIdentity(verifiedIdentity);
        }

        document.getElementById('group-chat-hall')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [emailJustVerified, verifiedGuestToken, landing.slug]);

    useEffect(() => {
        if (!landing.campaignNotice) {
            setIsCampaignNoticeOpen(false);
            return;
        }

        try {
            const hasSeenNotice = localStorage.getItem(`${FORMING_NOTICE_KEY_PREFIX}${landing.slug}`);
            if (!hasSeenNotice) {
                setIsCampaignNoticeOpen(true);
            }
        } catch {
            setIsCampaignNoticeOpen(true);
        }
    }, [landing.campaignNotice, landing.slug]);

    function dismissCampaignNotice() {
        try {
            localStorage.setItem(`${FORMING_NOTICE_KEY_PREFIX}${landing.slug}`, '1');
        } catch {
            // localStorage unavailable — keep the dismissal in memory for this session.
        }
        setIsCampaignNoticeOpen(false);
    }

    function handleGuestRegistered(identity: GuestIdentity) {
        writeStoredIdentity(landing.slug, identity);
        setGuestIdentity(identity);
        if (identity.emailVerified) {
            document.getElementById('group-chat-hall')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    return (
        <div className={`${promptFont.className} min-h-screen w-full ${theme.pageBg}`} style={pageStyle}>
            {landing.campaignNotice && (
                <Dialog
                    open={isCampaignNoticeOpen}
                    onOpenChange={(open) => {
                        if (!open) {
                            dismissCampaignNotice();
                            return;
                        }
                        setIsCampaignNoticeOpen(true);
                    }}
                >
                    <DialogContent
                        size="medium"
                        className="border-white/10 bg-[#0c0e14] text-white shadow-[0_30px_100px_rgba(0,0,0,0.45)]"
                    >
                        <DialogHeader>
                            <p className={`${theme.eyebrowFont} text-[10px] uppercase tracking-[0.32em]`} style={{ color: accentHex }}>
                                {landing.campaignNotice.eyebrow}
                            </p>
                            <DialogTitle className={`${theme.headingFont} text-2xl leading-tight text-white md:text-3xl`}>
                                {landing.campaignNotice.modalTitle}
                            </DialogTitle>
                            <DialogDescription className="text-sm leading-7 text-white/75">
                                {landing.campaignNotice.modalBody}
                            </DialogDescription>
                        </DialogHeader>
                        <ul className="grid gap-3">
                            {landing.campaignNotice.modalBullets.map((bullet, index) => (
                                <li key={index} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-7 text-white/78">
                                    {bullet}
                                </li>
                            ))}
                        </ul>
                        <DialogFooter className="sm:justify-start">
                            <Button
                                type="button"
                                className="w-full sm:w-auto"
                                style={{ backgroundColor: accentHex, color: theme.primaryBtnTextColor }}
                                onClick={dismissCampaignNotice}
                            >
                                {landing.campaignNotice.dismissLabel}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
            {landing.preview && (
                <div className="border-b border-yellow-500/40 bg-yellow-500/15 px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.3em] text-yellow-700">
                    Draft preview · not yet public
                </div>
            )}
            {emailJustVerified && (
                <div className="border-b border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-center text-sm font-semibold text-emerald-200">
                    ✓ Email verified — your interest now counts toward the group threshold.
                </div>
            )}
            {emailVerifyError && (
                <div className="border-b border-rose-500/40 bg-rose-500/15 px-4 py-3 text-center text-sm font-semibold text-rose-200">
                    Verification link expired or invalid. Please re-submit the form to receive a new link.
                </div>
            )}

            {/* 1) Hero — system-themed, full bleed */}
            <HeroDispatcher landing={landing} primaryHref={primaryHref} secondaryHref={secondaryHref} />

            {landing.campaignNotice && (
                <section className={`w-full border-t border-b ${theme.rule} ${theme.sectionAlt}`}>
                    <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 md:grid-cols-[1.2fr_1fr] md:px-8">
                        <div>
                            <p className={`${theme.eyebrowFont} text-[10px] uppercase tracking-[0.32em]`} style={{ color: accentHex }}>
                                {landing.campaignNotice.eyebrow}
                            </p>
                            <h2 className={`${theme.headingFont} mt-3 text-2xl leading-tight md:text-3xl ${theme.pageText}`}>
                                {landing.campaignNotice.title}
                            </h2>
                            <p className={`mt-4 max-w-2xl text-sm leading-7 ${theme.softText}`}>
                                {landing.campaignNotice.body}
                            </p>
                        </div>
                        <div className="grid gap-3">
                            {landing.campaignNotice.bullets.map((bullet, index) => (
                                <div key={index} className={`${theme.surface} p-4`}>
                                    <p className={`text-sm leading-7 ${theme.softText}`}>{bullet}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* Inventory status banner — shown only when group block has changed */}
            {landing.inventoryDisclosure.bannerVisible && (
                <div className={`w-full px-5 py-4 text-sm font-medium leading-6 md:px-8 ${
                    landing.inventoryDisclosure.mode === 'INVENTORY_FAILED_PAUSED'
                        ? 'bg-red-900/80 text-red-100'
                        : 'bg-amber-800/80 text-amber-100'
                }`}>
                    <p className="mx-auto max-w-5xl">{landing.inventoryDisclosure.bannerCopy}</p>
                </div>
            )}

            {/* 2) Group Chat Hall — full-width centerpiece */}
            <GroupChatHall landing={landing} guestIdentity={guestIdentity} />

            {/* 3) Status strip — compact pricing + threshold + facts */}
            <section className={`w-full border-t ${theme.rule} ${theme.sectionAlt}`}>
                <StatusStrip landing={landing} theme={theme} accentHex={accentHex} />
            </section>

            {/* 4) Atmospheric photo strip */}
            <PhotoStrip images={images} system={system} />

            {/* 5) Voyage brief — what it is + why now */}
            <BleedSection theme={theme} eyebrow="Voyage Brief" title={landing.story.whatItIs.title} description={landing.story.whatItIs.body} accentHex={accentHex} contentMaxWidth="wide">
                <ul className={`grid gap-4 md:grid-cols-${Math.min(landing.story.whyJoinNow.length, 3)}`}>
                    {landing.story.whyJoinNow.map((reason, i) => (
                        <li key={i} className={`${theme.surface} relative overflow-hidden p-5`}>
                            <span
                                className="pointer-events-none absolute -bottom-4 -right-2 select-none font-mono text-9xl font-black"
                                style={{ color: accentHex, opacity: 0.07 }}
                            >
                                {String(i + 1).padStart(2, '0')}
                            </span>
                            <div className="flex items-start gap-3">
                                <span className={`${theme.eyebrowFont} mt-0.5 shrink-0 text-2xl font-black leading-none`} style={{ color: accentHex }}>
                                    {String(i + 1).padStart(2, '0')}
                                </span>
                                <p className={`text-sm leading-7 ${theme.softText}`}>{reason}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            </BleedSection>

            {/* 6) On board */}
            <BleedSection
                theme={theme}
                eyebrow={landing.designSystem.sectionLabels[1] ?? landing.designSystem.issueLabel}
                title={`On board: ${landing.designSystem.sectionLabels[0] ?? landing.title}`}
                accentHex={accentHex}
                alt
            >
                <ExperienceList items={landing.story.whatToExpect} theme={theme} accentHex={accentHex} />
            </BleedSection>

            {/* 7) Inline pull-quote on photo (if available) */}
            {images.length >= 2 && (
                <div className={`relative h-56 w-full overflow-hidden border-t border-b ${theme.rule}`}>
                    <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${images[1]?.url})` }}
                    />
                    <div className={`absolute inset-0 ${system === 'system_4_modular' ? 'bg-black/60' : 'bg-black/35'}`} />
                    <div className="relative z-10 mx-auto flex h-full w-full max-w-7xl items-center px-6 md:px-10">
                        <blockquote>
                            <p className="max-w-2xl text-2xl font-medium italic leading-9 text-white/95 md:text-3xl">
                                &ldquo;{landing.designSystem.quote}&rdquo;
                            </p>
                            <cite className="mt-3 block text-[10px] font-semibold uppercase not-italic tracking-[0.28em] text-white/60">
                                {landing.designSystem.quoteCite}
                            </cite>
                        </blockquote>
                    </div>
                </div>
            )}

            {/* 8) How it works + inventory process note */}
            <BleedSection
                theme={theme}
                eyebrow="How it works"
                title={landing.state === 'GATHERING_INTEREST' ? 'Three steps from interest to possible booking' : 'Three steps from interest to booking'}
                accentHex={accentHex}
            >
                <Itinerary
                    system={system}
                    steps={landing.story.howItWorks}
                    theme={{
                        rule: theme.rule,
                        pageText: theme.pageText,
                        softText: theme.softText,
                        eyebrowFont: theme.eyebrowFont,
                        headingFont: theme.headingFont,
                        surface: theme.surface,
                    }}
                    accentHex={accentHex}
                />
                <p className={`mt-6 max-w-3xl text-sm leading-7 ${theme.softText} opacity-80`}>
                    {landing.inventoryDisclosure.processNote}
                </p>
            </BleedSection>

            {/* 9) FAQ */}
            <BleedSection theme={theme} eyebrow="FAQ" title="Quick answers before you join" accentHex={accentHex} contentMaxWidth="narrow">
                <FaqList items={landing.faq} theme={theme} />
            </BleedSection>

            {/* 10) Trust */}
            <BleedSection theme={theme} eyebrow="Trust" title="What stays steady on this page" accentHex={accentHex} alt>
                <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {landing.trustBullets.map((bullet, i) => (
                        <li key={i} className={`${theme.surface} p-5`}>
                            <p className={`text-sm leading-7 ${theme.softText}`}>{bullet}</p>
                        </li>
                    ))}
                </ul>
            </BleedSection>

            {/* 11) Waitlist */}
            {(landing.form.enabled || landing.preview) && (
                <BleedSection
                    theme={theme}
                    eyebrow="Save your place"
                    title={landing.state === 'GATHERING_INTEREST' ? 'Raise your hand for this forming sailing' : 'Hold a spot for this sailing'}
                    description={landing.state === 'GATHERING_INTEREST'
                        ? 'This step is free and non-binding. We save your party size, cabin preference, and the right to reach out if the campaign matures into the proper next step.'
                        : 'No payment is taken on this page. We hold your party size, cabin preference, and the right to reach out when the next step opens.'}
                    accentHex={accentHex}
                    contentMaxWidth="narrow"
                >
                    <div id="save-your-place" className={`${theme.surface} p-6 md:p-8`}>
                        <CampaignWaitlistForm
                            campaignName={landing.title}
                            endpoint={landing.form.endpoint}
                            enabled={landing.form.enabled || landing.preview}
                            defaultMode={landing.form.defaultMode}
                            isGatheringInterest={landing.state === 'GATHERING_INTEREST'}
                            onGuestRegistered={handleGuestRegistered}
                        />
                        <p className={`mt-4 text-xs leading-5 ${theme.softText} opacity-60`}>
                            {landing.inventoryDisclosure.formAcknowledgement}
                        </p>
                    </div>
                </BleedSection>
            )}

            {/* 12) Final CTA strip */}
            <section className={`w-full border-t ${theme.rule}`}>
                <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-14 md:grid-cols-[1.4fr_1fr] md:px-8">
                    <div>
                        <h2 className={`${theme.headingFont} text-3xl leading-tight md:text-4xl ${theme.pageText}`}>{landing.designSystem.cta}</h2>
                        <p className={`mt-3 max-w-xl text-base leading-7 ${theme.softText}`}>
                            {landing.state === 'GATHERING_INTEREST'
                                ? 'The form below is where you tell us whether you want to help the shared group version form or simply want the earliest possible booking handoff if the trip stabilizes.'
                                : 'The form below is where you tell us whether you want the shared group path or the faster booking path.'}
                        </p>
                    </div>
                    <div className="flex items-end">
                        <a
                            href="#save-your-place"
                            className="text-base font-bold underline underline-offset-4 transition hover:opacity-80"
                            style={{ color: accentHex }}
                        >
                            Go to the form
                        </a>
                    </div>
                </div>
            </section>

            <footer className={`w-full border-t ${theme.rule} py-10`}>
                <div className={`mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-4 text-xs md:flex-row md:px-8 ${theme.softerText}`}>
                    <p>{landing.designSystem.issueLabel} · {landing.title}</p>
                    <Link href="/" className="hover:opacity-80">Leisure Life Interactive</Link>
                </div>
            </footer>
        </div>
    );
}

// Helper export to keep accessible facts type stable elsewhere if imported.
export type { LandingFact };
