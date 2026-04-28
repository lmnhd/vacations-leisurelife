import type { CampaignLandingViewModel } from "@/lib/campaigns/landing/view-model";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { alfa_slab_one, prompt } from "@/lib/fonts";
import { CampaignWaitlistForm } from "./waitlist-form";

interface CampaignLandingPageClaudeProps {
  landing: CampaignLandingViewModel;
}

// Perceived brightness 0–255 (ITU-R BT.601). Returns 128 for unparseable colors.
function brightness(hex: string): number {
  const c = hex.replace("#", "");
  if (c.length !== 6) return 128;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

// Derives a contrast-safe palette from the campaign's three color tokens.
function buildPalette(landing: CampaignLandingViewModel) {
  const sl = brightness(landing.surfaceColor) > 128;
  const al = brightness(landing.accentColor) > 128;
  return {
    bodyText: sl ? "#111827" : landing.textColor,
    onAccentText: al ? "#0f172a" : "#ffffff",
    cardBg: sl ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)",
    border: sl ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)",
    divider: sl ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)",
    progressTrack: sl ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.10)",
    imageOverlay: sl ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.12)",
  };
}

export function CampaignLandingPageClaude({
  landing,
}: CampaignLandingPageClaudeProps) {
  const p = buildPalette(landing);

  const galleryImages = landing.galleryImages.filter(
    (img) => img.url.trim().length > 0,
  );
  const getGalleryImage = (index: number) =>
    galleryImages.length > 0
      ? galleryImages[index % galleryImages.length]
      : null;

  const primaryHref =
    landing.links.booking &&
    landing.ctas.primary.mode === "BOOK_NOW" &&
    !landing.ctas.primary.disabled &&
    (landing.state === "THRESHOLD_MET" || landing.state === "CONVERTED")
      ? landing.links.booking
      : "#save-your-place";

  const secondaryHref =
    landing.links.booking &&
    landing.ctas.secondary.mode === "BOOK_NOW" &&
    !landing.ctas.secondary.disabled &&
    (landing.state === "THRESHOLD_MET" || landing.state === "CONVERTED")
      ? landing.links.booking
      : "#save-your-place";

  const heroGradient = `linear-gradient(to top, ${landing.surfaceColor} 0%, ${landing.surfaceColor}99 45%, ${landing.surfaceColor}22 100%)`;

  const voyageLabels = new Set([
    "Sailing",
    "Ship",
    "Departure Port",
    "Destination",
    "Duration",
  ]);
  const voyageFacts = landing.facts.filter((f) => voyageLabels.has(f.label));
  const groupFacts = landing.facts.filter((f) => !voyageLabels.has(f.label));
  const voyageColClass =
    voyageFacts.length <= 3
      ? "grid-cols-1 sm:grid-cols-3"
      : voyageFacts.length === 4
        ? "grid-cols-2 lg:grid-cols-4"
        : "grid-cols-2 lg:grid-cols-5";

  return (
    <div
      className={`${prompt.className} min-h-screen`}
      style={{ backgroundColor: landing.surfaceColor, color: p.bodyText }}
    >
      {/* ── PREVIEW BANNER ── */}
      {landing.preview && (
        <div className="sticky top-0 z-50 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-700">
          Preview mode — this page is not publicly visible
        </div>
      )}

      {/* ── HERO ── */}
      <section className="relative flex min-h-screen flex-col justify-end overflow-hidden">
        {landing.heroImage?.url ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${landing.heroImage.url})` }}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(160deg, ${landing.surfaceColor}, #000)`,
            }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{ background: heroGradient }}
        />

        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-14 pt-28 md:px-6 lg:px-8">
          <div className="grid items-end gap-10 lg:grid-cols-[1fr_340px]">
            <div className="grid gap-6">
              <div
                className="h-0.5 w-20"
                style={{ backgroundColor: landing.accentColor }}
              />
              <div>
                <p
                  className="mb-3 text-xs uppercase tracking-widest"
                  style={{ color: landing.accentColor }}
                >
                  {landing.stateLabel} · {landing.title}
                </p>
                <h1
                  className={`${alfa_slab_one.className} text-5xl leading-none md:text-6xl xl:text-7xl`}
                  style={{ color: p.bodyText }}
                >
                  {landing.heroSlogan}
                </h1>
                <p
                  className="mt-5 max-w-2xl text-lg leading-8 md:text-xl"
                  style={{ color: p.bodyText, opacity: 0.75 }}
                >
                  {landing.subSlogan}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                {landing.ctas.primary.disabled ? (
                  <Button
                    size="lg"
                    disabled
                    className="h-12 rounded-none px-7 text-base opacity-40"
                  >
                    {landing.ctas.primary.label}
                  </Button>
                ) : (
                  <Button
                    asChild
                    size="lg"
                    className="h-12 rounded-none px-7 text-base font-semibold hover:opacity-90"
                    style={{
                      backgroundColor: landing.accentColor,
                      color: p.onAccentText,
                    }}
                  >
                    <a
                      href={primaryHref}
                      target={
                        primaryHref.startsWith("http") ? "_blank" : undefined
                      }
                      rel={
                        primaryHref.startsWith("http")
                          ? "noreferrer"
                          : undefined
                      }
                    >
                      {landing.ctas.primary.label}
                    </a>
                  </Button>
                )}
                {landing.ctas.secondary.disabled ? (
                  <Button
                    size="lg"
                    variant="outline"
                    disabled
                    className="h-12 rounded-none px-7 text-base opacity-40"
                    style={{
                      borderColor: landing.accentColor,
                      color: p.bodyText,
                    }}
                  >
                    {landing.ctas.secondary.label}
                  </Button>
                ) : (
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="h-12 rounded-none bg-transparent px-7 text-base hover:opacity-80"
                    style={{
                      borderColor: landing.accentColor,
                      color: p.bodyText,
                    }}
                  >
                    <a
                      href={secondaryHref}
                      target={
                        secondaryHref.startsWith("http") ? "_blank" : undefined
                      }
                      rel={
                        secondaryHref.startsWith("http")
                          ? "noreferrer"
                          : undefined
                      }
                    >
                      {landing.ctas.secondary.label}
                    </a>
                  </Button>
                )}
              </div>
            </div>

            <div className="hidden lg:block">
              <p
                className="text-sm leading-7"
                style={{ color: p.bodyText, opacity: 0.6 }}
              >
                {landing.elevatorPitch}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── VOYAGE FACTS STRIP ──
                Two tiers: voyage details (port, ship, dates, destination, duration) with
                accent-colored labels and larger values so guests can orient immediately;
                then group facts (cabins, waitlist) in a quieter secondary row below.
            */}
      <div
        style={{
          borderTop: `1px solid ${p.border}`,
          borderBottom: `1px solid ${p.border}`,
        }}
      >
        {voyageFacts.length > 0 && (
          <div style={{ backgroundColor: p.cardBg }}>
            <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
              <div className={`grid ${voyageColClass}`}>
                {voyageFacts.map((fact, idx) => (
                  <div
                    key={fact.label}
                    className="px-6 py-7"
                    style={
                      idx < voyageFacts.length - 1
                        ? { borderRight: `1px solid ${p.border}` }
                        : undefined
                    }
                  >
                    <p
                      className="text-xs uppercase tracking-widest"
                      style={{ color: landing.accentColor }}
                    >
                      {fact.label}
                    </p>
                    <p
                      className="mt-2 text-xl font-semibold"
                      style={{ color: p.bodyText }}
                    >
                      {fact.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {groupFacts.length > 0 && (
          <div style={{ borderTop: `1px solid ${p.border}` }}>
            <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
              <div className="grid grid-cols-2">
                {groupFacts.map((fact, idx) => (
                  <div
                    key={fact.label}
                    className="px-6 py-5"
                    style={
                      idx < groupFacts.length - 1
                        ? { borderRight: `1px solid ${p.border}` }
                        : undefined
                    }
                  >
                    <p
                      className="text-xs uppercase tracking-widest opacity-50"
                      style={{ color: p.bodyText }}
                    >
                      {fact.label}
                    </p>
                    <p
                      className="mt-1 text-base font-semibold opacity-80"
                      style={{ color: p.bodyText }}
                    >
                      {fact.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── STORY + PRICING / THRESHOLD ── */}
      <div className="mx-auto max-w-7xl px-4 py-16 md:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2">
          {/* Left: story */}
          <div className="grid gap-8">
            <div className="grid gap-4">
              <h2
                className={`${alfa_slab_one.className} text-3xl`}
                style={{ color: p.bodyText }}
              >
                {landing.story.whatItIs.title}
              </h2>
              <p
                className="leading-8"
                style={{ color: p.bodyText, opacity: 0.7 }}
              >
                {landing.story.whatItIs.body}
              </p>
            </div>

            <Separator style={{ backgroundColor: p.divider }} />

            <div className="grid gap-3">
              {landing.story.whyJoinNow.map((reason) => (
                <div key={reason} className="flex gap-3">
                  <div
                    className="mt-2.5 h-1.5 w-1.5 flex-shrink-0"
                    style={{ backgroundColor: landing.accentColor }}
                  />
                  <p
                    className="text-sm leading-7"
                    style={{ color: p.bodyText, opacity: 0.8 }}
                  >
                    {reason}
                  </p>
                </div>
              ))}
            </div>

            {landing.experienceBullets.length > 0 && (
              <>
                <Separator style={{ backgroundColor: p.divider }} />
                <div className="grid gap-3">
                  {landing.experienceBullets.map((bullet) => (
                    <div
                      key={bullet}
                      className="border-l-2 pl-4"
                      style={{ borderColor: landing.accentColor }}
                    >
                      <p
                        className="text-sm leading-7"
                        style={{ color: p.bodyText, opacity: 0.7 }}
                      >
                        {bullet}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}

            <p
              className="text-sm leading-7 lg:hidden"
              style={{ color: p.bodyText, opacity: 0.5 }}
            >
              {landing.elevatorPitch}
            </p>
          </div>

          {/* Right: threshold + pricing */}
          <div className="grid gap-6">
            {/* Threshold */}
            <div
              className="p-6"
              style={{
                border: `1px solid ${p.border}`,
                backgroundColor: p.cardBg,
              }}
            >
              <p className="font-semibold" style={{ color: p.bodyText }}>
                {landing.threshold.headline}
              </p>
              <p
                className="mt-2 text-sm leading-7"
                style={{ color: p.bodyText, opacity: 0.6 }}
              >
                {landing.threshold.detail}
              </p>
              <div className="mt-5 grid gap-2">
                <div
                  className="flex justify-between text-xs"
                  style={{ color: p.bodyText, opacity: 0.5 }}
                >
                  <span>{landing.threshold.joinedEntries} cabin requests</span>
                  <span>
                    {landing.threshold.requiredCabins} needed to launch
                  </span>
                </div>
                <div
                  className="h-1.5"
                  style={{ backgroundColor: p.progressTrack }}
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${landing.threshold.percentOfThreshold}%`,
                      backgroundColor: landing.accentColor,
                    }}
                  />
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div
                  className="p-4"
                  style={{ border: `1px solid ${p.border}` }}
                >
                  <p
                    className="text-xs"
                    style={{ color: p.bodyText, opacity: 0.5 }}
                  >
                    Guests represented
                  </p>
                  <p
                    className="mt-1 text-2xl font-semibold"
                    style={{ color: landing.accentColor }}
                  >
                    {landing.threshold.joinedPassengers}
                  </p>
                </div>
                <div
                  className="p-4"
                  style={{ border: `1px solid ${p.border}` }}
                >
                  <p
                    className="text-xs"
                    style={{ color: p.bodyText, opacity: 0.5 }}
                  >
                    Group progress
                  </p>
                  <p
                    className="mt-1 text-2xl font-semibold"
                    style={{ color: landing.accentColor }}
                  >
                    {landing.threshold.percentOfThreshold}%
                  </p>
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div
              className="p-6"
              style={{
                border: `1px solid ${p.border}`,
                backgroundColor: p.cardBg,
              }}
            >
              <p
                className="text-xs uppercase tracking-widest"
                style={{ color: landing.accentColor }}
              >
                {landing.pricing.sourceLabel}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-6">
                <div>
                  <p
                    className="text-xs"
                    style={{ color: p.bodyText, opacity: 0.5 }}
                  >
                    Starting from
                  </p>
                  <p
                    className="mt-1 text-3xl font-semibold"
                    style={{ color: landing.accentColor }}
                  >
                    {landing.pricing.startingPriceLabel}
                  </p>
                </div>
                <div
                  className="pl-4"
                  style={{ borderLeft: `1px solid ${p.border}` }}
                >
                  <p
                    className="text-sm leading-7"
                    style={{ color: p.bodyText, opacity: 0.6 }}
                  >
                    {landing.pricing.detail}
                  </p>
                </div>
              </div>
              {getGalleryImage(0) && (
                <div className="relative mt-5 h-28 overflow-hidden">
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{
                      backgroundImage: `url(${getGalleryImage(0)?.url})`,
                      filter: "saturate(0.65)",
                    }}
                  />
                  <div
                    className="absolute inset-0"
                    style={{ backgroundColor: p.imageOverlay }}
                  />
                </div>
              )}
              <p
                className="mt-4 text-xs"
                style={{ color: p.bodyText, opacity: 0.4 }}
              >
                No payment is taken on this page.
              </p>
            </div>

            {/* Trust */}
            <div
              className="grid gap-3 p-5"
              style={{ border: `1px solid ${p.border}` }}
            >
              {landing.trustBullets.map((bullet) => (
                <p
                  key={bullet}
                  className="text-xs leading-6"
                  style={{ color: p.bodyText, opacity: 0.5 }}
                >
                  {bullet}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── GALLERY STRIP ── */}
      {galleryImages.length > 1 && (
        <div
          style={{
            borderTop: `1px solid ${p.border}`,
            borderBottom: `1px solid ${p.border}`,
          }}
        >
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {galleryImages.slice(0, 6).map((img, idx) => (
              <div key={idx} className="relative aspect-square overflow-hidden">
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${img.url})` }}
                />
                <div
                  className="absolute inset-0"
                  style={{ backgroundColor: p.imageOverlay }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DEEP CONTENT TABS ── */}
      <div className="mx-auto max-w-7xl px-4 py-16 md:px-6 lg:px-8">
        <Tabs defaultValue="expect" className="grid gap-8">
          <TabsList
            className="grid h-auto grid-cols-3 gap-0 rounded-none bg-transparent p-0"
            style={{ border: `1px solid ${p.border}` }}
          >
            <TabsTrigger
              value="expect"
              className="h-11 rounded-none data-[state=active]:shadow-none"
              style={{
                borderRight: `1px solid ${p.border}`,
                color: p.bodyText,
              }}
            >
              What To Expect
            </TabsTrigger>
            <TabsTrigger
              value="how-it-works"
              className="h-11 rounded-none data-[state=active]:shadow-none"
              style={{
                borderRight: `1px solid ${p.border}`,
                color: p.bodyText,
              }}
            >
              How It Works
            </TabsTrigger>
            <TabsTrigger
              value="faq"
              className="h-11 rounded-none data-[state=active]:shadow-none"
              style={{ color: p.bodyText }}
            >
              FAQ
            </TabsTrigger>
          </TabsList>

          <TabsContent value="expect" className="grid gap-5 lg:grid-cols-2">
            <div className="grid gap-4">
              {landing.story.whatToExpect.map((item, idx) => (
                <div
                  key={item}
                  className="flex gap-4 p-4"
                  style={{ border: `1px solid ${p.border}` }}
                >
                  <span
                    className="mt-0.5 text-xl font-semibold tabular-nums leading-none"
                    style={{ color: landing.accentColor, opacity: 0.45 }}
                  >
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <p
                    className="text-sm leading-7"
                    style={{ color: p.bodyText, opacity: 0.8 }}
                  >
                    {item}
                  </p>
                </div>
              ))}
            </div>
            <div className="grid gap-4">
              {getGalleryImage(2) && (
                <div className="relative h-44 overflow-hidden">
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{
                      backgroundImage: `url(${getGalleryImage(2)?.url})`,
                    }}
                  />
                </div>
              )}
              {landing.experienceBullets.map((bullet) => (
                <div
                  key={bullet}
                  className="p-4"
                  style={{
                    border: `1px solid ${p.border}`,
                    backgroundColor: p.cardBg,
                  }}
                >
                  <p
                    className="text-sm leading-7"
                    style={{ color: p.bodyText, opacity: 0.7 }}
                  >
                    {bullet}
                  </p>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent
            value="how-it-works"
            className="grid gap-5 lg:grid-cols-2"
          >
            <div className="grid gap-4">
              {landing.story.howItWorks.map((step) => (
                <div
                  key={step.title}
                  className="p-5"
                  style={{ border: `1px solid ${p.border}` }}
                >
                  <p className="font-semibold" style={{ color: p.bodyText }}>
                    {step.title}
                  </p>
                  <p
                    className="mt-2 text-sm leading-7"
                    style={{ color: p.bodyText, opacity: 0.6 }}
                  >
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
            <div className="grid gap-4">
              {getGalleryImage(3) && (
                <div className="relative h-44 overflow-hidden">
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{
                      backgroundImage: `url(${getGalleryImage(3)?.url})`,
                    }}
                  />
                </div>
              )}
              {landing.trustBullets.map((bullet) => (
                <div
                  key={bullet}
                  className="p-4"
                  style={{
                    border: `1px solid ${p.border}`,
                    backgroundColor: p.cardBg,
                  }}
                >
                  <p
                    className="text-sm leading-7"
                    style={{ color: p.bodyText, opacity: 0.7 }}
                  >
                    {bullet}
                  </p>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="faq" className="grid gap-4 lg:grid-cols-2">
            {landing.faq.map((item) => (
              <div
                key={item.question}
                className="p-5"
                style={{ border: `1px solid ${p.border}` }}
              >
                <p className="font-semibold" style={{ color: p.bodyText }}>
                  {item.question}
                </p>
                <p
                  className="mt-2 text-sm leading-7"
                  style={{ color: p.bodyText, opacity: 0.6 }}
                >
                  {item.answer}
                </p>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── FORM ── */}
      <section
        id="save-your-place"
        style={{
          borderTop: `1px solid ${p.border}`,
          backgroundColor: p.cardBg,
        }}
      >
        <div className="mx-auto max-w-7xl px-4 py-16 md:px-6 lg:px-8">
          <CampaignWaitlistForm
            campaignName={landing.title}
            endpoint={landing.form.endpoint}
            enabled={landing.form.enabled}
            defaultMode={landing.form.defaultMode}
          />
        </div>
      </section>
    </div>
  );
}
