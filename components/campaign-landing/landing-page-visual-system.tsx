import type { CampaignLandingViewModel, LandingImageAsset } from '@/lib/campaigns/landing/view-model';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { prompt, alfa_slab_one } from '@/lib/fonts';
import { CampaignWaitlistForm } from './waitlist-form';
import { LandingPageTourConductor } from './landing-page-tour-conductor';

interface CampaignLandingPageVisualSystemProps {
    landing: CampaignLandingViewModel;
}

type SystemStyle = {
    page: string;
    panel: string;
    subtlePanel: string;
    label: string;
    heroFrame: string;
    imageFrame: string;
    button: string;
    sectionTitle: string;
    artifactLabel: string;
};

const SYSTEM_STYLES: Record<CampaignLandingViewModel['designSystem']['system'], SystemStyle> = {
    system_4_modular: {
        page: 'bg-[#08090d] text-stone-50',
        panel: 'border border-white/10 bg-white/[0.06] backdrop-blur',
        subtlePanel: 'border border-white/10 bg-white/[0.035]',
        label: 'text-white/60',
        heroFrame: 'border border-white/10 bg-black/30 shadow-[0_40px_120px_rgba(0,0,0,0.35)]',
        imageFrame: 'overflow-hidden border border-white/10 bg-white/5',
        button: 'rounded-none',
        sectionTitle: 'font-black tracking-tight',
        artifactLabel: 'Campaign',
    },
    system_1_editorial: {
        page: 'bg-[#f2ead8] text-stone-950',
        panel: 'border border-stone-300 bg-[#fff8ea] shadow-[0_28px_80px_rgba(86,55,30,0.12)]',
        subtlePanel: 'border border-stone-300 bg-[#f7efd9]',
        label: 'text-stone-500',
        heroFrame: 'border border-stone-950 bg-[#fff8ea] shadow-[18px_18px_0_rgba(68,42,26,0.16)]',
        imageFrame: 'overflow-hidden border border-stone-950 bg-stone-100',
        button: 'rounded-none',
        sectionTitle: `${alfa_slab_one.className} tracking-tight`,
        artifactLabel: 'Issue Desk',
    },
    system_2_nostalgia: {
        page: 'bg-[#f6e4bf] text-amber-950',
        panel: 'border border-amber-900/25 bg-[#fff3d6] shadow-[0_28px_80px_rgba(120,73,24,0.14)]',
        subtlePanel: 'border border-amber-900/20 bg-[#f9e9c8]',
        label: 'text-amber-900/60',
        heroFrame: 'rotate-[-1deg] border-[10px] border-[#fff8e8] bg-[#fff8e8] shadow-[0_32px_80px_rgba(101,60,18,0.2)]',
        imageFrame: 'overflow-hidden border-[8px] border-[#fff8e8] bg-[#fff8e8] shadow-md',
        button: 'rounded-none',
        sectionTitle: 'font-black tracking-tight',
        artifactLabel: 'Voyage Post',
    },
    system_3_zine: {
        page: 'bg-[#f3ead5] text-zinc-950',
        panel: 'border-2 border-zinc-950 bg-[#fff9e8] shadow-[8px_8px_0_rgba(0,0,0,0.92)]',
        subtlePanel: 'border-2 border-zinc-950 bg-white',
        label: 'text-zinc-600',
        heroFrame: 'rotate-[0.7deg] border-2 border-zinc-950 bg-[#fff9e8] shadow-[12px_12px_0_rgba(0,0,0,0.95)]',
        imageFrame: '-rotate-2 overflow-hidden border-[10px] border-white bg-white shadow-[6px_6px_0_rgba(0,0,0,0.85)]',
        button: 'rounded-none border-2 border-zinc-950 shadow-[4px_4px_0_rgba(0,0,0,0.9)]',
        sectionTitle: 'font-black uppercase tracking-tight',
        artifactLabel: 'Deck Notes',
    },
};

function getImage(images: LandingImageAsset[], index: number): LandingImageAsset | null {
    if (images.length === 0) return null;
    return images[index % images.length] ?? null;
}

function primaryHref(landing: CampaignLandingViewModel): string {
    if (
        landing.links.booking &&
        landing.ctas.primary.mode === 'BOOK_NOW' &&
        !landing.ctas.primary.disabled &&
        (landing.state === 'THRESHOLD_MET' || landing.state === 'CONVERTED')
    ) {
        return landing.links.booking;
    }

    return '#save-your-place';
}

function secondaryHref(landing: CampaignLandingViewModel): string {
    if (
        landing.links.booking &&
        landing.ctas.secondary.mode === 'BOOK_NOW' &&
        !landing.ctas.secondary.disabled &&
        (landing.state === 'THRESHOLD_MET' || landing.state === 'CONVERTED')
    ) {
        return landing.links.booking;
    }

    return '#save-your-place';
}

function externalTarget(href: string) {
    return href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {};
}

function HeroImage({ landing, style }: { landing: CampaignLandingViewModel; style: SystemStyle }) {
    const supporting = getImage(landing.galleryImages, 1);

    return (
        <div className={`relative min-h-[440px] ${style.heroFrame}`}>
            {landing.heroImage?.url ? (
                <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${landing.heroImage.url})` }}
                />
            ) : (
                <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${landing.surfaceColor}, #111827)` }} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
            <div className="relative z-10 flex h-full min-h-[440px] flex-col justify-between p-6 text-white md:p-8">
                <div className="flex items-center justify-between gap-4">
                    <span className="border border-white/25 bg-black/25 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]">
                        {style.artifactLabel}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.24em] text-white/65">
                        {landing.designSystem.issueLabel}
                    </span>
                </div>
                <div>
                    <p className="max-w-lg text-sm leading-7 text-white/78">{landing.elevatorPitch}</p>
                    {supporting?.url && (
                        <div
                            className="mt-5 h-24 w-32 border-[6px] border-white bg-cover bg-center shadow-xl"
                            style={{ backgroundImage: `url(${supporting.url})` }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

function SystemHero({ landing, style }: { landing: CampaignLandingViewModel; style: SystemStyle }) {
    const pHref = primaryHref(landing);
    const sHref = secondaryHref(landing);

    return (
        <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 pb-12 pt-10 md:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:pb-18 lg:pt-16">
            <div className="flex flex-col justify-between gap-8">
                <div>
                    {landing.preview && (
                        <div className="mb-5 inline-flex border border-amber-400/50 bg-amber-300/10 px-3 py-1 text-xs text-amber-500">
                            Preview mode - this page is not publicly visible
                        </div>
                    )}
                    <p className={`text-xs font-semibold uppercase tracking-[0.28em] ${style.label}`}>
                        {landing.stateLabel} / {landing.designSystem.issueLabel}
                    </p>
                    <h1 className={`${style.sectionTitle} mt-5 text-5xl leading-[0.95] md:text-7xl`}>
                        {landing.heroSlogan}
                    </h1>
                    <p className="mt-6 max-w-2xl text-lg leading-8 opacity-75 md:text-xl">
                        {landing.subSlogan}
                    </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Button
                        asChild
                        disabled={landing.ctas.primary.disabled}
                        className={`min-h-[56px] px-5 py-4 text-base font-bold ${style.button}`}
                        style={{ backgroundColor: landing.designSystem.accentHex, color: '#0f172a' }}
                    >
                        <a href={pHref} {...externalTarget(pHref)}>{landing.ctas.primary.label}</a>
                    </Button>
                    <Button
                        asChild
                        variant="outline"
                        disabled={landing.ctas.secondary.disabled}
                        className={`min-h-[56px] border-current bg-transparent px-5 py-4 text-base font-bold ${style.button}`}
                    >
                        <a href={sHref} {...externalTarget(sHref)}>{landing.ctas.secondary.label}</a>
                    </Button>
                </div>
            </div>

            <HeroImage landing={landing} style={style} />
        </section>
    );
}

function FactsRail({ landing, style }: { landing: CampaignLandingViewModel; style: SystemStyle }) {
    return (
        <section className="mx-auto w-full max-w-7xl px-4 md:px-6 lg:px-8">
            <div className={`grid ${style.panel} sm:grid-cols-2 lg:grid-cols-4`}>
                {landing.facts.map((fact) => (
                    <div key={fact.label} className="border-b border-current/10 p-5 lg:border-b-0 lg:border-r last:border-r-0">
                        <p className={`text-[10px] font-bold uppercase tracking-[0.22em] ${style.label}`}>{fact.label}</p>
                        <p className="mt-2 text-lg font-black leading-6">{fact.value}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}

function StatusAndPricing({ landing, style }: { landing: CampaignLandingViewModel; style: SystemStyle }) {
    return (
        <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-12 md:px-6 lg:grid-cols-[1fr_0.82fr] lg:px-8">
            <div className={`${style.panel} p-6 md:p-8`}>
                <p className={`text-xs font-bold uppercase tracking-[0.26em] ${style.label}`}>Group Status</p>
                <h2 className={`${style.sectionTitle} mt-4 text-3xl md:text-5xl`}>{landing.threshold.headline}</h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 opacity-75">{landing.threshold.detail}</p>
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                    <div className={style.subtlePanel + ' p-4'}>
                        <p className={`text-[10px] uppercase tracking-[0.22em] ${style.label}`}>Progress</p>
                        <p className="mt-2 text-3xl font-black">{landing.threshold.percentOfThreshold}%</p>
                    </div>
                    <div className={style.subtlePanel + ' p-4'}>
                        <p className={`text-[10px] uppercase tracking-[0.22em] ${style.label}`}>Guests</p>
                        <p className="mt-2 text-3xl font-black">{landing.threshold.joinedPassengers}</p>
                    </div>
                    <div className={style.subtlePanel + ' p-4'}>
                        <p className={`text-[10px] uppercase tracking-[0.22em] ${style.label}`}>Cabins Needed</p>
                        <p className="mt-2 text-3xl font-black">{landing.threshold.requiredCabins}</p>
                    </div>
                </div>
                <Progress value={landing.threshold.percentOfThreshold} className="mt-6" />
            </div>

            <div className={`${style.panel} overflow-hidden`}>
                <div className="p-6 md:p-8">
                    <p className={`text-xs font-bold uppercase tracking-[0.26em] ${style.label}`}>{landing.pricing.sourceLabel}</p>
                    <p className="mt-4 text-5xl font-black">{landing.pricing.startingPriceLabel}</p>
                    <p className="mt-4 text-sm leading-7 opacity-75">{landing.pricing.detail}</p>
                    <p className="mt-4 text-sm font-semibold">You are not paying on this page. This step saves your interest and next-step preference.</p>
                </div>
                {landing.trustImages[0]?.url && (
                    <div
                        className="h-36 bg-cover bg-center opacity-90 saturate-[0.85]"
                        style={{ backgroundImage: `url(${landing.trustImages[0].url})` }}
                    />
                )}
            </div>
        </section>
    );
}

function StoryModules({ landing, style }: { landing: CampaignLandingViewModel; style: SystemStyle }) {
    return (
        <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 md:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div className={`${style.panel} p-6 md:p-8`}>
                <p className={`text-xs font-bold uppercase tracking-[0.26em] ${style.label}`}>{landing.designSystem.sectionLabels[0]}</p>
                <h2 className={`${style.sectionTitle} mt-4 text-3xl md:text-5xl`}>{landing.story.whatItIs.title}</h2>
                <p className="mt-5 text-base leading-8 opacity-75">{landing.story.whatItIs.body}</p>
                <div className="mt-7 grid gap-3">
                    {landing.story.whyJoinNow.map((reason) => (
                        <div key={reason} className={`${style.subtlePanel} p-4 text-sm leading-7`}>{reason}</div>
                    ))}
                </div>
            </div>

            <div className="grid gap-6">
                <div className={`${style.panel} p-6 md:p-8`}>
                    <p className={`text-xs font-bold uppercase tracking-[0.26em] ${style.label}`}>{landing.designSystem.sectionLabels[1]}</p>
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                        {landing.story.whatToExpect.map((item, index) => (
                            <div key={item} className={`${style.subtlePanel} p-4`}>
                                <p className="text-2xl font-black" style={{ color: landing.designSystem.accentHex }}>{String(index + 1).padStart(2, '0')}</p>
                                <p className="mt-3 text-sm leading-7">{item}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    {landing.story.howItWorks.map((step) => (
                        <div key={step.title} className={`${style.panel} p-5`}>
                            <h3 className="text-lg font-black">{step.title}</h3>
                            <p className="mt-3 text-sm leading-7 opacity-75">{step.body}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function GalleryAndTrust({ landing, style }: { landing: CampaignLandingViewModel; style: SystemStyle }) {
    const images = landing.galleryImages.filter((image) => image.url.trim().length > 0).slice(0, 6);

    return (
        <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-10 md:px-6 lg:px-8">
            {images.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                    {images.map((image, index) => (
                        <div key={`${image.url}-${index}`} className={`${style.imageFrame} aspect-[4/5] ${index % 2 === 0 ? 'lg:mt-8' : ''}`}>
                            <div className="h-full bg-cover bg-center" style={{ backgroundImage: `url(${image.url})` }} />
                        </div>
                    ))}
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
                {landing.trustBullets.map((bullet) => (
                    <div key={bullet} className={`${style.subtlePanel} p-5 text-sm leading-7`}>{bullet}</div>
                ))}
            </div>
        </section>
    );
}

function FaqSection({ landing, style }: { landing: CampaignLandingViewModel; style: SystemStyle }) {
    return (
        <section className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-10 md:px-6 lg:grid-cols-3 lg:px-8">
            {landing.faq.map((item) => (
                <div key={item.question} className={`${style.panel} p-5`}>
                    <h3 className="text-lg font-black">{item.question}</h3>
                    <p className="mt-3 text-sm leading-7 opacity-75">{item.answer}</p>
                </div>
            ))}
        </section>
    );
}

export function CampaignLandingPageVisualSystem({ landing }: CampaignLandingPageVisualSystemProps) {
    const style = SYSTEM_STYLES[landing.designSystem.system];

    return (
        <div className={`${prompt.className} min-h-screen ${style.page}`}>
            <SystemHero landing={landing} style={style} />
            <FactsRail landing={landing} style={style} />
            <StatusAndPricing landing={landing} style={style} />
            <StoryModules landing={landing} style={style} />
            <GalleryAndTrust landing={landing} style={style} />
            <LandingPageTourConductor landing={landing} />
            <FaqSection landing={landing} style={style} />

            <section id="save-your-place" className="mx-auto w-full max-w-7xl px-4 py-16 md:px-6 lg:px-8">
                <div className={`${style.panel} grid gap-8 p-6 md:p-8 lg:grid-cols-[0.8fr_1.2fr]`}>
                    <div>
                        <p className={`text-xs font-bold uppercase tracking-[0.26em] ${style.label}`}>{landing.designSystem.sectionLabels[2]}</p>
                        <h2 className={`${style.sectionTitle} mt-4 text-3xl md:text-5xl`}>{landing.ctas.primary.label}</h2>
                        <p className="mt-5 text-sm leading-7 opacity-75">{landing.ctas.primary.description}</p>
                        <div className="mt-6 grid gap-3">
                            {landing.bookingPathChoices.map((choice) => (
                                <div key={choice.mode} className={`${style.subtlePanel} p-4`}>
                                    <p className="font-black">{choice.label}</p>
                                    <p className="mt-2 text-sm leading-6 opacity-75">{choice.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    <CampaignWaitlistForm
                        campaignName={landing.title}
                        endpoint={landing.form.endpoint}
                        enabled={landing.form.enabled}
                        defaultMode={landing.form.defaultMode}
                        isGatheringInterest={landing.state === 'GATHERING_INTEREST'}
                    />
                </div>
            </section>
        </div>
    );
}
