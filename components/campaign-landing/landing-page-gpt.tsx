import type { CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { alfa_slab_one, prompt } from '@/lib/fonts';
import type { CampaignLandingViewModel, LandingImageAsset } from '@/lib/campaigns/landing/view-model';
import { CampaignWaitlistForm } from './waitlist-form';

interface CampaignLandingPageGptProps {
    landing: CampaignLandingViewModel;
}

function getCtaHref(bookingLink: string | null, mode: 'GROUP_WAIT' | 'BOOK_NOW', disabled: boolean): string {
    if (bookingLink && mode === 'BOOK_NOW' && !disabled) {
        return bookingLink;
    }

    return '#save-your-place';
}

function getAnchorProps(href: string): { target?: '_blank'; rel?: 'noreferrer' } {
    if (!href.startsWith('http')) {
        return {};
    }

    return { target: '_blank', rel: 'noreferrer' };
}

function getStateSummary(landing: CampaignLandingViewModel): string {
    if (landing.state === 'THRESHOLD_MET' || landing.state === 'CONVERTED') {
        return 'The booking path is open and the group trip is moving into its next phase.';
    }

    if (landing.state === 'EXPIRED') {
        return 'This campaign has closed to new interest, but the concept and offer details remain visible.';
    }

    if (landing.preview) {
        return 'This is a private preview of the campaign build before the page is fully public.';
    }

    return 'The campaign is collecting interest now and building toward its shared launch target.';
}

function getImageAt(images: LandingImageAsset[], index: number): LandingImageAsset | null {
    if (images.length === 0) {
        return null;
    }

    return images[index % images.length];
}

export function CampaignLandingPageGpt({ landing }: CampaignLandingPageGptProps) {
    const galleryImages = landing.galleryImages.filter((image) => image.url.trim().length > 0);
    const heroImage = landing.heroImage?.url?.trim().length ? landing.heroImage : galleryImages[0] ?? null;
    const supportingImages = galleryImages.filter((image) => image.url !== heroImage?.url);
    const primaryHref = getCtaHref(landing.links.booking, landing.ctas.primary.mode, landing.ctas.primary.disabled);
    const secondaryHref = getCtaHref(landing.links.booking, landing.ctas.secondary.mode, landing.ctas.secondary.disabled);
    const primaryAnchorProps = getAnchorProps(primaryHref);
    const secondaryAnchorProps = getAnchorProps(secondaryHref);
    const pageStyle = {
        '--campaign-accent': landing.accentColor,
        '--campaign-surface': landing.surfaceColor,
        '--campaign-text': landing.textColor,
    } as CSSProperties;

    return (
        <div className={`${prompt.className} min-h-screen bg-[#f5f0e7] text-slate-950`} style={pageStyle}>
            {landing.preview ? (
                <div className="border-b border-amber-300 bg-amber-100/70 px-4 py-3 text-center text-sm text-amber-950">
                    Preview mode. This campaign is still private.
                </div>
            ) : null}

            <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-4 md:px-6 lg:px-8 lg:py-6">
                <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(420px,1.08fr)_minmax(0,1fr)]">
                    <div className="order-2 grid content-start gap-4 lg:order-1">
                        <Card className="border-stone-300 bg-[rgba(255,252,247,0.92)] shadow-[0_18px_50px_rgba(41,33,18,0.08)]">
                            <CardContent className="grid gap-6 p-6 md:p-8">
                                <div className="grid gap-2">
                                    <p className="text-sm text-stone-600">
                                        {landing.stateLabel} / {landing.title}
                                    </p>
                                    <h1 className={`${alfa_slab_one.className} text-4xl leading-[1.02] text-slate-950 md:text-5xl xl:text-6xl`}>
                                        {landing.heroSlogan}
                                    </h1>
                                    <p className="max-w-xl text-lg leading-8 text-slate-700">{landing.subSlogan}</p>
                                </div>

                                <p className="text-base leading-8 text-slate-700">{landing.elevatorPitch}</p>

                                <Separator className="bg-stone-300" />

                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="grid gap-3">
                                        {landing.ctas.primary.disabled ? (
                                            <Button size="lg" disabled className="h-14 justify-start rounded-md px-5 text-left">
                                                {landing.ctas.primary.label}
                                            </Button>
                                        ) : (
                                            <Button asChild size="lg" className="h-14 justify-start rounded-md px-5 text-left text-white hover:opacity-95" style={{ backgroundColor: landing.accentColor }}>
                                                <a href={primaryHref} {...primaryAnchorProps}>{landing.ctas.primary.label}</a>
                                            </Button>
                                        )}
                                        <p className="text-sm leading-6 text-slate-600">{landing.ctas.primary.description}</p>
                                    </div>

                                    <div className="grid gap-3">
                                        {landing.ctas.secondary.disabled ? (
                                            <Button size="lg" variant="outline" disabled className="h-14 justify-start rounded-md border-stone-300 bg-transparent px-5 text-left">
                                                {landing.ctas.secondary.label}
                                            </Button>
                                        ) : (
                                            <Button asChild size="lg" variant="outline" className="h-14 justify-start rounded-md border-stone-300 bg-transparent px-5 text-left text-slate-900 hover:bg-stone-100">
                                                <a href={secondaryHref} {...secondaryAnchorProps}>{landing.ctas.secondary.label}</a>
                                            </Button>
                                        )}
                                        <p className="text-sm leading-6 text-slate-600">{landing.ctas.secondary.description}</p>
                                    </div>
                                </div>

                                <div className="grid gap-3">
                                    {landing.bookingPathChoices.map((choice) => (
                                        <div
                                            key={choice.mode}
                                            className="grid gap-1 rounded-md border px-4 py-4"
                                            style={{
                                                borderColor: choice.highlighted ? landing.accentColor : '#d6d3d1',
                                                backgroundColor: choice.highlighted ? 'rgba(255,255,255,0.86)' : 'rgba(250,250,249,0.88)',
                                            }}
                                        >
                                            <p className="text-sm font-semibold text-slate-950">{choice.label}</p>
                                            <p className="text-sm leading-6 text-slate-600">{choice.description}</p>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="overflow-hidden border-stone-300 bg-white">
                            <CardContent className="grid gap-5 p-6 md:p-8">
                                <div className="grid gap-2">
                                    <p className="text-sm font-medium text-slate-950">Campaign status</p>
                                    <p className="text-sm leading-6 text-slate-600">{getStateSummary(landing)}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-md bg-stone-100 px-4 py-4">
                                        <p className="text-xs text-stone-600">Campaign slug</p>
                                        <p className="mt-2 text-sm font-semibold text-slate-950">{landing.slug}</p>
                                    </div>
                                    <div className="rounded-md bg-stone-100 px-4 py-4">
                                        <p className="text-xs text-stone-600">Current state</p>
                                        <p className="mt-2 text-sm font-semibold text-slate-950">{landing.stateLabel}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="order-1 overflow-hidden border-stone-300 bg-white shadow-[0_24px_80px_rgba(41,33,18,0.12)] lg:order-2">
                        <CardContent className="p-0">
                            <div className="relative min-h-[520px] md:min-h-[720px]">
                                {heroImage?.url ? (
                                    <img src={heroImage.url} alt={heroImage.alt} className="absolute inset-0 h-full w-full object-cover" />
                                ) : (
                                    <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${landing.surfaceColor}, #1f2937)` }} />
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                                <div className="relative flex min-h-[520px] flex-col justify-between p-6 md:min-h-[720px] md:p-8">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="rounded-md bg-black/35 px-4 py-3 backdrop-blur-[2px]">
                                            <p className="text-sm" style={{ color: landing.textColor }}>{landing.title}</p>
                                            <p className="mt-1 text-sm leading-6 text-white/80">{landing.stateLabel}</p>
                                        </div>
                                        <div className="h-14 w-14 rounded-full border border-white/25" style={{ backgroundColor: `${landing.accentColor}55` }} />
                                    </div>
                                    <div className="grid gap-4 rounded-md bg-black/50 p-5 backdrop-blur-[3px] md:p-6">
                                        <div className="grid gap-2 md:grid-cols-[1.05fr_0.95fr] md:items-end">
                                            <div>
                                                <p className="text-sm" style={{ color: landing.textColor }}>Hero image</p>
                                                <p className="mt-2 max-w-xl text-sm leading-7 text-white/85">{heroImage?.alt ?? landing.heroSlogan}</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="rounded-md bg-white/10 px-4 py-4">
                                                    <p className="text-xs text-white/65">Starting from</p>
                                                    <p className="mt-2 text-lg font-semibold text-white">{landing.pricing.startingPriceLabel}</p>
                                                </div>
                                                <div className="rounded-md bg-white/10 px-4 py-4">
                                                    <p className="text-xs text-white/65">Target progress</p>
                                                    <p className="mt-2 text-lg font-semibold text-white">{landing.threshold.percentOfThreshold}%</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="order-3 grid content-start gap-4">
                        <Card className="border-stone-300 bg-white">
                            <CardContent className="grid gap-px bg-stone-200 p-0 sm:grid-cols-2">
                                {landing.facts.map((fact) => (
                                    <div key={fact.label} className="bg-white px-5 py-6">
                                        <p className="text-xs text-stone-600">{fact.label}</p>
                                        <p className="mt-2 text-lg font-semibold leading-7 text-slate-950">{fact.value}</p>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-[0_20px_60px_rgba(24,24,27,0.16)]" style={{ backgroundColor: landing.surfaceColor }}>
                            <CardContent className="grid gap-5 p-6 md:p-7" style={{ color: landing.textColor }}>
                                <div className="grid gap-2">
                                    <p className="text-sm font-medium">Pricing and availability</p>
                                    <p className="text-4xl leading-none text-white">{landing.pricing.startingPriceLabel}</p>
                                </div>
                                <div className="grid gap-2">
                                    <p className="text-sm text-white/80">{landing.pricing.sourceLabel}</p>
                                    <p className="text-sm leading-7 text-white/80">{landing.pricing.detail}</p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-stone-300 bg-white">
                            <CardContent className="grid gap-5 p-6 md:p-7">
                                <div className="grid gap-2">
                                    <p className="text-sm font-medium text-slate-950">Launch threshold</p>
                                    <p className="text-sm leading-6 text-slate-600">{landing.threshold.headline}</p>
                                </div>

                                <Progress value={landing.threshold.percentOfThreshold} className="h-2 bg-stone-200 [&>div]:bg-slate-950" />

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-md bg-stone-100 px-4 py-4">
                                        <p className="text-xs text-stone-600">Cabins needed</p>
                                        <p className="mt-2 text-2xl font-semibold text-slate-950">{landing.threshold.requiredCabins}</p>
                                    </div>
                                    <div className="rounded-md bg-stone-100 px-4 py-4">
                                        <p className="text-xs text-stone-600">Entries saved</p>
                                        <p className="mt-2 text-2xl font-semibold text-slate-950">{landing.threshold.joinedEntries}</p>
                                    </div>
                                    <div className="rounded-md bg-stone-100 px-4 py-4">
                                        <p className="text-xs text-stone-600">Guests represented</p>
                                        <p className="mt-2 text-2xl font-semibold text-slate-950">{landing.threshold.joinedPassengers}</p>
                                    </div>
                                    <div className="rounded-md bg-stone-100 px-4 py-4">
                                        <p className="text-xs text-stone-600">Converted entries</p>
                                        <p className="mt-2 text-2xl font-semibold text-slate-950">{landing.threshold.convertedEntries}</p>
                                    </div>
                                </div>

                                <p className="text-sm leading-6 text-slate-600">{landing.threshold.detail}</p>
                            </CardContent>
                        </Card>

                        <Card className="border-stone-300 bg-white">
                            <CardContent className="grid gap-4 p-6">
                                <p className="text-sm font-medium text-slate-950">Access and extras</p>
                                <div className="grid gap-3">
                                    <div className="rounded-md bg-stone-100 px-4 py-4">
                                        <p className="text-sm font-semibold text-slate-950">Booking access</p>
                                        <p className="mt-1 text-sm leading-6 text-slate-600">
                                            {landing.links.booking
                                                ? 'A direct booking link already exists for this sailing.'
                                                : 'Direct booking has not been attached yet, so the waitlist path remains the main next step.'}
                                        </p>
                                        {landing.links.booking ? (
                                            <div className="mt-3">
                                                <Button asChild size="sm" className="rounded-md bg-slate-950 text-white hover:bg-slate-800">
                                                    <a href={landing.links.booking} {...getAnchorProps(landing.links.booking)}>Open booking</a>
                                                </Button>
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="rounded-md bg-stone-100 px-4 py-4">
                                        <p className="text-sm font-semibold text-slate-950">Community</p>
                                        <p className="mt-1 text-sm leading-6 text-slate-600">
                                            {landing.links.community
                                                ? 'A private group channel is ready for guests once they are invited in.'
                                                : 'The community channel will appear when this campaign reaches the right readiness moment.'}
                                        </p>
                                        {landing.links.community ? (
                                            <div className="mt-3">
                                                <Button asChild size="sm" variant="outline" className="rounded-md border-stone-300 bg-white text-slate-900 hover:bg-stone-50">
                                                    <a href={landing.links.community} {...getAnchorProps(landing.links.community)}>Open community</a>
                                                </Button>
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="rounded-md bg-stone-100 px-4 py-4">
                                        <p className="text-sm font-semibold text-slate-950">Merch</p>
                                        <p className="mt-1 text-sm leading-6 text-slate-600">
                                            {landing.links.merch
                                                ? 'Campaign merchandise is already attached for guests who want the identity layer.'
                                                : 'Merchandise is still locked until the campaign reaches its launch milestone.'}
                                        </p>
                                        {landing.links.merch ? (
                                            <div className="mt-3">
                                                <Button asChild size="sm" variant="outline" className="rounded-md border-stone-300 bg-white text-slate-900 hover:bg-stone-50">
                                                    <a href={landing.links.merch} {...getAnchorProps(landing.links.merch)}>Open merch</a>
                                                </Button>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                <section className="grid gap-4 lg:grid-cols-[1.02fr_0.98fr]">
                    <Card className="border-stone-300 bg-white">
                        <CardContent className="grid gap-8 p-6 md:p-8">
                            <div className="grid gap-3">
                                <p className="text-sm font-medium text-slate-950">{landing.story.whatItIs.title}</p>
                                <p className="text-base leading-8 text-slate-700">{landing.story.whatItIs.body}</p>
                            </div>

                            <Separator className="bg-stone-300" />

                            <div className="grid gap-4">
                                <p className="text-sm font-medium text-slate-950">Why join now</p>
                                {landing.story.whyJoinNow.map((reason, index) => (
                                    <div key={reason} className="grid gap-2 border-b border-stone-200 pb-4 last:border-b-0 last:pb-0 md:grid-cols-[48px_1fr]">
                                        <p className="text-sm text-stone-500">0{index + 1}</p>
                                        <p className="text-sm leading-7 text-slate-700">{reason}</p>
                                    </div>
                                ))}
                            </div>

                            <Separator className="bg-stone-300" />

                            <div className="grid gap-4">
                                <p className="text-sm font-medium text-slate-950">What this trip feels like</p>
                                <div className="grid gap-3 md:grid-cols-3">
                                    {landing.experienceBullets.map((bullet) => (
                                        <div key={bullet} className="rounded-md bg-stone-100 px-4 py-4">
                                            <p className="text-sm leading-6 text-slate-700">{bullet}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid gap-4">
                        <Card className="overflow-hidden border-stone-300 bg-white">
                            <CardContent className="grid gap-4 p-4">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    {getImageAt(supportingImages, 0)?.url ? (
                                        <div className="relative aspect-[5/6] overflow-hidden rounded-md bg-stone-100">
                                            <img src={getImageAt(supportingImages, 0)!.url} alt={getImageAt(supportingImages, 0)!.alt} className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.02]" />
                                        </div>
                                    ) : (
                                        <div className="rounded-md bg-stone-100" />
                                    )}

                                    <div className="grid gap-4">
                                        {getImageAt(supportingImages, 1)?.url ? (
                                            <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-stone-100">
                                                <img src={getImageAt(supportingImages, 1)!.url} alt={getImageAt(supportingImages, 1)!.alt} className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.02]" />
                                            </div>
                                        ) : (
                                            <div className="rounded-md bg-stone-100" />
                                        )}
                                        {getImageAt(supportingImages, 2)?.url ? (
                                            <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-stone-100">
                                                <img src={getImageAt(supportingImages, 2)!.url} alt={getImageAt(supportingImages, 2)!.alt} className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.02]" />
                                            </div>
                                        ) : (
                                            <div className="rounded-md bg-stone-100" />
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-stone-300 bg-white">
                            <CardContent className="grid gap-4 p-6">
                                <p className="text-sm font-medium text-slate-950">What guests can expect</p>
                                {landing.story.whatToExpect.map((item) => (
                                    <div key={item} className="rounded-md border border-stone-200 px-4 py-4">
                                        <p className="text-sm leading-7 text-slate-700">{item}</p>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </div>
                </section>

                <section className="grid gap-4 lg:grid-cols-3">
                    <Card className="border-stone-300 bg-white">
                        <CardContent className="grid gap-4 p-6 md:p-7">
                            <p className="text-sm font-medium text-slate-950">How joining works</p>
                            {landing.story.howItWorks.map((step) => (
                                <div key={step.title} className="grid gap-2 rounded-md border border-stone-200 px-4 py-4">
                                    <p className="text-sm font-semibold text-slate-950">{step.title}</p>
                                    <p className="text-sm leading-7 text-slate-600">{step.body}</p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="border-stone-300 bg-white">
                        <CardContent className="grid gap-4 p-6 md:p-7">
                            <p className="text-sm font-medium text-slate-950">Trust and clarity</p>
                            {landing.trustBullets.map((bullet) => (
                                <div key={bullet} className="rounded-md bg-stone-100 px-4 py-4">
                                    <p className="text-sm leading-7 text-slate-700">{bullet}</p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="border-stone-300 bg-white">
                        <CardContent className="grid gap-5 p-6 md:p-7">
                            <p className="text-sm font-medium text-slate-950">Questions before you decide</p>
                            {landing.faq.map((item) => (
                                <div key={item.question} className="grid gap-2 border-b border-stone-200 pb-4 last:border-b-0 last:pb-0">
                                    <p className="text-sm font-semibold text-slate-950">{item.question}</p>
                                    <p className="text-sm leading-7 text-slate-600">{item.answer}</p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </section>

                {supportingImages.length > 3 ? (
                    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {supportingImages.slice(3, 7).map((image) => (
                            <Card key={image.url} className="overflow-hidden border-stone-300 bg-white">
                                <CardContent className="p-0">
                                    <div className="relative aspect-[4/3] overflow-hidden">
                                        <img src={image.url} alt={image.alt} className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.02]" />
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </section>
                ) : null}

                <section id="save-your-place" className="grid gap-4">
                    <div className="grid gap-4 lg:grid-cols-3">
                        <Card className="border-stone-300 bg-white">
                            <CardContent className="grid gap-3 p-6">
                                <p className="text-sm font-medium text-slate-950">Save your place</p>
                                <p className="text-sm leading-7 text-slate-600">
                                    {landing.title} is set up to capture interest first and send the right next step later. The form below is currently
                                    {landing.form.enabled ? ' active.' : ' closed.'}
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="border-stone-300 bg-white">
                            <CardContent className="grid gap-3 p-6">
                                <p className="text-sm font-medium text-slate-950">Default path</p>
                                <p className="text-sm leading-7 text-slate-600">
                                    New submissions default to <span className="font-semibold text-slate-950">{landing.form.defaultMode === 'BOOK_NOW' ? 'the early booking path' : 'the group waitlist path'}</span>.
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="border-stone-300 bg-white">
                            <CardContent className="grid gap-3 p-6">
                                <p className="text-sm font-medium text-slate-950">Campaign endpoint</p>
                                <p className="break-all text-sm leading-7 text-slate-600">{landing.form.endpoint}</p>
                            </CardContent>
                        </Card>
                    </div>

                    <CampaignWaitlistForm
                        campaignName={landing.title}
                        endpoint={landing.form.endpoint}
                        enabled={landing.form.enabled}
                        defaultMode={landing.form.defaultMode}
                    />
                </section>
            </div>
        </div>
    );
}
