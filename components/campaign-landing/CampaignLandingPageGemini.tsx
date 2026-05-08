import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { alfa_slab_one, prompt } from '@/lib/fonts';
import type { CampaignLandingViewModel } from '@/lib/campaigns/landing/view-model';
import { CampaignWaitlistForm } from './waitlist-form';

interface CampaignLandingPageProps {
    landing: CampaignLandingViewModel;
}

export function CampaignLandingPageGemini({ landing }: CampaignLandingPageProps) {
    const galleryImages = landing.galleryImages.filter((image) => image.url.trim().length > 0);
    const getGalleryImage = (index: number) => galleryImages.length > 0 ? galleryImages[index % galleryImages.length] : null;

    const primaryHref = landing.ctas.primary.mode === 'BOOK_NOW' && !landing.ctas.primary.disabled
        ? (landing.links.retailBooking ?? landing.links.booking ?? '#save-your-place')
        : '#save-your-place';

    const secondaryHref = landing.ctas.secondary.mode === 'BOOK_NOW' && !landing.ctas.secondary.disabled
        ? (landing.links.retailBooking ?? landing.links.booking ?? '#save-your-place')
        : '#save-your-place';

    const availabilityLabel = landing.state === 'THRESHOLD_MET' || landing.state === 'CONVERTED'
        ? 'Booking is open for this sailing.'
        : 'Interest is building for this sailing.';

    return (
        <div className={`${prompt.className} min-h-screen bg-stone-50 text-slate-950 font-sans`}>
            {/* MASSIVE HERO SECTION */}
            <section className="relative w-full h-[75vh] min-h-[600px] flex flex-col justify-end">
                {landing.heroImage?.url ? (
                    <div 
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${landing.heroImage.url})` }}
                    />
                ) : (
                    <div 
                        className="absolute inset-0"
                        style={{ background: `linear-gradient(135deg, ${landing.surfaceColor}, #0f172a)` }}
                    />
                )}
                {/* Overlay gradient to ensure text readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                
                <div className="relative z-10 w-full max-w-7xl mx-auto px-6 py-16 md:px-12 grid grid-cols-1 lg:grid-cols-2 gap-12 items-end">
                    <div className="flex flex-col gap-6 text-white text-shadow-sm">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/80 mb-4">{availabilityLabel}</p>
                            <h1 className={`${alfa_slab_one.className} text-5xl md:text-7xl leading-[1.05] tracking-tight`}>
                                {landing.heroSlogan}
                            </h1>
                        </div>
                        <p className="max-w-xl text-lg md:text-xl leading-relaxed text-white/90 font-light">
                            {landing.subSlogan}
                        </p>
                    </div>

                    <div className="flex flex-col gap-4 lg:items-end justify-end w-full">
                        <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                            {!landing.ctas.primary.disabled && (
                                <Button asChild size="lg" className="h-14 px-8 rounded-none bg-white text-black hover:bg-slate-200 font-semibold tracking-wide uppercase text-sm">
                                    <a href={primaryHref} target={primaryHref.startsWith('http') ? '_blank' : undefined} rel={primaryHref.startsWith('http') ? 'noreferrer' : undefined}>
                                        {landing.ctas.primary.label}
                                    </a>
                                </Button>
                            )}
                            {!landing.ctas.secondary.disabled && (
                                <Button asChild size="lg" variant="outline" className="h-14 px-8 rounded-none border-white/30 text-white hover:bg-white/10 hover:text-white font-semibold tracking-wide uppercase text-sm bg-black/20 backdrop-blur-sm">
                                    <a href={secondaryHref} target={secondaryHref.startsWith('http') ? '_blank' : undefined} rel={secondaryHref.startsWith('http') ? 'noreferrer' : undefined}>
                                        {landing.ctas.secondary.label}
                                    </a>
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* MAIN CONTENT WRAPPER */}
            <div className="w-full max-w-7xl mx-auto px-6 py-20 md:px-12 grid gap-24">

                {/* THE FACTS & PRICING - SYMMETRICAL GRID */}
                <section>
                    <div className="mb-10 border-b-2 border-slate-900 pb-4 flex flex-col md:flex-row justify-between items-end gap-4">
                        <h2 className="text-3xl font-bold uppercase tracking-tight text-slate-900">Campaign Logistics</h2>
                        <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">{landing.title}</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                        {/* Facts Grid */}
                        <div className="grid grid-cols-2 gap-px bg-slate-200 border border-slate-200">
                            {landing.facts.map((fact) => (
                                <div key={fact.label} className="bg-white p-8 flex flex-col justify-center">
                                    <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">{fact.label}</p>
                                    <p className="text-lg sm:text-xl font-medium text-slate-900">{fact.value}</p>
                                </div>
                            ))}
                        </div>

                        {/* Pricing Box */}
                        <div className="bg-slate-900 text-white p-10 flex flex-col justify-between">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50 mb-2">Current Pricing</p>
                                <p className="text-4xl sm:text-5xl font-light tracking-tight">{landing.pricing.startingPriceLabel}</p>
                            </div>
                            <div className="mt-8 border-t border-white/20 pt-6">
                                <p className="text-sm font-medium text-white/90 mb-2">{landing.pricing.sourceLabel}</p>
                                <p className="text-sm text-white/60 leading-relaxed font-light">{landing.pricing.detail}</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* THE THRESHOLD / FORMING GROUP */}
                <section className="border border-slate-200 bg-white p-8 md:p-12 shadow-sm grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-12 items-center">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-4">The Group Is Forming</h2>
                        <p className="text-lg text-slate-600 font-light leading-relaxed mb-6">{landing.threshold.headline}</p>
                        <p className="text-sm text-slate-500 leading-relaxed">{landing.threshold.detail}</p>
                    </div>
                    
                    <div className="p-8 bg-stone-50 border border-stone-200">
                        <div className="flex items-end justify-between mb-4">
                            <div>
                                <p className="text-4xl font-bold text-slate-900">{landing.threshold.joinedPassengers}</p>
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mt-1">Guests Represented</p>
                            </div>
                            <div className="text-right">
                                <p className="text-lg font-medium text-slate-900">{landing.threshold.joinedEntries} <span className="text-slate-500 text-sm font-normal">interested</span></p>
                                <p className="text-sm text-slate-500">{landing.threshold.requiredCabins} cabins needed</p>
                            </div>
                        </div>
                        <Progress value={landing.threshold.percentOfThreshold} className="h-2 bg-stone-200 [&>div]:bg-slate-900 rounded-none" />
                    </div>
                </section>

                {/* EDITORIAL STORY SECTION */}
                <section className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-start">
                    <div className="space-y-16">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 border-b border-slate-200 pb-2">The Concept</p>
                            <h3 className="text-2xl font-semibold text-slate-900 mb-4">{landing.story.whatItIs.title}</h3>
                            <p className="text-lg text-slate-600 leading-relaxed font-light">{landing.story.whatItIs.body}</p>
                        </div>

                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 border-b border-slate-200 pb-2">Why Join Now</p>
                            <ul className="space-y-4">
                                {landing.story.whyJoinNow.map((reason, i) => (
                                    <li key={i} className="flex gap-4">
                                        <span className="text-slate-300 font-mono">{(i + 1).toString().padStart(2, '0')}</span>
                                        <p className="text-slate-700 leading-relaxed text-sm font-medium">{reason}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 border-b border-slate-200 pb-2">Experience</p>
                            <div className="grid gap-6">
                                {landing.experienceBullets.map((bullet, i) => (
                                    <p key={i} className="pl-4 border-l-2 border-slate-900 text-slate-700 leading-relaxed text-sm">{bullet}</p>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-8">
                        {/* Gallery collage - structured & symmetrical rather than scattered */}
                        {getGalleryImage(0) && (
                            <div className="aspect-[4/3] w-full bg-slate-100 overflow-hidden">
                                <img src={getGalleryImage(0)!.url} alt={getGalleryImage(0)!.alt} className="w-full h-full object-cover grayscale-[0.2] hover:grayscale-0 transition-all duration-700" />
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-8">
                            {getGalleryImage(1) && (
                                <div className="aspect-square w-full bg-slate-100 overflow-hidden">
                                    <img src={getGalleryImage(1)!.url} alt={getGalleryImage(1)!.alt} className="w-full h-full object-cover grayscale-[0.2] hover:grayscale-0 transition-all duration-700" />
                                </div>
                            )}
                            {getGalleryImage(2) && (
                                <div className="aspect-square w-full bg-slate-100 overflow-hidden">
                                    <img src={getGalleryImage(2)!.url} alt={getGalleryImage(2)!.alt} className="w-full h-full object-cover grayscale-[0.2] hover:grayscale-0 transition-all duration-700" />
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* DETAILS TABS */}
                <section>
                    <Tabs defaultValue="expect" className="w-full">
                        <TabsList className="w-full justify-start border-b border-slate-200 rounded-none bg-transparent h-auto p-0 gap-8 mb-8">
                            <TabsTrigger value="expect" className="rounded-none border-b-2 border-transparent data-[state=active]:border-slate-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 pb-4 text-slate-500 data-[state=active]:text-slate-900 text-sm font-bold uppercase tracking-wider">What To Expect</TabsTrigger>
                            <TabsTrigger value="join" className="rounded-none border-b-2 border-transparent data-[state=active]:border-slate-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 pb-4 text-slate-500 data-[state=active]:text-slate-900 text-sm font-bold uppercase tracking-wider">How Joining Works</TabsTrigger>
                            <TabsTrigger value="faq" className="rounded-none border-b-2 border-transparent data-[state=active]:border-slate-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 pb-4 text-slate-500 data-[state=active]:text-slate-900 text-sm font-bold uppercase tracking-wider">Common Questions</TabsTrigger>
                        </TabsList>

                        <TabsContent value="expect" className="mt-0">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-8">
                                <div className="space-y-8">
                                    <div>
                                        <h4 className="text-lg font-semibold text-slate-900 mb-4">The Atmosphere</h4>
                                        <div className="space-y-4">
                                            {landing.story.whatToExpect.map((item, idx) => (
                                                <p key={idx} className="text-sm text-slate-600 leading-relaxed font-light">{item}</p>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-8">
                                    <div>
                                        <h4 className="text-lg font-semibold text-slate-900 mb-4">Trust & Commitment</h4>
                                        <div className="space-y-4">
                                            {landing.trustBullets.map((bullet, idx) => (
                                                <p key={idx} className="text-sm text-slate-600 leading-relaxed font-light border-l border-slate-200 pl-4">{bullet}</p>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="join" className="mt-0">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                {landing.story.howItWorks.map((step, idx) => (
                                    <div key={idx} className="p-8 border border-slate-200 bg-white h-full flex flex-col">
                                        <p className="text-3xl font-light text-slate-300 mb-4">0{idx + 1}</p>
                                        <p className="text-base font-semibold text-slate-900 mb-3">{step.title}</p>
                                        <p className="text-sm text-slate-600 leading-relaxed">{step.body}</p>
                                    </div>
                                ))}
                            </div>
                        </TabsContent>

                        <TabsContent value="faq" className="mt-0">
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
                                {landing.faq.map((item, idx) => (
                                    <div key={idx}>
                                        <p className="text-sm font-bold text-slate-900 mb-2 uppercase tracking-wide">{item.question}</p>
                                        <p className="text-sm text-slate-600 leading-relaxed">{item.answer}</p>
                                    </div>
                                ))}
                            </div>
                        </TabsContent>
                    </Tabs>
                </section>

                {/* WAITLIST / FORM */}
                <section id="save-your-place" className="relative mt-12 bg-slate-900 p-8 sm:p-16 mb-20 text-white">
                    <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] pointer-events-none mix-blend-overlay"></div>
                    <div className="relative z-10 max-w-xl mx-auto">
                        <div className="text-center mb-10">
                            <h2 className="text-3xl font-bold uppercase tracking-tight mb-4 text-white">Secure Your Place</h2>
                            <p className="text-white/70 font-light">Join the group or start the booking path today.</p>
                        </div>
                        <div className="bg-white text-slate-900 p-1 rounded-sm">
                            <CampaignWaitlistForm
                                campaignName={landing.title}
                                endpoint={landing.form.endpoint}
                                enabled={landing.form.enabled}
                                defaultMode={landing.form.defaultMode}
                            />
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
