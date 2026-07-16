import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Anchor, CalendarDays, CheckCircle2, CircleDollarSign, Ship, Sparkles } from "lucide-react";

import { CuratedDealPage } from "@/components/cb/curated-deal-page";
import { DealLandingPage } from "@/components/cb/deal-landing-page";
import { DealViewBeacon } from "@/components/cb/deal-view-beacon";
import { LandingFooter } from "@/components/landing-footer";
import { LandingNavbar } from "@/components/landing-navbar";
import { Button } from "@/components/ui/button";
import { getStoredCbDealDetailById } from "@/lib/cb/cb-deal-details";
import { getPublicDealPageById } from "@/lib/cb/deals-system/public-deals";

export const dynamic = "force-dynamic";

function safeList(values: string[], fallback: string): string[] {
  const filtered = values.map((value) => value.trim()).filter(Boolean);
  return filtered.length > 0 ? filtered : [fallback];
}

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id?: string | string[] }>;
}) {
  const resolvedParams = await params;
  const id = Array.isArray(resolvedParams.id)
    ? resolvedParams.id.join("/")
    : resolvedParams.id;

  if (!id) {
    return notFound();
  }

  // Phase 10: an operator-approved Curated Deal takes precedence. Only
  // homepage-eligible Deals resolve here (getPublicDealPageById gates on
  // bookable + approved + valid link); non-eligible curated Deals fall through
  // and, if not in the legacy store either, render as notFound.
  const curated = await getPublicDealPageById(id);
  if (curated) {
    // When a funnel synthesis exists, render the premium master-template page
    // (the Claude Design "Deal Page"); otherwise fall back to the legacy layout.
    if (curated.designPage) {
      return (
        <>
          {/* Machine-readable rendering marker for the public-deals smoke test
              (npm run smoke-public-deals): "design" = synthesis layout. */}
          <span data-deal-rendering="design" hidden />
          <DealViewBeacon dealId={curated.id} />
          <DealLandingPage dealId={curated.id} page={curated.designPage} />
        </>
      );
    }
    return (
      <>
        {/* "legacy" = no funnel synthesis resolved for this deal. Expected only
            for deals that never had a synthesis; on a synthesized deal this
            means the lookup degraded — the smoke test flags it. */}
        <span data-deal-rendering="legacy" hidden />
        <DealViewBeacon dealId={curated.id} />
        <CuratedDealPage deal={curated} />
      </>
    );
  }

  const deal = await getStoredCbDealDetailById(id);

  if (!deal) {
    return notFound();
  }

  const facts = [
    { label: "Starting From", value: deal.cruiseFacts.priceFromLabel, icon: CircleDollarSign },
    { label: "Sailing", value: deal.cruiseFacts.sailDateLabel, icon: CalendarDays },
    { label: "Ship", value: deal.cruiseFacts.shipName, icon: Ship },
    { label: "Destination", value: deal.cruiseFacts.destination, icon: Anchor },
  ].filter((fact) => fact.value);

  const bookingHref = deal.booking.bookingUrl;
  const dealHighlights = safeList(deal.display.dealHighlights, "Current Cruise Brothers featured deal.");
  const itineraryHighlights = safeList(deal.display.itineraryHighlights, deal.cruiseFacts.destination);
  const destinationHighlights = safeList(deal.display.destinationHighlights, deal.cruiseFacts.destination);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNavbar />

      <main className="pt-24">
        <section className="relative overflow-hidden border-b border-border bg-slate-950 text-white dark:bg-slate-950">
          <div className="absolute inset-0">
            <Image
              src={deal.display.heroImageSrc}
              alt={deal.display.heroImageAlt}
              fill
              priority
              sizes="100vw"
              className="object-cover opacity-45"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-slate-950/35" />
          </div>

          <div className="relative mx-auto grid min-h-[520px] max-w-6xl items-end gap-8 px-6 pb-12 pt-24 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="max-w-3xl space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/85 backdrop-blur">
                <Sparkles className="h-4 w-4" />
                Deals and Specials
              </div>
              <div className="space-y-4">
                <h1 className="text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
                  {deal.display.title}
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-white/82">
                  {deal.display.subtitle}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {bookingHref ? (
                  <Button asChild size="lg" className="rounded-full px-6 font-semibold">
                    <a href={bookingHref} target="_blank" rel="noreferrer">
                      Book through Cruise Brothers
                    </a>
                  </Button>
                ) : (
                  <Button disabled size="lg" className="rounded-full px-6 font-semibold">
                    Booking link pending review
                  </Button>
                )}
                <Button asChild variant="outline" size="lg" className="rounded-full border-white/35 bg-white/10 px-6 text-white hover:bg-white hover:text-slate-950">
                  <Link href="/contact">Ask about this deal</Link>
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-white/18 bg-white/12 p-5 shadow-2xl backdrop-blur-md">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/65">
                Live-booking status
              </p>
              <div className="mt-4 flex items-start gap-3">
                <CheckCircle2 className={bookingHref ? "mt-1 h-5 w-5 text-emerald-300" : "mt-1 h-5 w-5 text-amber-300"} />
                <div>
                  <p className="font-semibold">
                    {bookingHref ? "Ready for CB booking handoff" : "Deal info is ready, booking link needs review"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/72">
                    {deal.display.urgencyCopy}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-background px-6 py-6">
          <div className="mx-auto grid max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label} className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
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
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Why This Deal Is Worth A Look</h2>
                <p className="max-w-3xl text-base leading-8 text-muted-foreground">
                  {deal.display.longSummary}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {dealHighlights.map((highlight, index) => (
                  <div key={`${highlight}-${index}`} className="rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{highlight}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-8 md:grid-cols-2">
                <div className="space-y-3">
                  <h2 className="text-xl font-bold">Itinerary Highlights</h2>
                  <div className="space-y-2">
                    {itineraryHighlights.map((item, index) => (
                      <p key={`${item}-${index}`} className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <h2 className="text-xl font-bold">Destination Notes</h2>
                  <div className="space-y-2">
                    {destinationHighlights.map((item, index) => (
                      <p key={`${item}-${index}`} className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <aside className="h-fit rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm lg:sticky lg:top-24">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Ready to move?
              </p>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Prices, taxes, fees, cabin categories, and promos can change inside the CB portal. Confirm live details before final booking.
              </p>
              {deal.cruiseFacts.includedPerks.length > 0 && (
                <div className="mt-5 space-y-2">
                  {deal.cruiseFacts.includedPerks.map((perk, index) => (
                    <div key={`${perk}-${index}`} className="rounded-full bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
                      {perk}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-6 space-y-3">
                {bookingHref ? (
                  <Button asChild className="w-full rounded-full font-semibold">
                    <a href={bookingHref} target="_blank" rel="noreferrer">
                      Book through CB
                    </a>
                  </Button>
                ) : (
                  <Button disabled className="w-full rounded-full font-semibold">
                    Booking pending
                  </Button>
                )}
                <Button asChild variant="outline" className="w-full rounded-full font-semibold">
                  <Link href="/">Back to deals</Link>
                </Button>
              </div>
            </aside>
          </div>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 p-3 shadow-lg backdrop-blur md:hidden">
        {bookingHref ? (
          <Button asChild className="w-full rounded-full font-semibold">
            <a href={bookingHref} target="_blank" rel="noreferrer">
              Book through Cruise Brothers
            </a>
          </Button>
        ) : (
          <Button asChild className="w-full rounded-full font-semibold">
            <Link href="/contact">Ask about this deal</Link>
          </Button>
        )}
      </div>

      <LandingFooter />
    </div>
  );
}


