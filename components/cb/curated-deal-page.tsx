"use client";

import Image from "next/image";
import {
  Anchor,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Ship,
  Sparkles,
} from "lucide-react";

import { LandingFooter } from "@/components/landing-footer";
import { LandingNavbar } from "@/components/landing-navbar";
import type { PublicDealPage } from "@/lib/cb/deals-system/public-deal-projection";
import { DealCtaActions } from "./deal-cta-actions";

/**
 * Public render for an operator-approved Curated Deal (Phase 10/11/12).
 *
 * The public page has one entry action. Development routes it into the Booking
 * Assistant; production retains the approved booking handoff until rollout.
 * Resume-email and human-help choices belong inside the guided flow after the
 * guest has entered it, where they can share one activity journal.
 */
export function CuratedDealPage({ deal }: { deal: PublicDealPage }) {
  const facts = [
    { label: "Starting From", value: deal.facts.priceFromLabel, icon: CircleDollarSign },
    { label: "Sailing", value: deal.facts.sailDateLabel, icon: CalendarDays },
    { label: "Ship", value: deal.facts.shipName, icon: Ship },
    { label: "Destination", value: deal.facts.destination, icon: Anchor },
  ].filter((fact) => fact.value);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNavbar />

      <main className="pt-24">
        <section className="relative overflow-hidden border-b border-border bg-slate-950 text-white dark:bg-slate-950">
          <div className="absolute inset-0">
            {!deal.textOnlyLaunchWaived && (
              <Image
                src={deal.heroImageSrc}
                alt={deal.heroImageAlt}
                fill
                priority
                sizes="100vw"
                className="object-cover opacity-45"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-slate-950/35" />
          </div>

          <div className="relative mx-auto grid min-h-[520px] max-w-6xl items-end gap-8 px-6 pb-12 pt-24 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="max-w-3xl space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/85 backdrop-blur">
                <Sparkles className="h-4 w-4" />
                Curated Cruise Deal
              </div>
              <div className="space-y-4">
                <h1 className="text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
                  {deal.title}
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-white/82">{deal.heroSummary}</p>
                {deal.textOnlyLaunchWaived && (
                  <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white/80 backdrop-blur">
                    Images coming soon - book now while rates are available.
                  </p>
                )}
              </div>
              <DealCtaActions
                dealId={deal.id}
                bookingUrl={deal.bookingUrl}
                primaryLabel="Start Booking"
                tone="hero"
              />
            </div>

            <div className="rounded-lg border border-white/18 bg-white/12 p-5 shadow-2xl backdrop-blur-md">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/65">
                Why this trip
              </p>
              <div className="mt-4 space-y-3">
                {deal.whyThisTrip.slice(0, 4).map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                    <p className="text-sm leading-6 text-white/82">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-background px-6 py-6">
          <div className="mx-auto grid max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((fact) => (
              <div
                key={fact.label}
                className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm"
              >
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <fact.icon className="h-4 w-4 text-primary" />
                  {fact.label}
                </div>
                <p className="mt-2 text-sm font-semibold leading-6">{fact.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-background px-6 py-12">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_22rem]">
            <div className="space-y-10">
              {deal.positioningStatement && (
                <div className="space-y-4">
                  <h2 className="text-2xl font-bold">Why This Deal Is Worth A Look</h2>
                  <p className="max-w-3xl text-base leading-8 text-muted-foreground">
                    {deal.positioningStatement}
                  </p>
                </div>
              )}

              {deal.highlights.length > 0 && (
                <div className="grid gap-4 md:grid-cols-2">
                  {deal.highlights.slice(0, 6).map((highlight, index) => (
                    <div
                      key={`${highlight}-${index}`}
                      className="rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm"
                    >
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                      <p className="mt-3 text-sm leading-7 text-muted-foreground">{highlight}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid gap-8 md:grid-cols-2">
                {deal.destinationNotes.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="text-xl font-bold">Destination Notes</h2>
                    <div className="space-y-2">
                      {deal.destinationNotes.map((item, index) => (
                        <p
                          key={`${item}-${index}`}
                          className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
                        >
                          {item}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {deal.offerLines.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="text-xl font-bold">Offer Details</h2>
                    <div className="space-y-2">
                      {deal.offerLines.map((item, index) => (
                        <p
                          key={`${item}-${index}`}
                          className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
                        >
                          {item}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <aside className="h-fit rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm lg:sticky lg:top-24">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Ready to move?
              </p>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Prices, taxes, fees, cabin categories, and promos can change inside the booking
                portal. Confirm live details before final booking.
              </p>
              {deal.bestFor.length > 0 && (
                <div className="mt-5 space-y-2">
                  {deal.bestFor.slice(0, 4).map((item, index) => (
                    <div
                      key={`${item}-${index}`}
                      className="rounded-full bg-primary/10 px-3 py-2 text-xs font-semibold text-primary"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-6">
                <DealCtaActions
                  dealId={deal.id}
                  bookingUrl={deal.bookingUrl}
                  primaryLabel="Start Booking"
                  tone="light"
                />
              </div>
            </aside>
          </div>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 p-3 shadow-lg backdrop-blur md:hidden">
        <DealCtaActions
          dealId={deal.id}
          bookingUrl={deal.bookingUrl}
          primaryLabel="Start Booking"
          tone="mobile"
        />
      </div>

      <LandingFooter />
    </div>
  );
}
