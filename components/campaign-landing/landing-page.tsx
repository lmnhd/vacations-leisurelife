import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { alfa_slab_one, prompt } from '@/lib/fonts';
import type { CampaignLandingViewModel } from '@/lib/campaigns/landing/view-model';
import { CampaignWaitlistForm } from './waitlist-form';

interface CampaignLandingPageProps {
    landing: CampaignLandingViewModel;
}

function accentShadow(color: string): string {
    return `0 24px 90px ${color}33`;
}

export function CampaignLandingPage({ landing }: CampaignLandingPageProps) {
    const heroBackground = landing.heroImage?.url
        ? {
            backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.84), rgba(15,23,42,0.44)), url(${landing.heroImage.url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
        }
        : {
            background: `linear-gradient(135deg, ${landing.surfaceColor}, #0f172a)`,
        };

    return (
        <div className={`${prompt.className} min-h-screen bg-stone-100 text-slate-950`}>
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
                {landing.preview ? (
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card className="border-amber-300/60 bg-amber-50 text-amber-950">
                            <CardContent className="p-5">
                                <p className="text-sm font-semibold uppercase tracking-[0.22em]">Preview mode</p>
                                <p className="mt-2 text-sm">This campaign is still in draft and is only visible with preview enabled.</p>
                            </CardContent>
                        </Card>
                        <Card className="border-slate-200 bg-white">
                            <CardContent className="p-5 text-sm text-slate-700">
                                State logic, copy, and hero assets are already flowing through the normalized landing contract.
                            </CardContent>
                        </Card>
                    </div>
                ) : null}

                <section className="grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
                    <Card className="overflow-hidden border-none text-white shadow-[0_24px_120px_rgba(15,23,42,0.35)]" style={heroBackground}>
                        <CardContent className="grid min-h-[460px] content-between gap-6 p-8 md:p-10">
                            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
                                <div className="max-w-3xl">
                                    <p className="text-xs uppercase tracking-[0.28em] text-white/70">{landing.stateLabel}</p>
                                    <h1 className={`${alfa_slab_one.className} mt-4 text-4xl leading-tight md:text-5xl`}>
                                        {landing.heroSlogan}
                                    </h1>
                                    <p className="mt-4 max-w-2xl text-base leading-7 text-white/82 md:text-lg">
                                        {landing.subSlogan}
                                    </p>
                                </div>
                                <div className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur-sm">
                                    {landing.title}
                                </div>
                            </div>

                            <div className="grid gap-6 md:grid-cols-2">
                                <div className="rounded-2xl border border-white/15 bg-slate-950/45 p-5 backdrop-blur-sm">
                                    <p className="text-sm leading-7 text-white/84">{landing.elevatorPitch}</p>
                                </div>
                                <div className="grid gap-3 rounded-2xl border border-white/15 bg-slate-950/45 p-5 backdrop-blur-sm">
                                    {landing.facts.map((fact) => (
                                        <div key={fact.label} className="grid grid-cols-[120px_1fr] gap-3 text-sm">
                                            <span className="text-white/65">{fact.label}</span>
                                            <span className="font-medium text-white">{fact.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid gap-6">
                        <Card className="border-none bg-slate-950 text-slate-50" style={{ boxShadow: accentShadow(landing.accentColor) }}>
                            <CardHeader>
                                <CardTitle className="text-2xl">Threshold Status</CardTitle>
                                <CardDescription className="text-slate-300">{landing.threshold.headline}</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-5">
                                <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                                    <div className="flex items-center justify-between text-sm text-slate-300">
                                        <span>{landing.threshold.joinedEntries} entries logged</span>
                                        <span>{landing.threshold.requiredCabins} cabin threshold</span>
                                    </div>
                                    <Progress value={landing.threshold.percentOfThreshold} className="bg-white/10" />
                                    <p className="text-sm text-slate-300">{landing.threshold.detail}</p>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Passengers</p>
                                        <p className="mt-2 text-3xl font-semibold text-white">{landing.threshold.joinedPassengers}</p>
                                    </div>
                                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Converted entries</p>
                                        <p className="mt-2 text-3xl font-semibold text-white">{landing.threshold.convertedEntries}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-slate-200 bg-white">
                            <CardHeader>
                                <CardTitle className="text-2xl">Pricing Clarity</CardTitle>
                                <CardDescription>{landing.pricing.sourceLabel}</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Starting from</p>
                                        <p className="mt-2 text-3xl font-semibold text-slate-950">{landing.pricing.startingPriceLabel}</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                                        {landing.pricing.detail}
                                    </div>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <Button size="lg" className="h-12" disabled={landing.ctas.primary.disabled}>
                                        {landing.ctas.primary.label}
                                    </Button>
                                    <Button size="lg" variant="outline" className="h-12 border-slate-300" disabled={landing.ctas.secondary.disabled}>
                                        {landing.ctas.secondary.label}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                    <Card className="border-slate-200 bg-white">
                        <CardHeader>
                            <CardTitle className="text-2xl">Trip Explanation</CardTitle>
                            <CardDescription>The public page stays stable while the campaign identity changes through media, tone, and itinerary framing.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            {landing.experienceBullets.map((bullet) => (
                                <div key={bullet} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                                    {bullet}
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="border-slate-200 bg-white">
                        <CardHeader>
                            <CardTitle className="text-2xl">Booking Path Choice</CardTitle>
                            <CardDescription>Both acquisition paths stay visible so the product choice is explicit rather than buried in a single button.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            {landing.bookingPathChoices.map((choice) => (
                                <div
                                    key={choice.mode}
                                    className="rounded-2xl border p-4 text-sm leading-7"
                                    style={{
                                        borderColor: choice.highlighted ? landing.accentColor : '#e2e8f0',
                                        backgroundColor: choice.highlighted ? `${landing.accentColor}12` : '#f8fafc',
                                    }}
                                >
                                    <p className="font-semibold text-slate-950">{choice.label}</p>
                                    <p className="mt-2 text-slate-700">{choice.description}</p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                    <Card className="border-slate-200 bg-white">
                        <CardHeader>
                            <CardTitle className="text-2xl">Trust And Fulfillment</CardTitle>
                            <CardDescription>Threshold, pricing source, and booking expectations are treated as core product information.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            {landing.trustBullets.map((bullet) => (
                                <div key={bullet} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                                    {bullet}
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="border-slate-200 bg-white">
                        <CardHeader>
                            <CardTitle className="text-2xl">FAQ</CardTitle>
                            <CardDescription>State changes are explained up front so guests do not have to infer the mechanics of the campaign.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            {landing.faq.map((item) => (
                                <div key={item.question} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="font-semibold text-slate-950">{item.question}</p>
                                    <p className="mt-2 text-sm leading-7 text-slate-700">{item.answer}</p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                    <Card className="border-slate-200 bg-white">
                        <CardHeader>
                            <CardTitle className="text-2xl">Community And Merch</CardTitle>
                            <CardDescription>These remain secondary to the trip but stay on the page once the campaign has enough maturity to support them.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Community</p>
                                <p className="mt-2 text-sm leading-7 text-slate-700">
                                    {landing.links.community ? 'A community channel is available for this trip once you are ready to join the conversation.' : 'The community link has not been activated for this campaign yet.'}
                                </p>
                                {landing.links.community ? (
                                    <Button asChild variant="outline" className="mt-4 border-slate-300">
                                        <a href={landing.links.community} target="_blank" rel="noreferrer">Open community</a>
                                    </Button>
                                ) : null}
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Merch</p>
                                <p className="mt-2 text-sm leading-7 text-slate-700">
                                    {landing.links.merch ? 'Merchandise for this campaign is already published.' : 'Merch activation is still pending for this campaign.'}
                                </p>
                                {landing.links.merch ? (
                                    <Button asChild variant="outline" className="mt-4 border-slate-300">
                                        <a href={landing.links.merch} target="_blank" rel="noreferrer">Open merch</a>
                                    </Button>
                                ) : null}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-slate-200 bg-white">
                        <CardHeader>
                            <CardTitle className="text-2xl">Booking Link Status</CardTitle>
                            <CardDescription>Immediate booking can stay visible even before the final booking link is ready, but the state remains explicit.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                                {landing.links.booking
                                    ? 'A booking link is already attached to this campaign and can be returned directly by the waitlist endpoint when the campaign state allows it.'
                                    : 'No live booking link is attached yet, so the page keeps the path visible without pretending self-serve booking is ready.'}
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                {landing.links.booking ? (
                                    <Button asChild className="w-full bg-slate-950 text-slate-50 hover:bg-slate-800">
                                        <a href={landing.links.booking} target="_blank" rel="noreferrer">Open booking</a>
                                    </Button>
                                ) : (
                                    <p className="text-sm leading-7 text-slate-700">Booking will hand off through the correct route once the campaign crosses into the appropriate state.</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </section>

                <section>
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