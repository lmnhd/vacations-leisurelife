import {
  getCuratedDeal,
  getDealTripManifest,
  getPromoRecordsByIds,
  upsertCuratedDealRecord,
  upsertDealTripManifestRecord,
  upsertPromoRecordEntry,
} from "../../lib/cb/deals-system/deals-dynamo-store";
import {
  loadDealAdCopyCache,
  saveDealAdCopyCache,
} from "../../lib/cb/deals-system/deal-ad-copy-cache";
import {
  loadDealDiscoveryIdeasCache,
  saveDealDiscoveryIdeasCache,
} from "../../lib/cb/deals-system/deal-discovery-cache";
import {
  loadDealUnifiedManifestsCache,
  saveDealUnifiedManifestsCache,
} from "../../lib/cb/deals-system/deal-unified-manifest-cache";
import type { DealAdCopy } from "../../lib/cb/deals-system/deal-ad-copy-types";

const DEAL_ID = "deal-rcl-allure-perfect-day-family-1576786";
const MANIFEST_ID = "manifest-workbench-rcl-allure-perfect-day-family-1576786";
const UNIFIED_MANIFEST_ID = "unified-manifest-workbench-rcl-allure-perfect-day-family-1576786";
const ANGLE_ID = "angle-workbench-rcl-allure-perfect-day-family-1576786";

const PROMO_IDS = [
  "cbtodays-royal-caribbean-bonus-free-dining-2026-07-31",
  "cbtodays-royal-caribbean-july-specials-2026-07-31",
  "cbtodays-royal-caribbean-early-booking-obc-2026-12-31",
];

function includesAllureCopy(adCopy: DealAdCopy): boolean {
  return (
    adCopy.sourceUnifiedManifestId === UNIFIED_MANIFEST_ID ||
    adCopy.id.includes("allure-of-the-seas") ||
    adCopy.campaignName.includes("Allure of the Seas")
  );
}

function cleanedPromoSummary(promoId: string): string {
  if (promoId.includes("bonus-free-dining")) {
    return "Eligibility for the Royal Caribbean bonus specialty dining offer can be reviewed for qualifying balcony or suite bookings on this sailing.";
  }
  if (promoId.includes("july-specials")) {
    return "Current Royal Caribbean July special eligibility requires live rate and sailing review before any savings are quoted.";
  }
  return "Royal Caribbean early-booking onboard credit eligibility requires live rate and sailing review before any credit amount is quoted.";
}

function cleanedQualifiedClaim(promoId: string): string {
  if (promoId.includes("bonus-free-dining")) {
    return "Bonus dining eligibility must be confirmed for the selected rate and stateroom category before booking.";
  }
  if (promoId.includes("july-specials")) {
    return "Royal Caribbean July special eligibility must be confirmed against live rate and sailing rules before booking.";
  }
  return "Early-booking onboard credit eligibility and amount must be confirmed against live rate and sailing rules before booking.";
}

function patchAdCopyCache(): { patched: number } {
  const cache = loadDealAdCopyCache();
  let patched = 0;
  const next = {
    ...cache,
    generatedAtIso: new Date().toISOString(),
    adCopies: cache.adCopies.map((adCopy) => {
      if (!includesAllureCopy(adCopy)) return adCopy;
      patched += 1;
      const patchedAdCopy: DealAdCopy = {
        ...adCopy,
        campaignName: "February Family Escape - Allure of the Seas, Perfect Day Cococay & Bonus Dining Eligibility",
        targetAudienceTag:
          "US families and multigenerational travelers booking a February 2027 Caribbean cruise",
        variants: [
          {
            promoApplied: "cbtodays-royal-caribbean-bonus-free-dining-2026-07-31",
            variantLabel: "Primary - Balcony Value + Bonus Dining Eligibility",
            headline:
              "Allure of the Seas, February 8 - Lock In the Balcony Value Before the July 31 Dining Window Closes",
            bodyCopy:
              "February family trips get crowded fast: school calendars, winter sports, grandparents' PTO, and the usual scramble for cabins that actually fit everyone.\n\nAllure of the Seas sails from Miami on February 8, 2027 for a 6-night Western Caribbean & Perfect Day run: Labadee, Falmouth, and a full day at Perfect Day Cococay. It is a simple family pitch: a major Royal Caribbean ship, two warm-weather beach-destination days, and enough onboard variety for kids, parents, and grandparents to have different kinds of vacation on the same ship.\n\nThe balcony is the value play. Current Odysseus pricing has balcony close enough to inside pricing that families should compare the upgrade before settling for the lowest cabin. A balcony gives parents a private landing place after the kids crash, a morning view coming into port, and a better home base on a ship built for big days.\n\nCruise Brothers also lists a Royal Caribbean bonus specialty dining offer for eligible balcony or suite bookings on qualifying 6-night or longer sailings. That is not a guaranteed perk until the selected rate and cabin are verified, but it gives families a real reason to handle the eligibility check before the July 31 window closes.\n\nSix nights. Labadee. Jamaica. Perfect Day Cococay. A balcony-value sweet spot with a dining offer worth verifying before the deadline.",
            pricingDisclaimers:
              "Bonus specialty dining offer availability applies to select balcony and suite staterooms on eligible 6-night or longer Royal Caribbean Caribbean, Bermuda, Bahamas, and West Coast/Mexico sailings departing August 17, 2026 - April 30, 2027. Offer valid through 07/31/2026 or while supplies last. Exact rate, cabin category, sailing eligibility, dining form process, pricing, promotions, and stateroom availability must be confirmed at time of booking. This ad is not a guarantee of any specific price or promotion.",
            callToAction: "Check Bonus Dining Eligibility For This February 8 Sailing",
            adPlatformTargetingHooks: {
              demographicTargeting:
                "US adults 28-55, parents with children under 18, multigenerational family travel planners, household income $75K+",
              interestKeywords: [
                "family cruises",
                "Royal Caribbean",
                "Allure of the Seas",
                "Perfect Day Cococay",
                "winter Caribbean cruise",
                "February family vacation",
                "kids cruise vacation",
                "cruise dining package",
                "multigenerational vacation",
                "Caribbean balcony cruise",
                "school break travel",
                "family beach vacation",
                "early booking cruise deals",
              ],
            },
            voiceWarnings: [],
          },
          {
            promoApplied: "cbtodays-royal-caribbean-early-booking-obc-2026-12-31",
            variantLabel: "Aspirational Upsell - Suite + Early-Booking Credit Eligibility",
            headline:
              "Suite-Level February On Allure Of The Seas - Early Booking May Add Onboard Credit",
            bodyCopy:
              "If the trip includes grandparents, older kids, or a family that simply needs more room, the suite category turns the February 8 Allure of the Seas sailing into a more comfortable base for a six-night Caribbean week.\n\nThe itinerary is built for families: Miami, Labadee, Falmouth, Perfect Day Cococay, and enough sea time to actually use the ship. Suite space can matter on this kind of trip: easier mornings, less cabin traffic, and a better place to reset between pool decks, shows, beaches, and dinner.\n\nRoyal Caribbean also has an early-booking onboard credit program for eligible bookings. The exact amount and eligibility are not automatic, and they depend on the selected rate and stateroom category. But for families already considering a premium cabin, early booking gives the credit eligibility review a practical place in the decision.\n\nThis is the premium version of the same family play: get the February sailing on the calendar, compare suite availability before inventory tightens, and verify whether early-booking credit or bonus dining eligibility applies before finalizing.",
            pricingDisclaimers:
              "Early-booking onboard credit availability, amount, and eligibility must be confirmed at time of booking for this specific sailing and stateroom category. Bonus specialty dining offer applies to select balcony and suite staterooms on eligible sailings and is subject to Cruise Brothers operator verification and rate eligibility. All pricing, promotions, stateroom availability, and onboard credit amounts are subject to change and must be confirmed with a live availability check. This ad is not a guarantee of any specific price, onboard credit amount, or promotion.",
            callToAction: "Check Suite Availability And Early-Booking Credit Eligibility",
            adPlatformTargetingHooks: {
              demographicTargeting:
                "US adults 35-60, parents and grandparents, household income $120K+, multigenerational family travel planners, suite and premium cabin shoppers",
              interestKeywords: [
                "Royal Caribbean suite",
                "Allure of the Seas suite",
                "multigenerational cruise",
                "Perfect Day Cococay cabana",
                "family cruise suite",
                "winter Caribbean cruise",
                "February family vacation",
                "cruise onboard credit",
                "early booking cruise",
                "grandparent family travel",
                "Caribbean family resort cruise",
                "luxury family cruise",
              ],
            },
            voiceWarnings: [],
          },
        ],
        selectedVariantIndex: 0,
      };
      return {
        ...patchedAdCopy,
        aiTrace: adCopy.aiTrace
          ? {
              ...adCopy.aiTrace,
              promptSent:
                "Patched by operator request on 2026-07-03 to remove freeform agent-conversation framing from Allure family deal ad copy.",
              rawResponse: JSON.stringify({
                campaignName: patchedAdCopy.campaignName,
                targetAudienceTag: patchedAdCopy.targetAudienceTag,
                primaryPromoApplied: patchedAdCopy.primaryPromoApplied,
                variants: patchedAdCopy.variants,
              }),
            }
          : adCopy.aiTrace,
      };
    }),
  };
  saveDealAdCopyCache(next);
  return { patched };
}

function patchLocalUpstreamCaches(): { discoveryPatched: boolean; unifiedPatched: boolean } {
  const discovery = loadDealDiscoveryIdeasCache();
  let discoveryPatched = false;
  const patchedDiscovery = {
    ...discovery,
    generatedAtIso: new Date().toISOString(),
    ideas: discovery.ideas.map((idea) => {
      if (idea.id !== ANGLE_ID) return idea;
      discoveryPatched = true;
      return {
        ...idea,
        successLogic:
          "Families can understand this offer quickly: a real February sailing on Allure of the Seas, private-destination beach days, a balcony-value comparison, and a July eligibility deadline for the attached Royal Caribbean bonus dining offer.",
        sailingAngleProfile: {
          ...idea.sailingAngleProfile,
          theCorePitch:
            "Get next winter's big family cruise on the calendar now: Allure of the Seas, Labadee, Jamaica, and Perfect Day Cococay in one warm-weather week. The current balcony pricing creates a strong upgrade story while the Royal Caribbean bonus-offer window gives families a concrete eligibility deadline.",
        },
      };
    }),
  };
  saveDealDiscoveryIdeasCache(patchedDiscovery);

  const unified = loadDealUnifiedManifestsCache();
  let unifiedPatched = false;
  const patchedUnified = {
    ...unified,
    generatedAtIso: new Date().toISOString(),
    manifests: unified.manifests.map((manifest) => {
      if (manifest.id !== UNIFIED_MANIFEST_ID) return manifest;
      unifiedPatched = true;
      return {
        ...manifest,
        creativeBrief: {
          ...manifest.creativeBrief,
          successLogic:
            "Families can understand this offer quickly: a real February sailing on Allure of the Seas, private-destination beach days, a balcony-value comparison, and a July eligibility deadline for the attached Royal Caribbean bonus dining offer.",
          angle: {
            ...manifest.creativeBrief.angle,
            theCorePitch:
              "Get next winter's big family cruise on the calendar now: Allure of the Seas, Labadee, Jamaica, and Perfect Day Cococay in one warm-weather week. The current balcony pricing creates a strong upgrade story while the Royal Caribbean bonus-offer window gives families a concrete eligibility deadline.",
          },
        },
        inventoryManifest: {
          ...manifest.inventoryManifest,
          promoStrategy:
            "Lead with the Cruise Brothers Royal Caribbean bonus dining eligibility deadline for balcony or suite bookings. Keep all offer language specific and qualified; avoid vague agent-conversation CTAs.",
          promotionBriefs: manifest.inventoryManifest.promotionBriefs.map((promo) => ({
            ...promo,
            publicClaimsNeedsQualifier: [cleanedQualifiedClaim(promo.promoRecordId)],
            visitorFriendlySummary: cleanedPromoSummary(promo.promoRecordId),
            suggestedAngles: promo.suggestedAngles.map((angle) =>
              angle.toLowerCase().includes("ask")
                ? "Use the early-booking deadline as a clear eligibility-check CTA."
                : angle
            ),
          })),
        },
      };
    }),
  };
  saveDealUnifiedManifestsCache(patchedUnified);
  return { discoveryPatched, unifiedPatched };
}

async function patchDynamoRecords(): Promise<{ dealPatched: boolean; manifestPatched: boolean; promosPatched: number }> {
  const deal = await getCuratedDeal(DEAL_ID);
  let dealPatched = false;
  if (deal) {
    deal.campaignStrategy = deal.campaignStrategy
      ? {
          ...deal.campaignStrategy,
          campaignAngle:
            "Book next winter's big family cruise early: Allure of the Seas, Perfect Day Cococay, and a balcony-value sweet spot with Royal Caribbean bonus dining eligibility to verify before July 31.",
        }
      : deal.campaignStrategy;
    if (deal.pitchBrief) {
      deal.pitchBrief = {
        ...deal.pitchBrief,
        primaryHook:
          "Book seven months ahead and verify bonus dining eligibility before the July 31 window closes.",
      };
    }
    if (deal.copyPackage) {
      deal.copyPackage = {
        ...deal.copyPackage,
        heroCopy:
          "Get next winter's family trip on the calendar now: Allure of the Seas sails February 8, 2027 from Miami to Labadee, Falmouth, and Perfect Day Cococay. The current balcony pricing makes the upgrade worth comparing, and eligible Royal Caribbean bonus dining must be verified before the July 31 window closes.",
        offerLines: deal.copyPackage.offerLines.map((line) => ({
          ...line,
          text: line.promoRecordId ? cleanedQualifiedClaim(line.promoRecordId) : line.text,
          needsQualifier: true,
        })),
        ctaCopy: [
          {
            kind: "book_now",
            label: "View This Sailing",
            supportingText: "Open the Royal Caribbean package page to review live cabin availability.",
          },
          {
            kind: "request_callback",
            label: "Check Eligibility",
            supportingText: "Send a structured request for offer and cabin eligibility review.",
          },
          {
            kind: "email_link",
            label: "Send Me The Deal",
            supportingText: "Get the Allure sailing link and offer notes by email.",
          },
        ],
      };
    }
    if (deal.adStructure) {
      deal.adStructure = {
        ...deal.adStructure,
        channels: deal.adStructure.channels.map((channel) => ({
          ...channel,
          hooks: channel.hooks.map((hook) =>
            hook.toLowerCase().includes("ask")
              ? "Verify bonus dining eligibility before July 31"
              : hook
          ),
        })),
      };
    }
    deal.agentOnlyNotes = [
      ...(deal.agentOnlyNotes ?? []),
      "2026-07-03 copy patch: removed freeform agent-conversation framing from public ad and landing copy.",
    ];
    await upsertCuratedDealRecord(deal);
    dealPatched = true;
  }

  const manifest = await getDealTripManifest(MANIFEST_ID);
  let manifestPatched = false;
  if (manifest) {
    manifest.promoStrategy =
      "Lead with the Cruise Brothers Royal Caribbean bonus dining eligibility deadline for balcony or suite bookings. Keep all offer language specific and qualified; avoid vague agent-conversation CTAs.";
    await upsertDealTripManifestRecord(manifest);
    manifestPatched = true;
  }

  const promos = await getPromoRecordsByIds(PROMO_IDS);
  for (const promo of promos) {
    promo.marketingUse.publicClaimsNeedsQualifier = [cleanedQualifiedClaim(promo.id)];
    promo.marketingUse.visitorFriendlySummary = cleanedPromoSummary(promo.id);
    promo.marketingUse.suggestedAngles = promo.marketingUse.suggestedAngles.map((angle) =>
      angle.toLowerCase().includes("ask")
        ? "Use the early-booking deadline as a clear eligibility-check CTA."
        : angle
    );
    await upsertPromoRecordEntry(promo);
  }

  return { dealPatched, manifestPatched, promosPatched: promos.length };
}

async function main(): Promise<void> {
  const adCopy = patchAdCopyCache();
  const local = patchLocalUpstreamCaches();
  const dynamo = await patchDynamoRecords();
  console.log(JSON.stringify({ adCopy, local, dynamo }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
