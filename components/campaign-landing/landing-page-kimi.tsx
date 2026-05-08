'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import type { CampaignLandingViewModel } from '@/lib/campaigns/landing/view-model';
import { CampaignWaitlistForm } from './waitlist-form';

interface CampaignLandingPageKimiProps {
    landing: CampaignLandingViewModel;
}

export function CampaignLandingPageKimi({ landing }: CampaignLandingPageKimiProps) {
    const [activeTab, setActiveTab] = useState<'what-it-is' | 'what-to-expect' | 'how-it-works'>('what-it-is');

    const galleryImages = landing.galleryImages.filter((image) => image.url.trim().length > 0);

    const primaryHref = landing.ctas.primary.mode === 'BOOK_NOW' && !landing.ctas.primary.disabled
        ? (landing.links.retailBooking ?? landing.links.booking ?? '#save-your-place')
        : '#save-your-place';

    const secondaryHref = landing.ctas.secondary.mode === 'BOOK_NOW' && !landing.ctas.secondary.disabled
        ? (landing.links.retailBooking ?? landing.links.booking ?? '#save-your-place')
        : '#save-your-place';

    return (
        <div className="min-h-screen bg-white">
            {/* Full-width Hero Section - Massive Visual Weight on Hero Image */}
            <section className="relative w-full">
                {/* Hero Image as Background - Full Bleed */}
                <div className="relative h-[70vh] min-h-[500px] max-h-[800px] w-full overflow-hidden">
                    {landing.heroImage?.url ? (
                        <>
                            <img
                                src={landing.heroImage.url}
                                alt={landing.heroImage.alt}
                                className="absolute inset-0 h-full w-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                        </>
                    ) : (
                        <div className="absolute inset-0 bg-slate-900" />
                    )}

                    {/* Hero Content Overlay */}
                    <div className="absolute inset-0 flex flex-col justify-end">
                        <div className="mx-auto w-full max-w-6xl px-6 pb-16 md:px-8 lg:pb-20">
                            <div className="max-w-3xl">
                                <p className="text-sm font-medium tracking-wide text-white/80">
                                    {landing.stateLabel}
                                </p>
                                <h1 className="mt-3 text-4xl font-semibold leading-tight text-white md:text-5xl lg:text-6xl">
                                    {landing.heroSlogan}
                                </h1>
                                <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/85">
                                    {landing.subSlogan}
                                </p>

                                {/* CTA Row */}
                                <div className="mt-8 flex flex-wrap gap-3">
                                    {landing.ctas.primary.disabled ? (
                                        <Button size="lg" disabled className="px-6 py-3 text-base">
                                            {landing.ctas.primary.label}
                                        </Button>
                                    ) : (
                                        <Button
                                            asChild
                                            size="lg"
                                            className="px-6 py-3 text-base"
                                            style={{ backgroundColor: landing.accentColor }}
                                        >
                                            <a href={primaryHref}>
                                                {landing.ctas.primary.label}
                                            </a>
                                        </Button>
                                    )}

                                    {landing.ctas.secondary.disabled ? (
                                        <Button size="lg" variant="outline" disabled className="px-6 py-3 text-base border-white/30 text-white hover:bg-white/10">
                                            {landing.ctas.secondary.label}
                                        </Button>
                                    ) : (
                                        <Button
                                            asChild
                                            size="lg"
                                            variant="outline"
                                            className="px-6 py-3 text-base border-white/30 text-white hover:bg-white/10"
                                        >
                                            <a href={secondaryHref}>
                                                {landing.ctas.secondary.label}
                                            </a>
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Facts Bar - Symmetrical Grid */}
            <section className="w-full border-b border-slate-200 bg-slate-50">
                <div className="mx-auto max-w-6xl px-6 py-8 md:px-8">
                    <div className="grid grid-cols-2 gap-px bg-slate-200 md:grid-cols-4">
                        {landing.facts.map((fact) => (
                            <div key={fact.label} className="bg-slate-50 p-6 text-center">
                                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                    {fact.label}
                                </p>
                                <p className="mt-2 text-lg font-semibold text-slate-900">
                                    {fact.value}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Main Content - Symmetrical Two Column Layout */}
            <div className="mx-auto max-w-6xl px-6 py-12 md:px-8 lg:py-16">
                <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
                    {/* Left Column: Story Content */}
                    <div className="space-y-8">
                        {/* Elevator Pitch */}
                        <div>
                            <p className="text-lg leading-relaxed text-slate-700">
                                {landing.elevatorPitch}
                            </p>
                        </div>

                        {/* Why Join Now */}
                        <div>
                            <h2 className="text-xl font-semibold text-slate-900">Why Join Now</h2>
                            <div className="mt-4 space-y-3">
                                {landing.story.whyJoinNow.map((reason, index) => (
                                    <div key={index} className="flex gap-4">
                                        <div
                                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                                            style={{ backgroundColor: landing.accentColor }}
                                        />
                                        <p className="text-slate-700 leading-relaxed">{reason}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Gallery Image - Editorial Placement */}
                        {galleryImages[0] && (
                            <div className="overflow-hidden rounded-md">
                                <img
                                    src={galleryImages[0].url}
                                    alt={galleryImages[0].alt}
                                    className="h-64 w-full object-cover"
                                />
                            </div>
                        )}

                        {/* Experience Bullets */}
                        <div>
                            <h2 className="text-xl font-semibold text-slate-900">What This Trip Feels Like</h2>
                            <div className="mt-4 space-y-4">
                                {landing.experienceBullets.map((bullet, index) => (
                                    <Card key={index} className="border-slate-200">
                                        <CardContent className="p-4">
                                            <p className="text-slate-700 leading-relaxed">{bullet}</p>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Threshold, Pricing, Details */}
                    <div className="space-y-8">
                        {/* Group Formation Card */}
                        <Card className="overflow-hidden border-slate-200">
                            <div
                                className="h-2 w-full"
                                style={{ backgroundColor: landing.accentColor }}
                            />
                            <CardContent className="p-6">
                                <h3 className="text-lg font-semibold text-slate-900">
                                    The Group Is Forming
                                </h3>
                                <p className="mt-2 text-slate-600">{landing.threshold.headline}</p>

                                <div className="mt-6 space-y-4">
                                    <div>
                                        <div className="flex justify-between text-sm text-slate-600">
                                            <span>{landing.threshold.joinedEntries} groups interested</span>
                                            <span>{landing.threshold.requiredCabins} cabins needed</span>
                                        </div>
                                        <Progress
                                            value={landing.threshold.percentOfThreshold}
                                            className="mt-2 h-2"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 pt-2">
                                        <div className="rounded-md bg-slate-50 p-4">
                                            <p className="text-xs uppercase tracking-wide text-slate-500">
                                                Guests represented
                                            </p>
                                            <p className="mt-1 text-2xl font-semibold text-slate-900">
                                                {landing.threshold.joinedPassengers}
                                            </p>
                                        </div>
                                        <div className="rounded-md bg-slate-50 p-4">
                                            <p className="text-xs uppercase tracking-wide text-slate-500">
                                                Progress
                                            </p>
                                            <p className="mt-1 text-2xl font-semibold text-slate-900">
                                                {landing.threshold.percentOfThreshold}%
                                            </p>
                                        </div>
                                    </div>

                                    <p className="text-sm text-slate-600 leading-relaxed">
                                        {landing.threshold.detail}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Pricing Card */}
                        <Card className="border-slate-200">
                            <CardContent className="p-6">
                                <h3 className="text-lg font-semibold text-slate-900">Current Pricing</h3>
                                <p className="text-sm text-slate-500">{landing.pricing.sourceLabel}</p>

                                <div className="mt-4 grid grid-cols-2 gap-4">
                                    <div className="rounded-md bg-slate-50 p-4">
                                        <p className="text-xs uppercase tracking-wide text-slate-500">
                                            Starting from
                                        </p>
                                        <p className="mt-1 text-2xl font-semibold text-slate-900">
                                            {landing.pricing.startingPriceLabel}
                                        </p>
                                    </div>
                                    <div className="flex items-center rounded-md bg-slate-50 p-4">
                                        <p className="text-sm leading-relaxed text-slate-600">
                                            {landing.pricing.detail}
                                        </p>
                                    </div>
                                </div>

                                {galleryImages[1] && (
                                    <div className="mt-4 overflow-hidden rounded-md">
                                        <img
                                            src={galleryImages[1].url}
                                            alt={galleryImages[1].alt}
                                            className="h-32 w-full object-cover"
                                        />
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Gallery Images Row */}
                        {galleryImages.length > 2 && (
                            <div className="grid grid-cols-2 gap-4">
                                {galleryImages.slice(2, 4).map((image, index) => (
                                    <div key={index} className="overflow-hidden rounded-md">
                                        <img
                                            src={image.url}
                                            alt={image.alt}
                                            className="h-40 w-full object-cover"
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Story Tabs Section - Full Width with Centered Content */}
            <section className="w-full border-t border-slate-200 bg-slate-50">
                <div className="mx-auto max-w-6xl px-6 py-12 md:px-8 lg:py-16">
                    {/* Tab Navigation */}
                    <div className="flex border-b border-slate-300">
                        {[
                            { id: 'what-it-is', label: 'What It Is' },
                            { id: 'what-to-expect', label: 'What To Expect' },
                            { id: 'how-it-works', label: 'How It Works' },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                                className={`px-6 py-3 text-sm font-medium transition-colors ${
                                    activeTab === tab.id
                                        ? 'border-b-2 border-slate-900 text-slate-900'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="pt-8">
                        {activeTab === 'what-it-is' && (
                            <div className="grid gap-8 lg:grid-cols-2">
                                <div>
                                    <h3 className="text-xl font-semibold text-slate-900">
                                        {landing.story.whatItIs.title}
                                    </h3>
                                    <p className="mt-4 leading-relaxed text-slate-700">
                                        {landing.story.whatItIs.body}
                                    </p>
                                </div>
                                <div className="space-y-4">
                                    <h3 className="text-xl font-semibold text-slate-900">What This Trip Feels Like</h3>
                                    <div className="space-y-3">
                                        {landing.experienceBullets.map((bullet, index) => (
                                            <div key={index} className="flex gap-3">
                                                <div
                                                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                                                    style={{ backgroundColor: landing.accentColor }}
                                                />
                                                <p className="text-slate-700 leading-relaxed">{bullet}</p>
                                            </div>
                                        ))}
                                    </div>
                                    {galleryImages[4] && (
                                        <div className="mt-4 overflow-hidden rounded-md">
                                            <img
                                                src={galleryImages[4].url}
                                                alt={galleryImages[4].alt}
                                                className="h-48 w-full object-cover"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'what-to-expect' && (
                            <div className="grid gap-8 lg:grid-cols-2">
                                <div>
                                    <h3 className="text-xl font-semibold text-slate-900">What Guests Can Expect</h3>
                                    <div className="mt-4 space-y-3">
                                        {landing.story.whatToExpect.map((item, index) => (
                                            <Card key={index} className="border-slate-200">
                                                <CardContent className="flex items-start gap-4 p-4">
                                                    {galleryImages[5 + index] && (
                                                        <div className="hidden h-16 w-16 shrink-0 overflow-hidden rounded-sm md:block">
                                                            <img
                                                                src={galleryImages[5 + index].url}
                                                                alt=""
                                                                className="h-full w-full object-cover"
                                                            />
                                                        </div>
                                                    )}
                                                    <p className="text-slate-700 leading-relaxed">{item}</p>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-xl font-semibold text-slate-900">Before You Commit</h3>
                                    <div className="mt-4 space-y-3">
                                        {landing.trustBullets.map((bullet, index) => (
                                            <div key={index} className="flex gap-3">
                                                <div
                                                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                                                    style={{ backgroundColor: landing.accentColor }}
                                                />
                                                <p className="text-slate-700 leading-relaxed">{bullet}</p>
                                            </div>
                                        ))}
                                    </div>
                                    {galleryImages[7] && (
                                        <div className="mt-6 overflow-hidden rounded-md">
                                            <img
                                                src={galleryImages[7].url}
                                                alt={galleryImages[7].alt}
                                                className="h-48 w-full object-cover"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'how-it-works' && (
                            <div className="grid gap-8 lg:grid-cols-2">
                                <div>
                                    <h3 className="text-xl font-semibold text-slate-900">How Joining Works</h3>
                                    <div className="mt-4 space-y-4">
                                        {landing.story.howItWorks.map((step, index) => (
                                            <div key={index} className="border-l-2 border-slate-300 pl-6">
                                                <div
                                                    className="-ml-6 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium text-white"
                                                    style={{ backgroundColor: landing.accentColor }}
                                                >
                                                    {index + 1}
                                                </div>
                                                <h4 className="mt-2 font-semibold text-slate-900">{step.title}</h4>
                                                <p className="mt-1 text-slate-700 leading-relaxed">{step.body}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-xl font-semibold text-slate-900">Questions Before You Decide</h3>
                                    <div className="mt-4 space-y-4">
                                        {landing.faq.map((item, index) => (
                                            <Card key={index} className="border-slate-200">
                                                <CardContent className="p-4">
                                                    <p className="font-semibold text-slate-900">{item.question}</p>
                                                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                                                        {item.answer}
                                                    </p>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* Waitlist Form Section */}
            <section id="save-your-place" className="w-full">
                <div className="mx-auto max-w-6xl px-6 py-12 md:px-8 lg:py-16">
                    <div className="grid gap-8 lg:grid-cols-[1fr_1.5fr]">
                        {/* Left: Context */}
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-2xl font-semibold text-slate-900">
                                    Save Your Place
                                </h2>
                                <p className="mt-2 text-slate-600">
                                    Join the group list for {landing.title}. You are not paying on this page —
                                    this step only saves your interest so we can send you the next step when your path opens.
                                </p>
                            </div>

                            {galleryImages[8] && (
                                <div className="overflow-hidden rounded-md">
                                    <img
                                        src={galleryImages[8].url}
                                        alt={galleryImages[8].alt}
                                        className="h-48 w-full object-cover"
                                    />
                                </div>
                            )}

                            {galleryImages[9] && (
                                <div className="overflow-hidden rounded-md">
                                    <img
                                        src={galleryImages[9].url}
                                        alt={galleryImages[9].alt}
                                        className="h-48 w-full object-cover"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Right: Form */}
                        <div>
                            <CampaignWaitlistForm
                                campaignName={landing.title}
                                endpoint={landing.form.endpoint}
                                enabled={landing.form.enabled}
                                defaultMode={landing.form.defaultMode}
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="w-full border-t border-slate-200 bg-slate-50">
                <div className="mx-auto max-w-6xl px-6 py-8 md:px-8">
                    <div className="flex flex-col items-center justify-between gap-4 text-sm text-slate-500 md:flex-row">
                        <p>{landing.title}</p>
                        <p>{landing.stateLabel}</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
