/**
 * Deterministic gateway stub for the deals-system proof scripts.
 *
 * The AI generators (`ai-generators.ts`) normally call the LLM gateway. These
 * proof scripts run via `tsx` with no mocking framework, so we inject a stub via
 * `__setStructuredObjectGeneratorForTests`. The stub builds a stage-appropriate
 * object (detected by validating candidates against the caller's Zod schema) so
 * that fact-based assertions still hold — and stamps a fixed model id + latency.
 *
 * It intentionally embeds analyst-voice-free, fact-derived text so the pitch
 * voice validator passes and copy carries the pitch's selling facts. To exercise
 * red-flag detection, a promo claim containing "guaranteed lowest price" flows
 * through `buildOfferLines` unchanged (the stub does not touch offer lines).
 */

import type { z } from "zod/v3";

import type { generateStructuredObject } from "../lib/ai/llm-gateway";
import {
  __setCopywriterStructuredObjectGeneratorForTests,
  __setDiscoveryStructuredObjectGeneratorForTests,
  __setFunnelSynthesisStructuredObjectGeneratorForTests,
  __setManifestStructuredObjectGeneratorForTests,
  __setNicheReformerStructuredObjectGeneratorForTests,
  __setStructuredObjectGeneratorForTests,
} from "../lib/cb/deals-system";

type Args = Parameters<typeof generateStructuredObject>[0];

const STUB_MODEL = "claude-opus-4-6";

function pick<T>(value: T): T {
  return value;
}

/** Candidate objects, one per stage. The stub returns the first that parses. */
function candidates(prompt: string): unknown[] {
  // Pull a few tokens out of the prompt so fact assertions can pass.
  const shipMatch = prompt.match(/Ship: ([^\n]+)/);
  const ship = shipMatch ? shipMatch[1].trim() : "the ship";
  const nightsMatch = prompt.match(/Nights: (\d+)/);
  const nights = nightsMatch ? nightsMatch[1] : "6";
  const portsMatch = prompt.match(/Ports of call: ([^\n]+)/);
  const firstPort = portsMatch ? portsMatch[1].split(",")[0].trim() : "the islands";

  const tripSummary = `${nights} nights aboard ${ship}, with a stop at ${firstPort}.`;

  const pitch = {
    tripSummary,
    audienceStatement: `For travelers who want a sailing chosen for them, not a generic cruise sale.`,
    primaryHook: `${nights} nights aboard ${ship} built around a specific reason to go, not just a price.`,
    curatedReason: `Picked for ${firstPort} and ${ship}, this sailing is matched to a particular traveler.`,
    sellingFacts: [
      `${nights} nights aboard ${ship}.`,
      `Calls at ${firstPort}.`,
      `A sailing chosen for the experience, not a discount.`,
    ],
    researchRationale: `Internal: chosen because the angle research favored ${firstPort} and ${ship}.`,
  };

  const research = {
    shipAppeal: [`${ship} suits this itinerary.`],
    amenityHighlights: [`On-board experiences aboard ${ship}.`],
    destinationHooks: [`${firstPort} is on the itinerary.`],
    itineraryPacingNotes: [`${nights} nights of pacing.`],
    nicheAudienceAngles: [`Travelers drawn to ${firstPort}.`],
    trendMatches: ["experience-first travel"],
    competitorBlindSpots: ["Most listings lead with price; this leads with the reason to go."],
    recommendedPrimaryAngle: {
      title: `A curated ${firstPort} sailing on ${ship}`,
      rationale: `Selected around a specific traveler, not a broad promotion.`,
      publicCopyHook: `${nights} nights to ${firstPort} on ${ship} — a sailing worth the trip.`,
      whyThisFeelsExclusive: `Chosen for a specific traveler, not broadcast to everyone.`,
    },
    rejectedAngles: [{ title: "Generic cruise sale", reason: "Price is a supporting detail." }],
    factualGuardrails: ["Verify amenities before public copy."],
  };

  const targeting = {
    primaryAudience: {
      label: `${firstPort} experience travelers`,
      description: `Travelers who connect with ${firstPort} and the ship experience.`,
      whyThisCruiseFits: `The itinerary expresses their interest directly.`,
      emotionalDrivers: ["a trip that feels chosen for them"],
      likelyObjections: ["They may want exact pricing first."],
    },
    secondaryAudiences: [
      {
        label: "Premium convenience travelers",
        description: "People who value a low-friction packaged trip.",
        whyThisCruiseFits: "Transport, lodging, and amenities in one booking.",
        targetingNotes: [firstPort],
      },
    ],
    nicheKeywords: {
      lifestyle: ["slow travel"],
      destination: [firstPort],
      shipExperience: [ship],
      amenities: ["dining"],
      eventsAndSeasonality: [`${nights} night cruise`],
      trendSignals: ["experience-first travel"],
      exclusionKeywords: ["free cruise", "cruise job"],
    },
    channelTargeting: {
      meta: {
        interestClusters: [firstPort],
        behaviorSignals: ["saves travel inspiration"],
        creativeHooks: [`${firstPort} on ${ship}`],
        audienceWarnings: ["Avoid broad cruise-interest targeting as the primary audience."],
      },
      google: {
        searchThemes: [`${firstPort} cruise`],
        keywordIdeas: [firstPort, ship],
        negativeKeywords: ["free cruise", "cruise job"],
        landingPageIntentNotes: ["Lead with the angle before price."],
      },
      tiktok: {
        creatorAngles: [`${firstPort} visual inspiration`],
        trendHooks: ["experience-first travel"],
        shortVideoConcepts: [`POV: your ${firstPort} sailing`],
      },
      email: {
        segmentIdeas: [`${firstPort} interested travelers`],
        subjectLineAngles: [`A ${firstPort} cruise with a reason to go`],
        personalizationNotes: ["Reference the interest before the cruise line."],
      },
    },
    researchSummary: {
      primaryInsight: `${nights} nights to ${firstPort} on ${ship}.`,
      whyNow: "Availability, price, and season line up.",
      competitorBlindSpot: "Most market the sailing generically.",
      positioningStatement: "A sailing chosen for a specific traveler.",
    },
    confidence: {
      score: 82,
      strengths: ["Audience is specific."],
      risks: ["Confirm amenities."],
      needsHumanReview: ["Confirm link health before launch."],
    },
  };

  const copy = {
    headlineOptions: [
      `${nights} nights aboard ${ship} built around a specific reason to go, not just a price.`,
      `Exclusive ${firstPort} escape on ${ship}`,
      `Your ${firstPort} sailing, chosen for you`,
    ],
    shortTileCopy: `${nights}-night ${firstPort} • ${ship}`,
    heroCopy: `${tripSummary} A sailing chosen for a specific traveler.`,
    whyThisTrip: [
      `${nights} nights aboard ${ship}.`,
      `Calls at ${firstPort}.`,
      `A sailing chosen for the experience, not a discount.`,
    ],
  };

  const ad = {
    campaignThesis: `Sell ${firstPort} on ${ship} to a specific audience.`,
    channels: [
      { channel: "meta", primaryAngle: `${firstPort} on ${ship}`, hooks: ["niche hook"], proofPoints: [`${nights} nights on ${ship}.`], notes: ["Avoid broad cruise targeting."] },
      { channel: "google", primaryAngle: `${firstPort} cruise`, hooks: [`${firstPort} cruise`], proofPoints: [`${nights} nights on ${ship}.`], notes: ["Lead with angle."] },
      { channel: "tiktok", primaryAngle: `${firstPort} inspiration`, hooks: ["trend"], proofPoints: [`${nights} nights.`], notes: ["Show as a solution to a niche interest."] },
      { channel: "email", primaryAngle: `A ${firstPort} cruise`, hooks: ["subject"], proofPoints: [`${nights} nights.`], notes: ["Reference the interest first."] },
    ],
    nicheKeywords: [firstPort],
    trendKeywords: ["experience-first travel"],
    negativeKeywords: ["free cruise", "cruise job"],
    creativeHypotheses: ["A niche hook beats a generic price ad."],
  };

  const media = {
    visualDirection: [`${firstPort} scenery and ${ship} moments`],
    imageSlots: [
      { slot: "hero", purpose: "Hero", visualConceptPrompt: `${firstPort} hero scene, photo-real, no text.`, requiredSourceAssets: [`${ship} exterior`] },
      { slot: "ship_experience", purpose: "On-ship", visualConceptPrompt: `${ship} deck moment.`, requiredSourceAssets: [`${ship} deck`] },
      { slot: "destination_detail", purpose: "Port", visualConceptPrompt: `${firstPort} signature scene.`, requiredSourceAssets: [`${firstPort} reference`] },
    ],
    shortVideoConcepts: [
      { concept: `Why this ${firstPort} sailing fits`, hook: `${firstPort} on ${ship}`, shots: [`${firstPort} establishing shot`, "CTA card"] },
    ],
    requiredSourceAssets: [`${ship} imagery`, `${firstPort} imagery`],
  };

  // Discovery: a batch of Sailing Angle Profiles (no group / generic-travel language).
  const discoveryAngles = {
    angles: [
      {
        isolatedNiche: "The Cyanotype Botanical Alchemist",
        sailingAngleTitle: "Prints of Changing Latitudes",
        theCorePitch:
          "Stop forcing your creative practice into the familiar flora of home. The shifting latitude alters your UV exposure daily while each port delivers a fresh canvas of foraged botanicals to rinse and reveal from the sun decks.",
        visualAnchor:
          "A first-person shot of hands unclipping a plexiglass frame on a sun-drenched deck, a brilliant Prussian blue cyanotype revealing a white fern silhouette.",
        targetAudienceDescriptor:
          "Solo creators, artistic couples, or mindful parents who practice alternative photography and botanical art.",
        relevantKeywords: [
          "cyanotype printing",
          "alternative process photography",
          "botanical art",
          "Prussian blue prints",
          "sun printing",
          "analog art processing",
        ],
        destinationAndTimeOfYearHints:
          "Tropical or high-sun regions (Caribbean, Mediterranean) during high-UV seasons (late spring through early autumn).",
        onboardAssetRequirements:
          "Vessels with expansive open-air top decks, wind-shielded alcoves, ocean-facing balconies, and fresh-water rinsing stations.",
      },
    ],
  };

  // Trip manifest: references a known promo id (cbpromo-test) plus a deliberately
  // hallucinated one (cbpromo-FAKE) the generator must drop. The cruise line/ship/
  // sail date/nights/ports come from angle.groundedCandidate, not this object —
  // the AI only writes framing + promo correlation.
  const manifest = {
    itineraryName: `${firstPort} alternative-process sailing`,
    destination: firstPort,
    shipClassHint: "Radiance class",
    appliedPromos: [
      {
        promoRecordId: "cbpromo-test",
        status: "likely_applicable",
        matchedOn: ["cruise line", "sail window"],
        assumptions: ["select cabins"],
        warnings: [],
      },
      {
        promoRecordId: "cbpromo-FAKE",
        status: "likely_applicable",
        matchedOn: ["nothing real"],
        assumptions: [],
        warnings: [],
      },
    ],
    promoStrategy: "Lead with onboard credit framed as deck-time flexibility for the practice.",
    manifestReasoning: "Radiance-class panoramic decks and high-UV itinerary fulfil the angle's asset needs.",
  };

  // Ad copy: two variants. Primary references a known promo (cbpromo-test) + an
  // upsell with a hallucinated id (cbpromo-FAKE) the generator must remap to "none".
  // Clean of banned vocabulary so the voice check passes.
  const adCopy = {
    campaignName: "TTRPG_Transatlantic_Celebrity_2026",
    targetAudienceTag: "Solo Journaling Tabletop Roleplayers",
    primaryPromoApplied: "cbpromo-test",
    variants: [
      {
        promoApplied: "cbpromo-test",
        variantLabel: "Primary retail play",
        headline: "14 Nights. Zero Interruptions. Write the Wake.",
        bodyCopy:
          "Your campaign stalls because the household keeps interrupting you mid-sentence. Step into an Infinite Veranda stateroom and turn the balcony into a private writing carrel for unbroken sea days.",
        pricingDisclaimers:
          "Select sailings and stateroom categories apply. Savings verified upon live portal lookup.",
        callToAction: "Claim Your 14 Days of Cognitive Silence",
        adPlatformTargetingHooks: {
          demographicTargeting: "Aged 25-45, knowledge-work or creative professions.",
          interestKeywords: ["solo rpg journaling", "polyhedral dice set", "indie TTRPG zine"],
        },
      },
      {
        promoApplied: "cbpromo-FAKE",
        variantLabel: "Aspirational upsell",
        headline: "The Ocean-Liner Library, Entirely to Yourself.",
        bodyCopy:
          "Some stories demand complete cognitive silence. Reframe the repositioning route into a masterclass of analog friction inside an all-suite sanctuary.",
        pricingDisclaimers: "Select autumn/winter windows apply. Suite credit verified upon lookup.",
        callToAction: "Inhabit Your Ocean Sanctuary",
        adPlatformTargetingHooks: {
          demographicTargeting: "Senior knowledge workers, high-tier hobby spenders.",
          interestKeywords: ["fountain pen", "leather journal", "cozy solo RPG"],
        },
      },
    ],
  };

  // Funnel synthesis: broad landing page (jargon-free segment paragraphs) + a
  // 4-card hyper-niche carousel. Card 2's headline is deliberately >40 chars so the
  // length validator has something to flag.
  const funnel = {
    heroHeadline: "Fourteen Unhurried Nights Across the Atlantic",
    heroSubhead: "An upscale repositioning crossing built for rest, ocean views, and quiet.",
    segments: [
      {
        segment: "cabins",
        heading: "The Cabins",
        body: "Your Infinite Veranda stateroom is an ocean-facing sanctuary where indoor comfort meets open-air sea views. Premium bedding and quiet climate control make it a private retreat.",
      },
      {
        segment: "lounges",
        heading: "The Lounges",
        body: "Sophisticated, low-traffic lounges offer plush seating and quiet alcoves. Settle in with a book in the sun-drenched library, far from any high-decibel distraction.",
      },
      {
        segment: "atrium",
        heading: "The Atrium",
        body: "The soaring multi-deck atrium is lined with floor-to-ceiling windows that flood the space with light. A serene backdrop for a morning espresso or an evening cocktail.",
      },
      {
        segment: "dining",
        heading: "The Dining Rooms",
        body: "Savor unhurried meals across multiple dining venues with rotating menus and an award-winning wine list. Impeccable service that respects your personal pace.",
      },
      {
        segment: "excursions",
        heading: "The Excursions",
        body: "Step ashore in atmospheric ports like Ponta Delgada and Funchal. Wander cobblestone streets and centuries-old architecture on an itinerary made for discovery, not crowds.",
      },
    ],
    carouselCards: [
      {
        headline: "Stuck on Prompt 34?",
        primaryText:
          "Your Thousand Year Old Vampire campaign didn't stall because you lost the thread. Land life won't stop interrupting you.",
      },
      {
        headline: "Eight Unbroken Sea Days Await Your Oracle and Dice",
        primaryText: "No commutes. No logistics. Just your balcony as a private writing carrel.",
      },
      {
        headline: "Patronage for Your Pages",
        primaryText: "Book the Summer Sale for onboard credit — morning espressos and golden-hour wine on deck.",
      },
      {
        headline: "14 Nights. Zero Interruptions.",
        primaryText: "A late-autumn transatlantic crossing is a socially sanctioned disappearance. Lock balcony pricing before July 27.",
      },
    ],
  };

  // Niche re-former (Step 1B): given a REAL selected cruise + research, claims a
  // high-conviction niche fit and re-forms an angle whose destination/onboard
  // fields describe the real sailing. fitConfidence clears NICHE_FIT_THRESHOLD.
  const reform = {
    nicheFits: true,
    fitConfidence: 0.88,
    fitReasoning: `This ${nights}-night sailing aboard ${ship} with few ports is the ideal venue for a sea-day-dependent practice.`,
    isolatedNiche: "The Solo Journaling Tabletop Roleplayer",
    angle: {
      sailingAngleTitle: `Write the Wake aboard ${ship}`,
      theCorePitch: `Your campaign stalls because land life keeps interrupting you mid-sentence. ${nights} nights of consecutive sea days aboard ${ship} turn your balcony into an uninterrupted writing carrel.`,
      visualAnchor: `A worn journal open on a teak balcony table at golden hour aboard ${ship}, dice resting on the page.`,
      targetAudienceDescriptor:
        "Introverted solo-RPG writers and analog gamers, 25-45, in knowledge-work professions.",
      relevantKeywords: [
        "solo rpg journaling",
        "thousand year old vampire",
        "polyhedral dice set",
        "indie ttrpg zine",
        "analog journaling",
        "sea day writing",
      ],
      destinationAndTimeOfYearHints: `A ${nights}-night itinerary calling at ${firstPort}, scheduled for high sea-day density.`,
      onboardAssetRequirements: `${ship} with a high balcony ratio, a genuinely quiet library, and low-traffic lounges for unbroken writing time.`,
    },
  };

  // Inventory-aware fit-select: picks a package by id and explains the fit.
  const fitSelect = {
    chosenPackageId: "1500001",
    fitRationale: "Best date proximity and ship-class match for the angle's onboard asset needs.",
    runnerUpPackageIds: ["1500002"],
    needsReframe: false,
  };

  return [pitch, research, targeting, copy, ad, media, discoveryAngles, manifest, adCopy, funnel, reform, fitSelect].map(pick);
}

/** Install the stub. Call once at the top of a proof script. */
export function installDealsAiStub(): void {
  const stub = async (options: Args) => {
    const schema = options.schema as z.ZodTypeAny;
    for (const candidate of candidates(options.prompt)) {
      const result = schema.safeParse(candidate);
      if (result.success) {
        return { object: result.data, modelId: STUB_MODEL, warnings: [] };
      }
    }
    throw new Error(
      "[deals-ai-stub] No candidate object matched the requested schema. Update tests/deals-ai-stub.ts."
    );
  };
  __setStructuredObjectGeneratorForTests(stub);
  __setDiscoveryStructuredObjectGeneratorForTests(stub);
  __setManifestStructuredObjectGeneratorForTests(stub);
  __setCopywriterStructuredObjectGeneratorForTests(stub);
  __setFunnelSynthesisStructuredObjectGeneratorForTests(stub);
  __setNicheReformerStructuredObjectGeneratorForTests(stub);
}
