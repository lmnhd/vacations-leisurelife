import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { alfa_slab_one, prompt } from '@/lib/fonts';
import type { CampaignLandingViewModel } from '@/lib/campaigns/landing/view-model';
import { CampaignWaitlistForm } from './waitlist-form';

interface CampaignLandingPageProps {
    landing: CampaignLandingViewModel;
}

function accentShadow(color: string): string {
    return `0 24px 90px ${color}33`;
}

const SCATTER_POSITIONS = [
    'top-6 -right-2 h-32 w-24 rotate-6 md:h-40 md:w-32 z-10',
    'bottom-24 -left-2 h-28 w-20 -rotate-3 md:h-32 md:w-24 z-10',
    'top-[40%] right-[30%] h-24 w-32 -rotate-6 md:h-32 md:w-40 z-10',
] as const;

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

    const primaryHref = landing.links.booking && landing.ctas.primary.mode === 'BOOK_NOW' && !landing.ctas.primary.disabled
        ? landing.links.booking
        : '#save-your-place';

    const secondaryHref = landing.links.booking && landing.ctas.secondary.mode === 'BOOK_NOW' && !landing.ctas.secondary.disabled
        ? landing.links.booking
        : '#save-your-place';

    const availabilityLabel = landing.state === 'THRESHOLD_MET' || landing.state === 'CONVERTED'
        ? 'Booking is open for this sailing.'
        : 'Interest is building for this sailing.';

    const extrasDescription = landing.links.community || landing.links.merch
        ? 'Guests will see any active community link or optional extras here once they are available.'
        : 'Private guest chat and optional extras can open later as the group takes shape.';

    return (
        <div className={`${prompt.className} min-h-screen bg-stone-50 text-slate-950`}>
            <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 md:px-6 lg:px-8">
                <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
                    <Card className="overflow-hidden border-stone-300 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
                        <CardContent className="grid gap-0 p-0 lg:grid-cols-[1.05fr_0.95fr]">
                            <div className="flex flex-col justify-between gap-6 p-8 md:p-10">
                                <div>
                                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">{availabilityLabel}</p>
                                    <h1 className={`${alfa_slab_one.className} mt-4 text-4xl leading-tight text-slate-950 md:text-5xl`}>
                                        {landing.heroSlogan}
                                    </h1>
                                    <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-700">
                                        {landing.subSlogan}
                                    </p>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    {landing.facts.map((fact) => (
                                        <div key={fact.label} className="border border-stone-200 bg-stone-50 p-4">
                                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{fact.label}</p>
                                            <p className="mt-2 text-base font-semibold leading-6 text-slate-950">{fact.value}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    {landing.ctas.primary.disabled ? (
                                        <Button size="lg" className="h-12" disabled>
                                            {landing.ctas.primary.label}
                                        </Button>
                                    ) : (
                                        <Button asChild size="lg" className="h-12 bg-slate-950 text-slate-50 hover:bg-slate-800">
                                            <a href={primaryHref} target={primaryHref.startsWith('http') ? '_blank' : undefined} rel={primaryHref.startsWith('http') ? 'noreferrer' : undefined}>
                                                {landing.ctas.primary.label}
                                            </a>
                                        </Button>
                                    )}
                                    {landing.ctas.secondary.disabled ? (
                                        <Button size="lg" variant="outline" className="h-12 border-slate-300" disabled>
                                            {landing.ctas.secondary.label}
                                        </Button>
                                    ) : (
                                        <Button asChild size="lg" variant="outline" className="h-12 border-slate-300 bg-white">
                                            <a href={secondaryHref} target={secondaryHref.startsWith('http') ? '_blank' : undefined} rel={secondaryHref.startsWith('http') ? 'noreferrer' : undefined}>
                                                {landing.ctas.secondary.label}
                                            </a>
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <div className="relative min-h-[380px] overflow-hidden border-l border-stone-200" style={heroBackground}>
                                {landing.galleryImages[0] && (
                                    <div
                                        className="pointer-events-none absolute right-8 top-8 hidden h-32 w-32 rotate-[8deg] rounded-sm border-[6px] border-white shadow-xl opacity-95 lg:block z-10"
                                        style={{ backgroundImage: `url(${landing.galleryImages[0].url})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                                    />
                                )}
                                <div className="flex relative z-20 h-full flex-col justify-end gap-4 p-8 text-white md:p-10">
                                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-white/70">{landing.title}</p>
                                    <p className="max-w-xl text-base leading-7 text-white/88">
                                        {landing.elevatorPitch}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid gap-6">
                        <Card className="border-none bg-slate-950 text-slate-50" style={{ boxShadow: accentShadow(landing.accentColor) }}>
                            <CardHeader>
                                <CardTitle className="text-2xl">The Group Is Forming</CardTitle>
                                <CardDescription className="text-slate-300">{landing.threshold.headline}</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-5">
                                <div className="grid gap-3 border border-white/10 bg-white/5 p-4">
                                    <div className="flex items-center justify-between text-sm text-slate-300">
                                        <span>{landing.threshold.joinedEntries} groups interested</span>
                                        <span>{landing.threshold.requiredCabins} cabins needed</span>
                                    </div>
                                    <Progress value={landing.threshold.percentOfThreshold} className="bg-white/10" />
                                    <p className="text-sm text-slate-300">{landing.threshold.detail}</p>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="border border-white/10 bg-white/5 p-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Guests represented</p>
                                        <p className="mt-2 text-3xl font-semibold text-white">{landing.threshold.joinedPassengers}</p>
                                    </div>
                                    <div className="border border-white/10 bg-white/5 p-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">What this means</p>
                                        <p className="mt-2 text-sm leading-7 text-white/90">Join now, and we will send the correct next step when your path opens.</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-slate-200 bg-white">
                            <CardHeader>
                                <CardTitle className="text-2xl">Current Pricing</CardTitle>
                                <CardDescription>{landing.pricing.sourceLabel}</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Starting from</p>
                                        <p className="mt-2 text-3xl font-semibold text-slate-950">{landing.pricing.startingPriceLabel}</p>
                                    </div>
                                    <div className="border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                                        {landing.pricing.detail}
                                    </div>
                                </div>
                                {landing.galleryImages[3] && (
                                    <div className="relative mt-2 h-32 w-full overflow-hidden border border-slate-200 bg-slate-100">
                                        <div 
                                            className="absolute inset-0 bg-cover bg-center opacity-90 saturate-[0.8]"
                                            style={{ backgroundImage: `url(${landing.galleryImages[3].url})` }}
                                        />
                                    </div>
                                )}
                                <p className="text-sm leading-7 text-slate-700">You are not paying on this page. This is where you decide whether this sailing is for you.</p>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                <section className="relative grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
                    <div className="grid gap-6 lg:sticky lg:top-6">
                        <Card className="border-slate-200 bg-white">
                            <CardHeader>
                                <CardTitle className="text-2xl">Why Join Now</CardTitle>
                            </CardHeader>
                            <CardContent className="grid gap-4">
                                {landing.story.whyJoinNow.map((reason) => (
                                    <div key={reason} className="border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                                        {reason}
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        {landing.galleryImages.length > 1 && (
                            <div className="hidden lg:flex w-full flex-col items-center justify-center pt-8 pointer-events-none">
                                {landing.galleryImages[1] && (
                                    <div
                                        className="h-36 w-44 -rotate-6 rounded-sm border-[6px] border-white shadow-xl"
                                        style={{ backgroundImage: `url(${landing.galleryImages[1].url})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                                    />
                                )}
                                {landing.galleryImages[2] && (
                                    <div
                                        className="-mt-12 ml-16 h-32 w-24 rotate-12 rounded-sm border-[6px] border-white shadow-xl"
                                        style={{ backgroundImage: `url(${landing.galleryImages[2].url})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                                    />
                                )}
                            </div>
                        )}
                    </div>

                    <Card className="border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
                        <CardHeader>
                            <CardTitle className="text-2xl">Why This Sailing Feels Different</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Tabs defaultValue="what-it-is" className="grid gap-6">
                                <TabsList className="grid h-auto grid-cols-1 gap-2 bg-stone-100 p-2 md:grid-cols-3">
                                    <TabsTrigger value="what-it-is" className="h-11 rounded-sm border border-transparent data-[state=active]:border-stone-200 data-[state=active]:bg-white">What It Is</TabsTrigger>
                                    <TabsTrigger value="expect" className="h-11 rounded-sm border border-transparent data-[state=active]:border-stone-200 data-[state=active]:bg-white">What To Expect</TabsTrigger>
                                    <TabsTrigger value="join" className="h-11 rounded-sm border border-transparent data-[state=active]:border-stone-200 data-[state=active]:bg-white">How Joining Works</TabsTrigger>
                                </TabsList>

                                <TabsContent value="what-it-is" className="grid gap-6">
                                    <div className="grid gap-6 md:grid-cols-[0.95fr_1.05fr]">
                                        <div className="grid gap-4">
                                            <div>
                                                <h2 className="text-xl font-semibold text-slate-950">{landing.story.whatItIs.title}</h2>
                                            </div>
                                            <div className="border border-slate-200 bg-slate-50 p-5 text-sm leading-8 text-slate-700">
                                                {landing.story.whatItIs.body}
                                            </div>
                                        </div>

                                        <div className="grid gap-4">
                                            <div>
                                                <h2 className="text-xl font-semibold text-slate-950">What This Trip Feels Like</h2>
                                            </div>
                                            {landing.experienceBullets.map((bullet) => (
                                                <div key={bullet} className="border border-slate-200 bg-stone-50 p-4 text-sm leading-7 text-slate-700">
                                                    {bullet}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="expect" className="grid gap-6">
                                    <div className="grid gap-6 md:grid-cols-[1.05fr_0.95fr]">
                                        <div className="grid gap-4">
                                            <div>
                                                <h2 className="text-xl font-semibold text-slate-950">What Guests Can Expect</h2>
                                            </div>
                                            <div className="grid gap-4 md:grid-cols-2">
                                                {landing.story.whatToExpect.map((item, idx) => (
                                                    <div key={item} className="relative overflow-hidden border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                                                        <span className="relative z-10">{item}</span>
                                                        {landing.galleryImages[4 + idx] && (
                                                            <div 
                                                                className="absolute right-0 top-0 h-full w-1/3 opacity-20 transition-opacity hover:opacity-30" 
                                                                style={{ backgroundImage: `url(${landing.galleryImages[4 + idx].url})`, backgroundSize: 'cover', backgroundPosition: 'center', maskImage: 'linear-gradient(to right, transparent, black)' }}
                                                            />
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="grid gap-4">
                                            <div>
                                                <h2 className="text-xl font-semibold text-slate-950">Before You Commit</h2>
                                            </div>
                                            {landing.trustBullets.map((bullet) => (
                                                <div key={bullet} className="border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                                                    {bullet}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="join" className="grid gap-6">
                                    <div className="grid gap-6 md:grid-cols-[0.95fr_1.05fr]">
                                        <div className="grid gap-4">
                                            <div>
                                                <h2 className="text-xl font-semibold text-slate-950">How Joining Works</h2>
                                            </div>
                                            {landing.story.howItWorks.map((step) => (
                                                <div key={step.title} className="border border-slate-200 bg-slate-50 p-4">
                                                    <p className="font-semibold text-slate-950">{step.title}</p>
                                                    <p className="mt-2 text-sm leading-7 text-slate-700">{step.body}</p>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="grid gap-4">
                                            <div>
                                                <h2 className="text-xl font-semibold text-slate-950">Questions Before You Decide</h2>
                                            </div>
                                            {landing.faq.map((item) => (
                                                <div key={item.question} className="border border-slate-200 bg-stone-50 p-4">
                                                    <p className="font-semibold text-slate-950">{item.question}</p>
                                                    <p className="mt-2 text-sm leading-7 text-slate-700">{item.answer}</p>
                                                </div>
                                            ))}
                                            {(landing.links.community || landing.links.merch) ? (
                                                <div className="border border-slate-200 bg-stone-50 p-4 text-sm leading-7 text-slate-700">
                                                    {extrasDescription}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                </section>

                <section id="save-your-place">
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