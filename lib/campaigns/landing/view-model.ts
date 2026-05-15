import {
  getAestheticBrief,
  getCampaignBlueprint,
} from "@/lib/campaigns/campaign-store";
import { getMediaManifest } from "@/lib/campaigns/media/media-store";
import type {
  AssetRecord,
  CampaignAestheticBrief,
  CampaignEnergyMode,
  CampaignMediaManifest,
  VisualFlavor,
} from "@/lib/campaigns/schema";
import { formatDeparturePort } from "@/lib/campaigns/cruise-ports";
import {
  getPublicGroupCabinTarget,
  getPublicThresholdPercent,
} from "@/lib/campaigns/threshold-policy";
import type { Campaign, CampaignInventoryMode } from "@/lib/campaigns/types";
import {
  getCampaignWaitlistSummary,
  getVerifiedWaitlistSummary,
  type CampaignWaitlistSummary,
} from "@/lib/campaigns/waitlist-store";
import { extractNicheTokens } from "@/lib/campaigns/design-system/niche-tokens";
import type { VisualSystem } from "@/lib/campaigns/design-system/types";
import { selectPreferredAssetForContext } from "@/lib/campaigns/media/image-selection";

export interface LandingLoaderOptions {
  includeDraftPreview?: boolean;
  /**
   * Preview-only flavor override. Used by the audition toolbar on
   * /tests/campaign-landing/[slug] to render a campaign in any of the four
   * visual systems without writing to the campaign record.
   * The public route should not pass this — only `manualVisualFlavor` on the
   * campaign record persists across requests.
   */
  flavorOverride?: VisualFlavor;
}

export interface LandingImageAsset {
  url: string;
  alt: string;
}

export interface LandingStorySection {
  title: string;
  body: string;
}

export interface LandingFact {
  label: string;
  value: string;
}

export interface LandingCta {
  label: string;
  mode: "GROUP_WAIT" | "BOOK_NOW";
  description: string;
  disabled: boolean;
}

export interface LandingPathChoice {
  mode: "GROUP_WAIT" | "BOOK_NOW";
  label: string;
  description: string;
  highlighted: boolean;
}

export interface LandingFaqItem {
  question: string;
  answer: string;
}

export interface LandingInventoryDisclosure {
  mode: CampaignInventoryMode;
  /** True when the page should show a visible banner (mode !== GROUP_BLOCK_ACTIVE). */
  bannerVisible: boolean;
  /** Mode-specific short copy for the banner strip. Empty when bannerVisible is false. */
  bannerCopy: string;
  /** Always-visible note appended below the "How it works" steps. */
  processNote: string;
  /** Inventory-specific trust bullet to append to trustBullets. */
  trustBullet: string;
  /** Near-submit form acknowledgement copy. */
  formAcknowledgement: string;
}

export interface LandingCampaignNotice {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  modalTitle: string;
  modalBody: string;
  modalBullets: string[];
  dismissLabel: string;
}

export interface LandingDesignSystem {
  visualFlavor: VisualFlavor;
  system: VisualSystem;
  energyMode: CampaignEnergyMode;
  issueLabel: string;
  sectionLabels: string[];
  italicWord: string;
  accentHex: string;
  headline: string;
  subhead: string;
  quote: string;
  quoteCite: string;
  cta: string;
  chat: {
    sessionId: string;
    title: string;
    eyebrow: string;
    signedOutMessage: string;
    /**
     * Multi-turn seeded conversation shown to every new visitor before real messages exist.
     * Written in a short, human register — not marketing copy.
     * Seeded across the landing chat channels so each room has a small starter thread.
     */
    starterConversation: Array<{
      role: 'user' | 'assistant';
      content: string;
      channel?: 'main' | 'ideas' | 'logistics' | 'meetups';
    }>;
    endpoint: string;
  };
}

export interface CampaignLandingViewModel {
  slug: string;
  preview: boolean;
  state: Campaign["status"];
  stateLabel: string;
  title: string;
  heroSlogan: string;
  subSlogan: string;
  elevatorPitch: string;
  heroImage: LandingImageAsset | null;
  galleryImages: LandingImageAsset[];
  trustImages: LandingImageAsset[];
  accentColor: string;
  surfaceColor: string;
  textColor: string;
  designSystem: LandingDesignSystem;
  facts: LandingFact[];
  story: {
    whatItIs: LandingStorySection;
    whyJoinNow: string[];
    whatToExpect: string[];
    howItWorks: LandingStorySection[];
    /**
     * Guest-facing activity invitations for the idea board — written from the guest's POV
     * ("things you can do or suggest"), NOT camera-pose image cues.
     * Distinct from `whatToExpect`, which may include nicheEnhancedMoments (visual register).
     */
    guestInvitations: string[];
  };
  threshold: {
    requiredCabins: number;
    joinedEntries: number;
    joinedPassengers: number;
    convertedEntries: number;
    percentOfThreshold: number;
    headline: string;
    detail: string;
  };
  pricing: {
    startingPriceLabel: string;
    sourceLabel: string;
    detail: string;
  };
  experienceBullets: string[];
  trustBullets: string[];
  bookingPathChoices: LandingPathChoice[];
  faq: LandingFaqItem[];
  ctas: {
    primary: LandingCta;
    secondary: LandingCta;
  };
  links: {
    booking: string | null;
    community: string | null;
    merch: string | null;
    retailBooking: string | null;
  };
  form: {
    enabled: boolean;
    endpoint: string;
    defaultMode: "GROUP_WAIT" | "BOOK_NOW";
  };
  inventoryDisclosure: LandingInventoryDisclosure;
  campaignNotice: LandingCampaignNotice | null;
}

export interface CampaignLandingLoadResult {
  campaign: Campaign;
  brief: CampaignAestheticBrief | null;
  manifest: CampaignMediaManifest | null;
  waitlistSummary: CampaignWaitlistSummary;
  landing: CampaignLandingViewModel;
}

const STATE_LABELS: Record<Campaign["status"], string> = {
  DRAFT: "Private Preview",
  GATHERING_INTEREST: "Now Forming",
  THRESHOLD_MET: "Ready For Booking",
  CONVERTED: "Now Booking",
  EXPIRED: "Closed",
};

const FALLBACK_DESIGN_SYSTEM: Omit<LandingDesignSystem, "chat"> = {
  visualFlavor: "none",
  system: "system_4_modular",
  energyMode: "calm_contemplative",
  issueLabel: "Campaign",
  sectionLabels: ["The Sailing", "The People", "The Moment"],
  italicWord: "Sea",
  accentHex: "#ff5a3d",
  headline: "A Real Cruise, Designed Around A Shared Mood",
  subhead: "A public campaign page for a themed group sailing.",
  quote: "This is a real cruise, but it feels designed for people like me.",
  quoteCite: "Leisure Life Interactive",
  cta: "Join the group list",
};

function visualFlavorForSystem(system: VisualSystem): VisualFlavor {
  if (system === "system_1_editorial") return "editorial_magazine";
  if (system === "system_2_nostalgia") return "travel_nostalgia";
  if (system === "system_3_zine") return "indie_zine";
  return "none";
}

function visualSystemForFlavor(flavor: VisualFlavor): VisualSystem {
  if (flavor === "editorial_magazine") return "system_1_editorial";
  if (flavor === "travel_nostalgia") return "system_2_nostalgia";
  if (flavor === "indie_zine") return "system_3_zine";
  return "system_4_modular";
}

function issueLabelForSystem(system: VisualSystem): string {
  if (system === "system_1_editorial") return "Issue 01";
  if (system === "system_2_nostalgia") return "Voyage 01";
  if (system === "system_3_zine") return "Vol. 1";
  return "Campaign";
}

function normalizeSectionLabels(labels: string[]): string[] {
  const cleaned = labels
    .map((label) => label.trim())
    .filter(Boolean)
    .filter((label, index, array) => array.indexOf(label) === index)
    .slice(0, 5);

  return cleaned.length >= 3 ? cleaned : FALLBACK_DESIGN_SYSTEM.sectionLabels;
}

function buildStarterConversation(
  campaign: Campaign,
  brief: CampaignAestheticBrief | null,
): Array<{
  role: 'user' | 'assistant';
  content: string;
  channel?: 'main' | 'ideas' | 'logistics' | 'meetups';
}> {
  // Source 1: brief engine generated the conversation — use it verbatim.
  // Present on briefs regenerated after this change; empty array on older briefs.
  const generated = brief?.messaging?.starterConversation;
  if (generated?.length) return generated;

  // Source 2: deterministic fallback — assembled from brief fields.
  const ship = campaign.matchedShipName ?? campaign.shipTarget ?? 'our ship';
  const destination = campaign.targetDestination ?? 'at sea';
  const dates = campaign.targetDates ?? 'coming up';

  // First TC answer: what the sailing is — one sentence of the pitch + logistics.
  const rawPitch = brief?.messaging.elevatorPitch
    ?? campaign.communityFitRationale
    ?? campaign.description
    ?? campaign.name;
  const pitchLine = rawPitch.split(/\.\s+/)[0].replace(/\.$/, '').trim();

  // Second TC answer: how the niche shows up — first clause of participationStyle,
  // which is always short and in the invitation register.
  const rawStyle = brief?.communityExpression?.participationStyle
    ?? brief?.communityExpression?.optionalGatherings?.[0]
    ?? 'Drop in when you feel like it — nothing mandatory.';
  const styleLine = rawStyle
    .split(/\.\s+/)[0]     // first sentence
    .split(/,\s*(and|but)\s/i)[0]  // first clause before "and"/"but"
    .replace(/\.$/, '')
    .trim();

  return [
    { role: 'user', channel: 'main', content: 'What is this trip?' },
    { role: 'assistant', channel: 'main', content: `${pitchLine} — ${ship}, ${destination}, ${dates}.` },
    { role: 'user', channel: 'ideas', content: 'Do I have to join activities?' },
    { role: 'assistant', channel: 'ideas', content: `${styleLine}. Nothing mandatory.` },
    { role: 'user', channel: 'logistics', content: 'How do I get updates?' },
    { role: 'assistant', channel: 'logistics', content: "Use the form on this page. No payment today." },
    { role: 'user', channel: 'meetups', content: 'Will people actually meet up?' },
    { role: 'assistant', channel: 'meetups', content: 'Yes — casually. Small meetups, easy drop-ins, no pressure.' },
  ];
}

/**
 * Resolve the active visual flavor for a campaign.
 * Precedence (highest first):
 *   1. `flavorOverride` — preview-only URL param from the audition toolbar.
 *   2. `campaign.manualVisualFlavor` — operator-locked override on the campaign record.
 *   3. `brief.identityBlueprint.visualFlavor` — auto-derived from energy mode.
 *   4. `'none'` (System 4 base) when no brief exists.
 */
export function resolveActiveVisualFlavor(
  campaign: Campaign | null | undefined,
  brief: CampaignAestheticBrief | null | undefined,
  flavorOverride?: VisualFlavor,
): VisualFlavor {
  if (flavorOverride) return flavorOverride;
  if (campaign?.manualVisualFlavor) return campaign.manualVisualFlavor;
  if (brief?.identityBlueprint?.visualFlavor)
    return brief.identityBlueprint.visualFlavor;
  return "none";
}

export function buildLandingDesignSystem(
  campaign: Campaign,
  brief: CampaignAestheticBrief | null,
  flavorOverride?: VisualFlavor,
): LandingDesignSystem {
  const endpoint = `/api/groups/campaign/${campaign.id}/chat`;
  const chatBase = {
    sessionId: `campaign-chat://${campaign.id}`,
    title: "Tour Conductor",
    starterConversation: buildStarterConversation(campaign, brief),
    endpoint,
  };

  const activeFlavor = resolveActiveVisualFlavor(
    campaign,
    brief,
    flavorOverride,
  );

  if (!brief) {
    const fallbackSystem = visualSystemForFlavor(activeFlavor);
    return {
      ...FALLBACK_DESIGN_SYSTEM,
      visualFlavor: activeFlavor,
      system: fallbackSystem,
      issueLabel: issueLabelForSystem(fallbackSystem),
      chat: {
        ...chatBase,
        eyebrow: "Status Desk",
        signedOutMessage:
          "Join updates to ask the Tour Conductor a question. You can still read the shared campaign thread here.",
      },
    };
  }

  const tokens = extractNicheTokens(brief, campaign);
  const overrideSystem = visualSystemForFlavor(activeFlavor);
  const system = overrideSystem;
  const issueLabel = issueLabelForSystem(system);

  return {
    visualFlavor: activeFlavor,
    system,
    energyMode: tokens.energyMode,
    issueLabel,
    sectionLabels: normalizeSectionLabels(tokens.sectionLabels),
    italicWord: tokens.italicWord,
    accentHex: tokens.accentHex,
    headline: tokens.headline,
    subhead: tokens.subhead,
    quote: tokens.quote,
    quoteCite: tokens.quoteCite,
    cta: tokens.cta,
    chat: {
      ...chatBase,
      eyebrow: issueLabel,
      signedOutMessage:
        "Join updates to unlock the Tour Conductor. The shared history stays visible so new guests can catch the group energy before speaking.",
    },
  };
}

function normalizeColorToken(
  value: string | undefined,
  fallback: string,
): string {
  if (!value) {
    return fallback;
  }

  const hexMatch = value.match(
    /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/,
  );
  if (hexMatch) {
    return hexMatch[0];
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function formatCurrency(value?: number): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Pricing pending";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildHeroFallback(
  brief: CampaignAestheticBrief | null,
): LandingImageAsset | null {
  return {
    url: "",
    alt: brief?.messaging.heroSlogan ?? "",
  };
}

function isApprovedAsset(asset: AssetRecord): boolean {
  return (
    asset.reviewStatus === "human_approved" ||
    asset.reviewStatus === "auto_approved" ||
    asset.curation?.approvalState === "human_approved" ||
    asset.curation?.approvalState === "auto_approved"
  );
}

function selectApprovedOrFirst(candidates: AssetRecord[]): AssetRecord | null {
  const withUrl = candidates.filter((asset) => asset.url);
  return withUrl.find(isApprovedAsset) ?? withUrl[0] ?? null;
}

export function selectLandingHeroAsset(
  manifest: CampaignMediaManifest | null,
): AssetRecord | null {
  if (!manifest) {
    return null;
  }

  const candidates = [
    ...(manifest.images.platformCrops.hero_16x9 ?? []),
    ...manifest.images.hero,
    ...manifest.images.aestheticConcepts,
  ];

  const curatedPrimary =
    selectPreferredAssetForContext(candidates, "landing_hero_primary", manifest) ??
    selectPreferredAssetForContext(candidates, "landing_hero_alt", manifest);

  if (curatedPrimary?.url) {
    return curatedPrimary;
  }

  return selectApprovedOrFirst(candidates);
}

function resolveHeroImage(
  campaign: Campaign,
  brief: CampaignAestheticBrief | null,
  manifest: CampaignMediaManifest | null,
): LandingImageAsset | null {
  const asset = selectLandingHeroAsset(manifest);
  if (!asset) {
    return buildHeroFallback(brief);
  }

  return {
    url: asset.url,
    alt: brief?.messaging.heroSlogan ?? campaign.name,
  };
}

function buildGalleryImages(
  campaign: Campaign,
  manifest: CampaignMediaManifest | null,
  heroImage: LandingImageAsset | null,
): LandingImageAsset[] {
  const maxGalleryImages = 10;

  if (!manifest) {
    return heroImage?.url ? [heroImage] : [];
  }

  const sceneCandidates = [...manifest.images.sceneImages];
  const trustCandidates = [
    ...manifest.images.shipReferences,
    ...manifest.images.documentaryDetails,
  ];
  const fallbackCandidates = [
    ...manifest.images.hero,
    ...(manifest.images.platformCrops.hero_16x9 ?? []),
    ...manifest.images.aestheticConcepts,
  ];

  function collectApproved(candidates: AssetRecord[]): LandingImageAsset[] {
    const seen = new Set<string>();
    const out: LandingImageAsset[] = [];
    for (const asset of candidates) {
      if (!asset.url || asset.url === heroImage?.url || seen.has(asset.url))
        continue;
      if (!isApprovedAsset(asset)) continue;
      seen.add(asset.url);
      out.push({ url: asset.url, alt: `${campaign.name} campaign image` });
    }
    return out;
  }

  const scenes = collectApproved(sceneCandidates);
  const trust = collectApproved(trustCandidates);
  const fallback = collectApproved(fallbackCandidates);

  const ordered = [...scenes, ...trust, ...fallback];
  const mixed: LandingImageAsset[] = [];
  const seenUrls = new Set<string>();
  for (const image of ordered) {
    if (seenUrls.has(image.url)) continue;
    seenUrls.add(image.url);
    mixed.push(image);
    if (mixed.length >= maxGalleryImages) break;
  }

  if (mixed.length === 0 && heroImage?.url) {
    mixed.push(heroImage);
  }

  return mixed;
}

function buildTrustImages(
  campaign: Campaign,
  manifest: CampaignMediaManifest | null,
  heroImage: LandingImageAsset | null,
): LandingImageAsset[] {
  if (!manifest) return heroImage?.url ? [heroImage] : [];

  const candidates = [
    ...manifest.images.shipReferences,
    ...manifest.images.documentaryDetails,
  ];
  const seen = new Set<string>();
  const out: LandingImageAsset[] = [];

  for (const asset of candidates) {
    if (!asset.url || asset.url === heroImage?.url || seen.has(asset.url))
      continue;
    if (!isApprovedAsset(asset)) continue;
    seen.add(asset.url);
    out.push({ url: asset.url, alt: `${campaign.name} ship reference` });
  }

  return out;
}

function getPricingDetail(campaign: Campaign): {
  sourceLabel: string;
  detail: string;
} {
  if (campaign.pricingStatus === "CB_MATCHED") {
    return {
      sourceLabel: "Confirmed group pricing",
      detail:
        "This price is tied to matched Cruise Brothers inventory and reflects the strongest booking-ready number currently attached to this sailing.",
    };
  }

  if (campaign.pricingStatus === "AI_ESTIMATE") {
    return {
      sourceLabel: "Estimated pricing",
      detail:
        "This price is directional for now. It helps you understand the sailing while live group inventory is still being finalized.",
    };
  }

  return {
    sourceLabel: "Pricing in progress",
    detail:
      "Live pricing is still being matched. You can still raise your hand now, and we will send the next step once pricing is ready.",
  };
}

function getThresholdCopy(
  campaign: Campaign,
  waitlistSummary: CampaignWaitlistSummary,
  targetCabins: number,
): { headline: string; detail: string } {
  if (campaign.status === "THRESHOLD_MET" || campaign.status === "CONVERTED") {
    return {
      headline: "This sailing is ready to move into booking.",
      detail:
        "Enough cabins have been claimed to open the next step. If you are ready, you can move toward traveler details and the booking handoff now.",
    };
  }

  if (campaign.status === "EXPIRED") {
    return {
      headline: "This sailing is no longer gathering new guests.",
      detail:
        "The group did not reach its target in time, so new signups are closed for now while the team decides whether to relaunch the concept.",
    };
  }

  if (waitlistSummary.totalEntries === 0) {
    return {
      headline: "Be among the first to join this sailing.",
      detail:
        "If this trip feels like your pace, you can join the interest list now for free. We use early responses to decide whether this concept should become a real group offer.",
    };
  }

  return {
    headline: "The group is taking shape.",
    detail: `Each cabin request helps us judge whether this sailing has enough real momentum to become a proper ${targetCabins}-cabin group launch with perks. Until that threshold is met, treat this as a forming campaign rather than a guaranteed departure.`,
  };
}

function getBookingChoices(
  campaign: Campaign,
  brief: CampaignAestheticBrief | null,
): LandingPathChoice[] {
  const waitlistLabel =
    brief?.messaging.ctaVariants.waitlist ?? "Join the list";
  const bookNowLabel =
    brief?.messaging.ctaVariants.bookNow ?? "Join List";

  const waitDescription =
    campaign.status === "THRESHOLD_MET" || campaign.status === "CONVERTED"
      ? "Choose this if you want to stay close to the sailing, even if you are not ready to pick a cabin today."
      : "Choose this if you want to help the shared group version form. We count your interest, keep you updated, and only move you forward when the trip is truly ready.";

  const bookDescription =
    campaign.status === "GATHERING_INTEREST"
      ? "Choose this if you want the earliest possible booking handoff if the sailing stabilizes, even if the shared group version never fully comes together."
      : "Choose this if you are ready to move directly into booking now.";

  return [
    {
      mode: "GROUP_WAIT",
      label: waitlistLabel,
      description: waitDescription,
      highlighted: campaign.status === "GATHERING_INTEREST",
    },
    {
      mode: "BOOK_NOW",
      label: bookNowLabel,
      description: bookDescription,
      highlighted:
        campaign.status === "THRESHOLD_MET" || campaign.status === "CONVERTED",
    },
  ];
}

function getCtas(
  campaign: Campaign,
  brief: CampaignAestheticBrief | null,
): { primary: LandingCta; secondary: LandingCta } {
  const [waitlistChoice, bookingChoice] = getBookingChoices(campaign, brief);

  if (campaign.status === "THRESHOLD_MET" || campaign.status === "CONVERTED") {
    return {
      primary: {
        label: bookingChoice.label,
        mode: "BOOK_NOW",
        description: bookingChoice.description,
        disabled: false,
      },
      secondary: {
        label: waitlistChoice.label,
        mode: "GROUP_WAIT",
        description: waitlistChoice.description,
        disabled: false,
      },
    };
  }

  if (campaign.status === "EXPIRED") {
    return {
      primary: {
        label: "Signups closed",
        mode: "GROUP_WAIT",
        description: "New entries are paused for this sailing.",
        disabled: true,
      },
      secondary: {
        label: bookingChoice.label,
        mode: "BOOK_NOW",
        description:
          "Direct booking is no longer available through this sailing.",
        disabled: true,
      },
    };
  }

  return {
    primary: {
      label: waitlistChoice.label,
      mode: "GROUP_WAIT",
      description: waitlistChoice.description,
      disabled: false,
    },
    secondary: {
      label: bookingChoice.label,
      mode: "BOOK_NOW",
      description: bookingChoice.description,
      disabled: false,
    },
  };
}

function buildExperienceBullets(
  campaign: Campaign,
  brief: CampaignAestheticBrief | null,
): string[] {
  const source = campaign.cruiseNativeMoments?.length
    ? campaign.cruiseNativeMoments
    : (brief?.visual.plausibilityFramework.cruiseNativeMoments ?? []);
  const gatherings = campaign.optionalGatheringMoments?.length
    ? campaign.optionalGatheringMoments
    : (brief?.communityExpression.optionalGatherings ?? []);

  const bullets = [...source, ...gatherings]
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 3);
  if (bullets.length > 0) {
    return bullets;
  }

  return [
    "A cruise-first rhythm shaped by the ship, the sea, and the feel of the itinerary.",
    "Optional shared moments that support the theme without turning the sailing into a scheduled retreat.",
    "A clear booking path that starts with interest and opens into the next step when the group is ready.",
  ];
}

function buildWhatToExpect(
  campaign: Campaign,
  brief: CampaignAestheticBrief | null,
): string[] {
  const enhancedMoments =
    brief?.visual.plausibilityFramework.nicheEnhancedMoments ?? [];
  const cruiseMoments =
    brief?.visual.plausibilityFramework.cruiseNativeMoments ??
    campaign.cruiseNativeMoments ??
    [];
  const communityMoments = campaign.optionalGatheringMoments?.length
    ? campaign.optionalGatheringMoments
    : (brief?.communityExpression.optionalGatherings ?? []);
  const combined = [
    ...communityMoments,
    ...enhancedMoments,
    ...cruiseMoments,
  ].filter((value, index, array) => array.indexOf(value) === index);

  if (combined.length > 0) {
    return combined.slice(0, 4);
  }

  return [
    "A real cruise rhythm with enough open time to enjoy the ship your own way.",
    "A themed mood that shows up through atmosphere, shared moments, and the people who join.",
    "Clear next steps so you know when to simply raise your hand and when booking actually opens.",
  ];
}

/**
 * Build the guest-invitation list for the Group Chat Hall idea board.
 *
 * Source priority (invitation register only — no visual/camera cues):
 *   1. brief.communityExpression.activityInvitations — brief engine, written explicitly
 *      for the idea board ("you can...", "bring...", "join..."). Added in Layer 3.
 *   2. campaign.optionalGatheringMoments — operator-patched invitation copy. See PATCH
 *      endpoint for /api/groups/campaign/[slug] which accepts this field directly.
 *   3. brief.communityExpression.optionalGatherings — brief engine, invitation-adjacent
 *      but may still drift to cinematographer register on older briefs.
 *   4. brief.communityExpression.belongingSignals — social identity signals.
 *
 * Intentionally excludes:
 *   - nicheEnhancedMoments  → cinematographer frame ("a café table with..."), image gen only.
 *   - cruiseNativeMoments   → ship-context scenes for storyboard/video generation.
 */
function buildGuestInvitations(
  campaign: Campaign,
  brief: CampaignAestheticBrief | null,
): string[] {
  // Source 1: dedicated invitation field (Layer 3 — present on briefs regenerated after this change).
  const invitations = brief?.communityExpression.activityInvitations ?? [];
  if (invitations.length > 0) {
    return invitations.slice(0, 6);
  }

  // Source 2: operator-patched gathering moments (invitation copy, not camera cues).
  const patched = campaign.optionalGatheringMoments ?? [];
  if (patched.length > 0) {
    return patched.slice(0, 6);
  }

  // Source 3: brief-engine optionalGatherings (may still drift, but better than nicheEnhancedMoments).
  const gatherings = brief?.communityExpression.optionalGatherings ?? [];
  const belonging = brief?.communityExpression.belongingSignals ?? [];
  const combined = [...gatherings, ...belonging].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  );
  if (combined.length > 0) {
    return combined.slice(0, 6);
  }

  // Generic fallback — neutral invitation register.
  return [
    "Suggest an onboard activity or get-together for the group.",
    "Ask the Tour Conductor about the itinerary or shore excursions.",
    "Tell us what kind of people you want to meet on this sailing.",
  ];
}

function buildWhyJoinNow(campaign: Campaign): string[] {
  const reasons = [
    "Joining is free and non-binding, so you can raise your hand early without locking yourself into a booking today.",
    "Early interest helps us see whether this concept should become a real group sailing with shared perks and better coordination.",
    "Signing up now also helps you meet like-minded guests and shape the version of the cruise that actually comes together.",
  ];

  if (campaign.pricingStatus === "CB_MATCHED" && campaign.startingPrice) {
    reasons.unshift(
      `Current matched pricing starts around ${formatCurrency(campaign.startingPrice)}, so you are not evaluating the concept blind even though the final group version may still shift.`,
    );
  } else if (campaign.startingPrice) {
    reasons.unshift(
      `Current pricing is tracking around ${formatCurrency(campaign.startingPrice)}, which gives you an early budget signal while the group version is still forming.`,
    );
  }

  if (campaign.expiresAt) {
    reasons.push(
      "This campaign window is time-bound, so joining early matters if you want updates before the concept is revised, paused, or closed.",
    );
  }

  return reasons.slice(0, 3);
}

function buildHowItWorks(
  campaign: Campaign,
  brief: CampaignAestheticBrief | null,
): LandingStorySection[] {
  const waitlistLabel =
    brief?.messaging.ctaVariants.waitlist ?? "Join the group list";
  const bookingLabel =
    brief?.messaging.ctaVariants.bookNow ?? "Join List";

  return [
    {
      title: "1. Raise your hand for a forming campaign",
      body: `You can ${waitlistLabel.toLowerCase()} if you want to help this group version take shape, or choose ${bookingLabel.toLowerCase()} if you want the earliest possible booking handoff once the sailing is stable enough.`,
    },
    {
      title: "2. We gather interest and keep you updated",
      body: "We save your party size, cabin preference, and contact details so we can measure real demand, connect the right guests, and send the right update as the concept develops.",
    },
    {
      title: "3. If it matures, we open the proper next step",
      body: campaign.cbagenttoolsBookingLink
        ? "If enough interest forms and the booking path is healthy, we move guests into the correct handoff. If the trip changes, slips, or no longer makes sense, we update the page instead of pretending nothing changed."
        : "When the right path opens, we send the proper handoff. If the concept does not come together cleanly, we may revise, postpone, or cancel this version rather than force a messy launch.",
    },
  ];
}

function buildWhatItIs(
  campaign: Campaign,
  brief: CampaignAestheticBrief | null,
): LandingStorySection {
  return {
    title: `What ${campaign.name} Is`,
    body:
      brief?.messaging.elevatorPitch ??
      campaign.communityFitRationale ??
      `${campaign.name} is a themed group sailing built around the feel of the trip, the ship, and the people who want to travel that way together.`,
  };
}

function buildInventoryDisclosure(campaign: Campaign): LandingInventoryDisclosure {
  const mode: CampaignInventoryMode = campaign.activeBookingMode ?? "GROUP_BLOCK_ACTIVE";

  const processNote =
    "This page represents a forming campaign, not a locked final package. Supplier inventory, pricing, dates, ship details, group perks, and the exact booking path can change while interest builds. We keep re-verifying the trip as momentum develops. If this version no longer makes sense, we may revise it, postpone it, or cancel it instead of sending guests into a confusing booking experience.";

  const formAcknowledgement =
    "By joining, you are asking for updates on a forming campaign. This step is free and non-binding. Sailing details may change before any booking step opens, and the campaign may be revised, postponed, or canceled if the group does not come together cleanly.";

  const trustBullet =
    "This page is an interest-gathering step, not a confirmed reservation. Group pricing, cabin availability, perks, and even the final version of the sailing depend on supplier inventory and real guest momentum.";

  if (mode === "GROUP_BACKUP_SWITCHED") {
    return {
      mode,
      bannerVisible: true,
      bannerCopy:
        "We re-verified the sailing and updated the inventory source behind this trip. The overall trip remains available, and the page now reflects the latest booking path.",
      processNote,
      trustBullet,
      formAcknowledgement,
    };
  }

  if (mode === "RETAIL_MULTI_BOOKING") {
    return {
      mode,
      bannerVisible: true,
      bannerCopy:
        "The official group block for this sailing is no longer available. We can still help guests book the same cruise individually and coordinate the experience where possible. Pricing, cabin location, and group-specific amenities may differ from the original offer.",
      processNote,
      trustBullet,
      formAcknowledgement,
    };
  }

  if (mode === "INVENTORY_FAILED_PAUSED") {
    return {
      mode,
      bannerVisible: true,
      bannerCopy:
        "We are pausing this sailing because the original inventory is no longer available in a way we can stand behind. Rather than send guests into an uncertain booking path, we are stopping this version of the offer and will follow up with the best available alternative.",
      processNote,
      trustBullet,
      formAcknowledgement,
    };
  }

  return {
    mode: "GROUP_BLOCK_ACTIVE",
    bannerVisible: false,
    bannerCopy: "",
    processNote,
    trustBullet,
    formAcknowledgement,
  };
}

function buildTrustBullets(campaign: Campaign): string[] {
  const targetCabins = getPublicGroupCabinTarget(campaign);
  const disclosure = buildInventoryDisclosure(campaign);

  return [
    "You are not paying on this page, reserving a cabin, or making a serious commitment. This step only saves your interest, party size, and cabin preference.",
    `If enough guests raise their hands to represent about ${targetCabins} cabins, we can move toward a real group package with stronger coordination and shared perks.`,
    campaign.expiresAt
      ? `If the cabin target is not reached by ${campaign.expiresAt}, this version of the sailing can be revised, postponed, or closed instead of drifting without a clear answer.`
      : "If the cabin target is not reached in time, this version of the sailing can be revised, postponed, or closed instead of drifting without a clear answer.",
    disclosure.trustBullet,
  ];
}

function buildFaq(campaign: Campaign): LandingFaqItem[] {
  return [
    {
      question: "What happens after I join the group list?",
      answer:
        "We save your interest against the sailing target, keep your preferences on file, and update you as the concept develops. If the trip matures cleanly, we send the proper traveler-details and booking handoff.",
    },
    {
      question: "Is this already a confirmed group cruise?",
      answer:
        "Not yet. This page is how we gather interest in a specific style of cruise. If enough interest forms, we turn it into a real group offer with group benefits. Until then, treat the sailing as actively forming.",
    },
    {
      question: "What if the plan changes while the campaign is forming?",
      answer:
        "That can happen. Dates, pricing, inventory, group perks, and the exact booking path may change while we verify supply and guest momentum. If this version no longer makes sense, we will revise it, postpone it, or cancel it rather than quietly let it drift.",
    },
    {
      question: "Why join early if it is not final yet?",
      answer:
        "Because it is free, non-binding, and useful. You get updates first, help us judge whether the concept should launch, and start connecting with other potential guests who want the same kind of trip.",
    },
    {
      question: "How should I read the listed price?",
      answer:
        campaign.pricingStatus === "CB_MATCHED"
          ? "It reflects the strongest matched inventory signal we currently have for this sailing. It is helpful, but it is not a promise that the final group version will launch unchanged."
          : "It is a directional price until live inventory is matched, which means it helps frame the trip without pretending booking is already finalized.",
    },
  ];
}

function buildCampaignNotice(campaign: Campaign): LandingCampaignNotice | null {
  if (campaign.status !== "GATHERING_INTEREST") {
    return null;
  }

  return {
    eyebrow: "Before you join",
    title: "This is a forming campaign, not a locked final cruise package.",
    body:
      "We are gathering free, no-obligation interest around a particular kind of sailing. If enough guests respond, we turn that interest into a real group offer with clearer benefits, better coordination, and the right booking handoff.",
    bullets: [
      "No payment and no serious commitment happen on this page.",
      "Ship details, pricing, perks, timing, and the exact group shape may change while the campaign forms.",
      "If the concept does not come together the right way, this version can be revised, postponed, or canceled.",
      "Joining early still matters because it helps shape the trip and connects you with other potential guests.",
    ],
    modalTitle: "Campaign forming...",
    modalBody:
      "You are looking at a forming cruise campaign. We are testing real interest in a specific style of trip before treating it like a confirmed group departure.",
    modalBullets: [
      "This page is free and non-binding. No payments at this stage.",
      "The group only activates if the waiting list threshold is met (8+ guests).",
      "If supplier inventory or guest momentum shifts, the trip may change, slip, or close instead of launching exactly as first shown.",
      "Joining now still helps: you get early updates, meet like-minded travelers, and help shape a more exciting final cruise.",
    ],
    dismissLabel: "I understand how this works",
  };
}

function buildFacts(
  campaign: Campaign,
  waitlistSummary: CampaignWaitlistSummary,
): LandingFact[] {
  const targetCabins = getPublicGroupCabinTarget(campaign);

  const facts: LandingFact[] = [
    { label: "Sailing", value: campaign.targetDates },
    {
      label: "Ship",
      value:
        campaign.matchedShipName ??
        campaign.shipTarget ??
        campaign.targetDestination ??
        campaign.name,
    },
  ];

  if (campaign.matchedDeparturePort) {
    facts.push({
      label: "Departure Port",
      value: formatDeparturePort(campaign.matchedDeparturePort),
    });
  }

  if (campaign.targetDestination) {
    facts.push({ label: "Destination", value: campaign.targetDestination });
  }

  if (campaign.matchedNights) {
    facts.push({
      label: "Duration",
      value: `${campaign.matchedNights} nights`,
    });
  }

  facts.push(
    { label: "Cabins needed", value: `${targetCabins}` },
    {
      label: "People on the waitlist",
      value: `${waitlistSummary.totalPassengers}`,
    },
  );

  return facts;
}

function buildLandingViewModel(
  campaign: Campaign,
  brief: CampaignAestheticBrief | null,
  manifest: CampaignMediaManifest | null,
  waitlistSummary: CampaignWaitlistSummary,
  preview: boolean,
  flavorOverride?: VisualFlavor,
  verifiedSummary?: CampaignWaitlistSummary,
): CampaignLandingViewModel {
  const targetCabins = getPublicGroupCabinTarget(campaign);
  const pricing = getPricingDetail(campaign);
  const thresholdCopy = getThresholdCopy(
    campaign,
    waitlistSummary,
    targetCabins,
  );
  const ctas = getCtas(campaign, brief);
  const heroImage = resolveHeroImage(campaign, brief, manifest);
  const galleryImages = buildGalleryImages(campaign, manifest, heroImage);
  const trustImages = buildTrustImages(campaign, manifest, heroImage);
  // Use verified entries for threshold progress when available.
  const thresholdSource = verifiedSummary ?? waitlistSummary;
  const percentOfThreshold = getPublicThresholdPercent(
    targetCabins,
    thresholdSource.totalEntries,
  );
  const designSystem = buildLandingDesignSystem(
    campaign,
    brief,
    flavorOverride,
  );

  return {
    slug: campaign.id,
    preview,
    state: campaign.status,
    stateLabel: STATE_LABELS[campaign.status],
    title: campaign.name,
    heroSlogan: brief?.messaging.heroSlogan ?? campaign.name,
    subSlogan: brief?.messaging.subSlogan ?? campaign.description,
    elevatorPitch: brief?.messaging.elevatorPitch ?? campaign.description,
    heroImage,
    galleryImages,
    trustImages,
    accentColor: normalizeColorToken(
      brief?.visual.colorPalette.accent,
      "#2962FF",
    ),
    surfaceColor: normalizeColorToken(
      brief?.visual.colorPalette.background,
      "#0F172A",
    ),
    textColor: normalizeColorToken(
      brief?.visual.colorPalette.textOnDark,
      "#F8FAFC",
    ),
    designSystem,
    facts: buildFacts(campaign, waitlistSummary),
    story: {
      whatItIs: buildWhatItIs(campaign, brief),
      whyJoinNow: buildWhyJoinNow(campaign),
      whatToExpect: buildWhatToExpect(campaign, brief),
      howItWorks: buildHowItWorks(campaign, brief),
      guestInvitations: buildGuestInvitations(campaign, brief),
    },
    threshold: {
      requiredCabins: targetCabins,
      joinedEntries: waitlistSummary.totalEntries,
      joinedPassengers: waitlistSummary.totalPassengers,
      convertedEntries: waitlistSummary.convertedEntries,
      percentOfThreshold: percentOfThreshold,
      headline: thresholdCopy.headline,
      detail: thresholdCopy.detail,
    },
    pricing: {
      startingPriceLabel: formatCurrency(campaign.startingPrice),
      sourceLabel: pricing.sourceLabel,
      detail: pricing.detail,
    },
    experienceBullets: buildExperienceBullets(campaign, brief),
    trustBullets: buildTrustBullets(campaign),
    bookingPathChoices: getBookingChoices(campaign, brief),
    faq: buildFaq(campaign),
    ctas,
    links: {
      booking: campaign.cbagenttoolsBookingLink ?? null,
      community: campaign.communityChannelUrl ?? null,
      merch: campaign.merchandiseStoreUrl ?? null,
      retailBooking: campaign.odysseusRetailBookingLink ?? null,
    },
    form: {
      enabled: campaign.status !== "EXPIRED" && campaign.status !== "DRAFT",
      endpoint: `/api/groups/campaign/${campaign.id}/waitlist`,
      defaultMode: ctas.primary.mode,
    },
    inventoryDisclosure: buildInventoryDisclosure(campaign),
    campaignNotice: buildCampaignNotice(campaign),
  };
}

export async function getCampaignLandingBySlug(
  slug: string,
  options: LandingLoaderOptions = {},
): Promise<CampaignLandingLoadResult | null> {
  const campaign = await getCampaignBlueprint(slug);
  if (!campaign) {
    return null;
  }

  const preview = options.includeDraftPreview === true;
  if (campaign.status === "DRAFT" && !preview) {
    return null;
  }

  const [brief, manifest, waitlistSummary, verifiedSummary] = await Promise.all([
    getAestheticBrief(slug),
    getMediaManifest(slug),
    getCampaignWaitlistSummary(slug),
    getVerifiedWaitlistSummary(slug),
  ]);

  return {
    campaign,
    brief,
    manifest,
    waitlistSummary,
    landing: buildLandingViewModel(
      campaign,
      brief,
      manifest,
      waitlistSummary,
      preview,
      options.flavorOverride,
      verifiedSummary,
    ),
  };
}
