"use client";

import { useState } from "react";

import Image from "next/image";
import {
  Anchor,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  Loader2,
  Mail,
  Phone,
  Ship,
  Sparkles,
} from "lucide-react";

import { LandingFooter } from "@/components/landing-footer";
import { LandingNavbar } from "@/components/landing-navbar";
import { Button } from "@/components/ui/button";
import type { PublicDealPage } from "@/lib/cb/deals-system/public-deal-projection";

/**
 * Public render for an operator-approved Curated Deal (Phase 10/11/12).
 *
 * Book now: opens the approved booking URL.
 * Email me the link: opens an inline email form, then calls
 *   POST /api/deals/link-request with { dealId, email }. The booking URL also
 *   opens in a new tab immediately; the response reports whether the Klaviyo
 *   email send (Phase 12) actually went out.
 * Request a callback: calls POST /api/deals/callback-request — stores the request
 *   and sends an admin Pushover notification (Phase 13 adds the operator dashboard).
 *
 * Email me the link captures only an email address. Callback captures name,
 * email, phone, and notes from a minimal inline form.
 */
export function CuratedDealPage({ deal }: { deal: PublicDealPage }) {
  const [linkState, setLinkState] = useState<
    "idle" | "form" | "submitting" | "sent" | "opened_only" | "error"
  >("idle");
  const [linkEmail, setLinkEmail] = useState("");
  const [linkError, setLinkError] = useState("");
  const [callbackState, setCallbackState] = useState<
    "idle" | "form" | "submitting" | "done" | "error"
  >("idle");
  const [callbackName, setCallbackName] = useState("");
  const [callbackEmail, setCallbackEmail] = useState("");
  const [callbackPhone, setCallbackPhone] = useState("");
  const [callbackNotes, setCallbackNotes] = useState("");
  const [callbackError, setCallbackError] = useState("");

  const isSubmitting = callbackState === "submitting";
  const isLinkSubmitting = linkState === "submitting";

  const facts = [
    { label: "Starting From", value: deal.facts.priceFromLabel, icon: CircleDollarSign },
    { label: "Sailing", value: deal.facts.sailDateLabel, icon: CalendarDays },
    { label: "Ship", value: deal.facts.shipName, icon: Ship },
    { label: "Destination", value: deal.facts.destination, icon: Anchor },
  ].filter((fact) => fact.value);

  async function handleEmailLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!linkEmail) {
      setLinkError("Please enter an email address.");
      return;
    }
    setLinkError("");
    setLinkState("submitting");
    try {
      const res = await fetch("/api/deals/link-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId: deal.id, email: linkEmail }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        url?: string;
        emailDelivered?: boolean;
      };
      if (data.ok && data.url) {
        window.open(data.url, "_blank", "noreferrer");
        setLinkState(data.emailDelivered ? "sent" : "opened_only");
      } else {
        setLinkState("error");
      }
    } catch {
      setLinkState("error");
    }
  }

  async function handleCallbackSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!callbackEmail && !callbackPhone) {
      setCallbackError("Please enter an email address or phone number.");
      return;
    }
    setCallbackError("");
    setCallbackState("submitting");
    try {
      const res = await fetch("/api/deals/callback-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId: deal.id,
          name: callbackName || undefined,
          email: callbackEmail || undefined,
          phone: callbackPhone || undefined,
          notes: callbackNotes || undefined,
        }),
      });
      const data = (await res.json()) as { ok: boolean };
      setCallbackState(data.ok ? "done" : "error");
    } catch {
      setCallbackState("error");
    }
  }

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
                    Images coming soon — book now while rates are available.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="rounded-full px-6 font-semibold">
                  <a href={deal.bookingUrl} target="_blank" rel="noreferrer">
                    Book now
                  </a>
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  disabled={linkState === "sent" || linkState === "opened_only"}
                  onClick={() => setLinkState(linkState === "form" ? "idle" : "form")}
                  className="rounded-full border-white/35 bg-white/10 px-6 text-white hover:bg-white hover:text-slate-950 disabled:opacity-60"
                >
                  {linkState === "sent" || linkState === "opened_only" ? (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  ) : (
                    <Mail className="mr-2 h-4 w-4" />
                  )}
                  {linkState === "sent"
                    ? "Link sent"
                    : linkState === "opened_only"
                      ? "Link opened"
                      : "Email me the booking link"}
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setCallbackState(callbackState === "form" ? "idle" : "form")}
                  className="rounded-full border-white/35 bg-white/10 px-6 text-white hover:bg-white hover:text-slate-950"
                >
                  <Phone className="mr-2 h-4 w-4" />
                  Request an agent callback
                </Button>
              </div>

              {linkState === "form" && (
                <form
                  onSubmit={handleEmailLinkSubmit}
                  className="mt-2 max-w-sm space-y-3 rounded-lg border border-white/20 bg-white/10 p-5 backdrop-blur"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
                    Email me the booking link
                  </p>
                  <input
                    type="email"
                    placeholder="Email address"
                    value={linkEmail}
                    onChange={(e) => setLinkEmail(e.target.value)}
                    className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/40"
                  />
                  {linkError && <p className="text-xs text-red-300">{linkError}</p>}
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isLinkSubmitting}
                    className="w-full rounded-full font-semibold"
                  >
                    {isLinkSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {isLinkSubmitting ? "Sending…" : "Send me the link"}
                  </Button>
                </form>
              )}

              {linkState === "sent" && (
                <p className="text-sm text-emerald-300">
                  Link sent to your email — also opened in a new tab.
                </p>
              )}
              {linkState === "opened_only" && (
                <p className="text-sm text-amber-300">
                  Link opened in a new tab. We couldn&apos;t send the email right now — try again
                  or contact us directly.
                </p>
              )}

              {callbackState === "form" && (
                <form
                  onSubmit={handleCallbackSubmit}
                  className="mt-2 max-w-sm space-y-3 rounded-lg border border-white/20 bg-white/10 p-5 backdrop-blur"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
                    Request a callback
                  </p>
                  <input
                    type="text"
                    placeholder="Your name (optional)"
                    value={callbackName}
                    onChange={(e) => setCallbackName(e.target.value)}
                    className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/40"
                  />
                  <input
                    type="email"
                    placeholder="Email address"
                    value={callbackEmail}
                    onChange={(e) => setCallbackEmail(e.target.value)}
                    className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/40"
                  />
                  <input
                    type="tel"
                    placeholder="Phone (optional)"
                    value={callbackPhone}
                    onChange={(e) => setCallbackPhone(e.target.value)}
                    className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/40"
                  />
                  <textarea
                    placeholder="Anything you'd like us to know? (optional)"
                    value={callbackNotes}
                    onChange={(e) => setCallbackNotes(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/40"
                  />
                  {callbackError && (
                    <p className="text-xs text-red-300">{callbackError}</p>
                  )}
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isSubmitting}
                    className="w-full rounded-full font-semibold"
                  >
                    {isSubmitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {isSubmitting ? "Sending…" : "Send request"}
                  </Button>
                </form>
              )}

              {callbackState === "done" && (
                <p className="text-sm text-emerald-300">
                  Request received — an agent will be in touch.
                </p>
              )}
              {(callbackState === "error" || linkState === "error") && !linkError && (
                <p className="text-sm text-red-300">
                  Something went wrong. Please try again or contact us directly.
                </p>
              )}
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
              <div className="mt-6 space-y-3">
                <Button asChild className="w-full rounded-full font-semibold">
                  <a href={deal.bookingUrl} target="_blank" rel="noreferrer">
                    Book now
                  </a>
                </Button>
                <Button
                  variant="outline"
                  className="w-full rounded-full font-semibold"
                  disabled={linkState === "sent" || linkState === "opened_only"}
                  onClick={() => setLinkState(linkState === "form" ? "idle" : "form")}
                >
                  {linkState === "sent" || linkState === "opened_only" ? (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  ) : (
                    <Mail className="mr-2 h-4 w-4" />
                  )}
                  {linkState === "sent"
                    ? "Link sent"
                    : linkState === "opened_only"
                      ? "Link opened"
                      : "Email me the link"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full rounded-full font-semibold"
                  onClick={() => setCallbackState(callbackState === "form" ? "idle" : "form")}
                >
                  <Phone className="mr-2 h-4 w-4" />
                  Request a callback
                </Button>
              </div>

              {callbackState === "done" && (
                <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">
                  Request received — an agent will be in touch.
                </p>
              )}
              {linkState === "sent" && (
                <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">
                  Link sent to your email.
                </p>
              )}
            </aside>
          </div>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 p-3 shadow-lg backdrop-blur md:hidden">
        <Button asChild className="w-full rounded-full font-semibold">
          <a href={deal.bookingUrl} target="_blank" rel="noreferrer">
            Book now
          </a>
        </Button>
      </div>

      <LandingFooter />
    </div>
  );
}
