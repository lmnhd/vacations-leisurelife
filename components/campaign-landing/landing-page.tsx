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
    'top-8 right-8 h-28 w-20 rotate-6 opacity-[0.16] md:h-36 md:w-24',
    'bottom-10 left-6 h-24 w-16 -rotate-3 opacity-[0.12] md:h-32 md:w-24',
    'top-1/3 right-1/4 h-20 w-28 -rotate-6 opacity-[0.10] md:h-24 md:w-36',
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
            <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 overflow-hidden px-4 py-8 md:px-6 lg:px-8">
                {landing.galleryImages.map((image, index) => (
                    <div
                        key={`${image.url}-scatter-${index}`}
                        className={`pointer-events-none absolute hidden overflow-hidden border border-white/40 bg-stone-200 shadow-[0_18px_40px_rgba(15,23,42,0.08)] saturate-[0.85] lg:block ${SCATTER_POSITIONS[index % SCATTER_POSITIONS.length]}`}
                        aria-hidden="true"
                    >
                        <div
                            className="h-full w-full bg-cover bg-center grayscale"
                            style={{ backgroundImage: `url(${image.url})` }}
                        />
                    </div>
                ))}
                
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

                            <div className="min-h-[380px] border-l border-stone-200" style={heroBackground}>
                                <div className="flex h-full flex-col justify-end gap-4 p-8 text-white md:p-10">
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
                    </div>

                    <Card className="relative border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
                        {landing.galleryImages.slice(0, 2).map((image, index) => (
                            <div
                                key={`${image.url}-panel-${index}`}
                                className={index === 0
                                    ? 'pointer-events-none absolute -right-6 top-10 hidden h-28 w-20 rotate-[8deg] overflow-hidden border border-stone-200 opacity-[0.10] lg:block'
                                    : 'pointer-events-none absolute -left-6 bottom-10 hidden h-24 w-16 -rotate-[7deg] overflow-hidden border border-stone-200 opacity-[0.08] lg:block'}
                                aria-hidden="true"
                            >
                                <div
                                    className="h-full w-full bg-cover bg-center grayscale"
                                    style={{ backgroundImage: `url(${image.url})` }}
                                />
                            </div>
                        ))}
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
                                                {landing.story.whatToExpect.map((item) => (
                                                    <div key={item} className="border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                                                        {item}
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