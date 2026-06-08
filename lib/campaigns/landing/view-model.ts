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
import { formatPortsOfCall, formatDepartureLeg } from "@/lib/campaigns/landing/port-codes";
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
import { selectPreferredAssetForContext, collapseAssetVariantGroups } from "@/lib/campaigns/media/image-selection";
import {
  sanitizeAestheticBriefShipCopyForCampaign,
  sanitizeShipCopyForCampaign,
} from "@/lib/campaigns/ship-copy";

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

export const LANDING_IMAGE_PLACEMENT_KEYS = [
  "chat.backdrop",
  "form.backdrop",
  "progress.card.background",
  "pricing.banner",
  "story.whatItIs.background",
  "story.expectation.cards",
  "itinerary.rail",
  "trust.card.backgrounds",
  "faq.banner",
  "footer.strip",
] as const;

export type LandingImagePlacementKey =
  (typeof LANDING_IMAGE_PLACEMENT_KEYS)[number];

export interface LandingImagePlacements {
  chatBackdrop: LandingImageAsset | null;
  formBackdrop: LandingImageAsset | null;
  progressCardBackground: LandingImageAsset | null;
  pricingBanner: LandingImageAsset | null;
  storyWhatItIsBackground: LandingImageAsset | null;
  storyExpectationCards: LandingImageAsset[];
  itineraryRail: LandingImageAsset[];
  trustCardBackgrounds: LandingImageAsset[];
  faqBanner: LandingImageAsset | null;
  footerStrip: LandingImageAsset | null;
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

export interface LandingItinerarySummary {
  routeSummary: string;
  statusLabel: string;
  summary: string;
  details: string[];
  notes: string[];
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
  /**
   * Brief-derived palette woven into the landing surfaces as additional highlights.
   * On dark `system_4_modular` the colors are passed through verbatim. On the light
   * cream systems (1/2/3) each color is contrast-clamped against the system surface
   * so a pale brief color does not vanish on cream paper.
   */
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    textOnLight: string;
  };
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
  imagePlacements: LandingImagePlacements;
  accentColor: string;
  surfaceColor: string;
  textColor: string;
  designSystem: LandingDesignSystem;
  itinerary: LandingItinerarySummary;
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
  palette: {
    primary: "#ff5a3d",
    secondary: "#2962FF",
    accent: "#ff5a3d",
    textOnLight: "#0f172a",
  },
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
  if (system === "system_5_broadsheet") return "structural_broadsheet";
  if (system === "system_6_glass") return "liquid_glass";
  return "none";
}

function visualSystemForFlavor(flavor: VisualFlavor): VisualSystem {
  if (flavor === "editorial_magazine") return "system_1_editorial";
  if (flavor === "travel_nostalgia") return "system_2_nostalgia";
  if (flavor === "indie_zine") return "system_3_zine";
  if (flavor === "structural_broadsheet") return "system_5_broadsheet";
  if (flavor === "liquid_glass") return "system_6_glass";
  return "system_4_modular";
}

function issueLabelForSystem(system: VisualSystem): string {
  if (system === "system_1_editorial") return "Issue 01";
  if (system === "system_2_nostalgia") return "Voyage 01";
  if (system === "system_3_zine") return "Vol. 1";
  if (system === "system_5_broadsheet") return "Front Page";
  if (system === "system_6_glass") return "Collection 01";
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
  // Prefer the matched sailing date over the (possibly stale) targetDates hint.
  // After inventory match these are equal, but this stays correct for records
  // matched before targetDates-overwrite shipped.
  const dates = campaign.matchedSailDate?.trim() || campaign.targetDates || 'coming up';

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

function parseNightCount(value?: string | null): number | null {
  const match = value?.match(/(\d+)\s*(?:night|nights)?/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function formatNightLabel(value?: string | null): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  return /\bnight(s)?\b/i.test(trimmed) ? trimmed : `${trimmed} nights`;
}

function normalizeItineraryComparable(value?: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\b(pr|p\.r\.)\b/g, 'puerto rico')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function splitRouteParts(value: string): string[] {
  return value
    .split(/\s*(?:Â·|·|\|)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractDepartingLeg(value: string): string {
  for (const part of splitRouteParts(value)) {
    const match = part.match(/^Departing\s+(.+)$/i);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function hasMeaningfulLocationOverlap(left: string, right: string): boolean {
  const leftWords = new Set(
    normalizeItineraryComparable(left)
      .split(/\s+/)
      .filter((word) => word.length > 2),
  );
  const rightWords = normalizeItineraryComparable(right)
    .split(/\s+/)
    .filter((word) => word.length > 2);

  return rightWords.some((word) => leftWords.has(word));
}

function isStoredItineraryConsistentWithMatch(
  rawItinerarySummary: string,
  cleanItinerarySummary: string,
  campaignNights: string,
  departurePort: string,
): boolean {
  if (!cleanItinerarySummary) return false;

  const itineraryNights = parseNightCount(cleanItinerarySummary);
  const matchedNights = parseNightCount(campaignNights);
  if (itineraryNights !== null && matchedNights !== null && itineraryNights !== matchedNights) {
    return false;
  }

  const departingLeg =
    extractDepartingLeg(cleanItinerarySummary) || extractDepartingLeg(rawItinerarySummary);
  if (departingLeg && departurePort && !hasMeaningfulLocationOverlap(departurePort, departingLeg)) {
    return false;
  }

  return true;
}

function buildItinerarySummary(campaign: Campaign): LandingItinerarySummary {
  const ship = campaign.matchedShipName ?? campaign.shipTarget ?? campaign.name;
  const destination = campaign.targetDestination?.trim() || '';
  const nights = campaign.matchedNights?.trim() || '';
  const rawItinerarySummary = campaign.odysseusItinerarySummary?.trim() || '';
  const rawPortsOfCall = campaign.odysseusPortsOfCall?.trim() || '';
  const departurePort = campaign.matchedDeparturePort?.trim()
    ? formatDeparturePort(campaign.matchedDeparturePort)
    : '';
  const sailDate = campaign.matchedSailDate?.trim() || '';

  // Rebuild the itinerary summary cleanly, resolving any raw port codes that
  // appear in the Odysseus-scraped summary string (e.g. "Departing SJU").
  const cleanItinerarySummary = rawItinerarySummary
    ? rawItinerarySummary
        .split(/\s*(?:Â·|·)\s*/)
        .map((part) => {
          // "Departing CODE" / "Arriving CODE" — resolve the code
          const legMatch = part.match(/^(Departing|Arriving)\s+([A-Z]{2,4})$/);
          if (legMatch) return `${legMatch[1]} ${formatDepartureLeg(legMatch[2])}`;
          // Bare pipe-separated code string — reformat
          if (/^[A-Z]{2,4}(\|[A-Z]{2,4})+$/.test(part)) {
            return formatPortsOfCall(part) ?? part;
          }
          return part;
        })
        .join(' · ')
    : '';

  const storedItineraryIsConsistent = isStoredItineraryConsistentWithMatch(
    rawItinerarySummary,
    cleanItinerarySummary,
    nights,
    departurePort,
  );

  // Resolve port codes to human-readable names, but only when the stored route
  // does not contradict the matched sailing facts.
  const resolvedPortsOfCall = storedItineraryIsConsistent && rawPortsOfCall
    ? formatPortsOfCall(rawPortsOfCall)
    : null;

  const routeSummary = (storedItineraryIsConsistent ? cleanItinerarySummary : '')
    || [formatNightLabel(nights), destination]
      .filter(Boolean)
      .join(' · ')
    || 'Itinerary still forming';

  const details = [
    sailDate ? `Sail date: ${sailDate}` : '',
    departurePort ? `Departure port: ${departurePort}` : '',
    destination ? `Region: ${destination}` : '',
    nights ? `Duration: ${formatNightLabel(nights)}` : '',
    resolvedPortsOfCall ? `Ports of call: ${resolvedPortsOfCall}` : '',
  ].filter(Boolean);
  const notes = campaign.finalItineraryUrl
    ? [
        'A final itinerary link has been published for this sailing.',
        'If the route is fully published elsewhere, that source should be treated as authoritative.',
      ]
    : resolvedPortsOfCall
      ? [
          'A route summary has been confirmed for this sailing.',
          'Port details reflect the confirmed sailing itinerary.',
        ]
    : [
        'Specific port stops have not been published yet.',
        'We can only speak confidently to the ship, sail date, departure port, duration, and region until a final itinerary is posted.',
      ];

  return {
    routeSummary,
    statusLabel: campaign.finalItineraryUrl ? 'Itinerary published' : 'Itinerary still forming',
    summary: campaign.finalItineraryUrl
      ? `A final itinerary is available for ${ship}.`
      : resolvedPortsOfCall
        ? `The confirmed route for ${ship}: ${resolvedPortsOfCall}.`
      : `We can confirm the sailing direction, but the port-by-port route has not been published yet for ${ship}.`,
    details,
    notes,
  };
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
  const displayBrief = brief
    ? sanitizeAestheticBriefShipCopyForCampaign(brief, campaign)
    : null;
  const endpoint = `/api/groups/campaign/${campaign.id}/chat`;
  const chatBase = {
    sessionId: `campaign-chat://${campaign.id}`,
    title: "Tour Conductor",
    starterConversation: buildStarterConversation(campaign, displayBrief),
    endpoint,
  };

  const activeFlavor = resolveActiveVisualFlavor(
    campaign,
    displayBrief,
    flavorOverride,
  );

  if (!displayBrief) {
    const fallbackSystem = visualSystemForFlavor(activeFlavor);
    return {
      ...FALLBACK_DESIGN_SYSTEM,
      visualFlavor: activeFlavor,
      system: fallbackSystem,
      issueLabel: issueLabelForSystem(fallbackSystem),
      palette: buildPalette(null, fallbackSystem),
      chat: {
        ...chatBase,
        eyebrow: "Status Desk",
        signedOutMessage:
          "Join updates to ask the Tour Conductor a question. You can still read the shared campaign thread here.",
      },
    };
  }

  const tokens = extractNicheTokens(displayBrief, campaign);
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
    palette: buildPalette(displayBrief, system),
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

// Surface color each landing system renders against. Used to clamp brief-derived
// palette colors so a near-cream brief color does not vanish on cream paper.
const SYSTEM_SURFACE: Record<VisualSystem, string> = {
  system_1_editorial: "#f5f8f4",
  system_2_nostalgia: "#eef8f7",
  system_3_zine: "#fbf7ff",
  system_4_modular: "#08090d",
  system_5_broadsheet: "#f4f1ea",
  system_6_glass: "#eaf1f8",
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace("#", "").trim();
  if (m.length !== 3 && m.length !== 6) return null;
  const expanded = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrastRatio(a: string, b: string): number {
  const aRgb = hexToRgb(a);
  const bRgb = hexToRgb(b);
  if (!aRgb || !bRgb) return 21;
  const l1 = relLuminance(aRgb);
  const l2 = relLuminance(bRgb);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Blend `color` toward black (on light surfaces) or white (on dark surfaces)
// until the contrast ratio against `against` meets `min`. Preserves hue.
function clampForSurface(
  color: string,
  against: string,
  min = 3.0,
): string {
  if (contrastRatio(color, against) >= min) return color;
  const rgb = hexToRgb(color);
  const surfaceRgb = hexToRgb(against);
  if (!rgb || !surfaceRgb) return color;
  const surfaceIsLight = relLuminance(surfaceRgb) > 0.5;
  const [r, g, b] = rgb;
  const blend = (t: number): [number, number, number] => (
    surfaceIsLight
      ? [r * (1 - t), g * (1 - t), b * (1 - t)]
      : [r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t]
  );
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const [nr, ng, nb] = blend(mid);
    if (contrastRatio(rgbToHex(nr, ng, nb), against) >= min) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  const [nr, ng, nb] = blend(hi);
  return rgbToHex(nr, ng, nb);
}

function buildPalette(
  brief: CampaignAestheticBrief | null,
  system: VisualSystem,
): LandingDesignSystem["palette"] {
  const surface = SYSTEM_SURFACE[system];
  // Modular keeps brief colors raw; the dark surface accepts almost any hue.
  // Cream systems get clamped so pale/near-cream picks remain visible.
  const isDark = system === "system_4_modular";
  const adjust = (raw: string, fallback: string) => {
    const normalized = normalizeColorToken(raw, fallback);
    return isDark ? normalized : clampForSurface(normalized, surface, 3.0);
  };
  return {
    primary: adjust(brief?.visual.colorPalette.primary ?? "", "#ff5a3d"),
    secondary: adjust(brief?.visual.colorPalette.secondary ?? "", "#2962FF"),
    accent: adjust(brief?.visual.colorPalette.accent ?? "", "#ff5a3d"),
    textOnLight: adjust(
      brief?.visual.colorPalette.textOnLight ?? "",
      "#0f172a",
    ),
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

function findLandingSelectionOverride(
  manifest: CampaignMediaManifest,
  key: string,
): AssetRecord | null {
  const selectedAssetId = manifest.imageSelections?.[key];
  if (!selectedAssetId) return null;
  const candidates = [
    ...(manifest.images.platformCrops.hero_16x9 ?? []),
    ...manifest.images.hero,
    ...(manifest.images.flyerImages ?? []),
    ...manifest.images.sceneImages,
    ...manifest.images.aestheticConcepts,
    ...(manifest.images.documentaryDetails ?? []),
    ...manifest.images.shipReferences,
  ];
  const selected = candidates.find((asset) => asset.assetId === selectedAssetId);
  if (!selected?.url || selected.active === false) return null;
  if (selected.curation?.approvalState === "rejected") return null;
  return selected;
}

export function selectLandingHeroAsset(
  manifest: CampaignMediaManifest | null,
): AssetRecord | null {
  if (!manifest) {
    return null;
  }

  const override = findLandingSelectionOverride(manifest, "section:landingHero:primary");
  if (override) {
    return override;
  }

  // MULTI_MODEL_IMAGES (Phase F): collapse hero/concept variant groups to the
  // operator-selected model-version before auto-picking, so the landing hero is
  // never a non-selected variant. (Explicit overrides are handled above via
  // findLandingSelectionOverride, which stays uncollapsed by design.)
  const candidates = collapseAssetVariantGroups([
    ...(manifest.images.platformCrops.hero_16x9 ?? []),
    ...manifest.images.hero,
    ...manifest.images.aestheticConcepts,
  ], manifest.modelVersionSelections);

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

// LANDING_IMAGE_STUDIO: gather every image asset into an id→asset map so a
// curated id (any section, any model-variant) resolves.
function buildLandingAssetIndex(manifest: CampaignMediaManifest): Map<string, AssetRecord> {
  const all: AssetRecord[] = [
    ...Object.values(manifest.images.platformCrops ?? {}).flat(),
    ...manifest.images.hero,
    ...(manifest.images.flyerImages ?? []),
    ...manifest.images.sceneImages,
    ...manifest.images.aestheticConcepts,
    ...(manifest.images.documentaryDetails ?? []),
    ...manifest.images.shipReferences,
  ];
  const map = new Map<string, AssetRecord>();
  for (const asset of all) if (asset.assetId) map.set(asset.assetId, asset);
  return map;
}

// A curated asset ships if it still exists, is active, and isn't rejected/held —
// i.e. the same eligibility as the studio's selectable pool. Graceful skip
// otherwise (an asset that was later rejected just drops out).
function isCuratedEligible(asset: AssetRecord | undefined): asset is AssetRecord {
  if (!asset?.url || asset.active === false) return false;
  const state = asset.curation?.approvalState;
  return state !== 'rejected' && state !== 'revision_required' && state !== 'hold';
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

  // FULL-REPLACE override: if the operator curated a gallery, use exactly that
  // list/order (eligible, de-duped, hero excluded, capped) — algorithm not consulted.
  const curated = manifest.landingImageSets?.gallery;
  if (curated && curated.length > 0) {
    const index = buildLandingAssetIndex(manifest);
    const seen = new Set<string>();
    const out: LandingImageAsset[] = [];
    for (const id of curated) {
      const asset = index.get(id);
      if (!isCuratedEligible(asset)) continue;
      if (asset.url === heroImage?.url || seen.has(asset.url)) continue;
      seen.add(asset.url);
      out.push({ url: asset.url, alt: `${campaign.name} campaign image` });
      if (out.length >= maxGalleryImages) break;
    }
    if (out.length > 0) return out;
    // Curated list resolved to nothing usable → fall through to the algorithm.
  }

  // MULTI_MODEL_IMAGES (Phase F): collapse multi-model sections so the auto-built
  // gallery shows ONE version per logical image (the selected model-version),
  // never both the Gemini and OpenAI variant of the same hero/scene/detail.
  const selections = manifest.modelVersionSelections;
  const sceneCandidates = collapseAssetVariantGroups(manifest.images.sceneImages, selections);
  const trustCandidates = [
    ...manifest.images.shipReferences,
    ...collapseAssetVariantGroups(manifest.images.documentaryDetails, selections),
  ];
  const fallbackCandidates = [
    ...collapseAssetVariantGroups(manifest.images.hero, selections),
    ...(manifest.images.platformCrops.hero_16x9 ?? []),
    ...collapseAssetVariantGroups(manifest.images.aestheticConcepts, selections),
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

  const curated = manifest.landingImageSets?.trust;
  if (curated && curated.length > 0) {
    const index = buildLandingAssetIndex(manifest);
    const seen = new Set<string>();
    const out: LandingImageAsset[] = [];
    for (const id of curated) {
      const asset = index.get(id);
      if (!isCuratedEligible(asset)) continue;
      if (asset.url === heroImage?.url || seen.has(asset.url)) continue;
      seen.add(asset.url);
      out.push({ url: asset.url, alt: `${campaign.name} ship reference` });
    }
    if (out.length > 0) return out;
  }

  // MULTI_MODEL_IMAGES (Phase F): collapse documentary-detail variants so trust
  // cards never show both model-versions of the same logical detail.
  const candidates = [
    ...manifest.images.shipReferences,
    ...collapseAssetVariantGroups(manifest.images.documentaryDetails, manifest.modelVersionSelections),
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

function assetToLandingImage(
  campaign: Campaign,
  asset: AssetRecord,
): LandingImageAsset {
  return {
    url: asset.url,
    alt: `${campaign.name} campaign image`,
  };
}

function resolvePlacementImages(
  campaign: Campaign,
  manifest: CampaignMediaManifest | null,
  key: LandingImagePlacementKey,
): LandingImageAsset[] {
  if (!manifest) return [];
  const value = manifest.landingImageSets?.placements?.[key];
  const ids = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  if (ids.length === 0) return [];

  const index = buildLandingAssetIndex(manifest);
  const seen = new Set<string>();
  const out: LandingImageAsset[] = [];
  for (const id of ids) {
    const asset = index.get(id);
    if (!isCuratedEligible(asset) || seen.has(asset.url)) continue;
    seen.add(asset.url);
    out.push(assetToLandingImage(campaign, asset));
  }
  return out;
}

function firstImage(...images: Array<LandingImageAsset | null | undefined>): LandingImageAsset | null {
  return images.find((image): image is LandingImageAsset => Boolean(image?.url)) ?? null;
}

function buildLandingImagePlacements(
  campaign: Campaign,
  manifest: CampaignMediaManifest | null,
  heroImage: LandingImageAsset | null,
  galleryImages: LandingImageAsset[],
  trustImages: LandingImageAsset[],
): LandingImagePlacements {
  const single = (key: LandingImagePlacementKey, fallback: LandingImageAsset | null): LandingImageAsset | null =>
    resolvePlacementImages(campaign, manifest, key)[0] ?? fallback;
  const many = (key: LandingImagePlacementKey, fallback: LandingImageAsset[]): LandingImageAsset[] => {
    const resolved = resolvePlacementImages(campaign, manifest, key);
    return resolved.length > 0 ? resolved : fallback;
  };

  return {
    chatBackdrop: single("chat.backdrop", firstImage(heroImage, galleryImages[0])),
    formBackdrop: single("form.backdrop", firstImage(galleryImages[8], heroImage, galleryImages[0])),
    progressCardBackground: single("progress.card.background", firstImage(trustImages[0], galleryImages[0], heroImage)),
    pricingBanner: single("pricing.banner", firstImage(galleryImages[3], galleryImages[0], heroImage)),
    storyWhatItIsBackground: single("story.whatItIs.background", firstImage(galleryImages[1], heroImage)),
    storyExpectationCards: many("story.expectation.cards", galleryImages.slice(2, 7)),
    itineraryRail: many("itinerary.rail", galleryImages.slice(4, 7)),
    trustCardBackgrounds: many("trust.card.backgrounds", trustImages),
    faqBanner: single("faq.banner", firstImage(galleryImages[7], galleryImages[0], heroImage)),
    footerStrip: single("footer.strip", firstImage(galleryImages[9], heroImage)),
  };
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
        "The official group inventory for this sailing has not been selected yet. The ship and sailing may change as we re-verify the best available option. Guests can still follow the campaign now, and we will update the booking path as soon as the group setup is locked.",
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
  const itinerary = buildItinerarySummary(campaign);
  return [
    {
      question: "What itinerary details are confirmed right now?",
      answer: `${itinerary.summary} ${itinerary.notes[0]}`.trim(),
    },
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
  const itinerary = buildItinerarySummary(campaign);

  const facts: LandingFact[] = [
    { label: "Sailing", value: campaign.matchedSailDate ?? campaign.targetDates },
    {
      label: "Ship",
      value:
        campaign.matchedShipName ??
        campaign.shipTarget ??
        campaign.targetDestination ??
        campaign.name,
    },
    { label: "Itinerary", value: itinerary.routeSummary },
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
      value: formatNightLabel(campaign.matchedNights),
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
  const displayBrief = brief
    ? sanitizeAestheticBriefShipCopyForCampaign(brief, campaign)
    : null;
  const targetCabins = getPublicGroupCabinTarget(campaign);
  const pricing = getPricingDetail(campaign);
  const thresholdCopy = getThresholdCopy(
    campaign,
    waitlistSummary,
    targetCabins,
  );
  const ctas = getCtas(campaign, displayBrief);
  const heroImage = resolveHeroImage(campaign, displayBrief, manifest);
  const galleryImages = buildGalleryImages(campaign, manifest, heroImage);
  const trustImages = buildTrustImages(campaign, manifest, heroImage);
  const imagePlacements = buildLandingImagePlacements(
    campaign,
    manifest,
    heroImage,
    galleryImages,
    trustImages,
  );
  // Use verified entries for threshold progress when available.
  const thresholdSource = verifiedSummary ?? waitlistSummary;
  const percentOfThreshold = getPublicThresholdPercent(
    targetCabins,
    thresholdSource.totalEntries,
  );
  const designSystem = buildLandingDesignSystem(
    campaign,
    displayBrief,
    flavorOverride,
  );
  const itinerary = buildItinerarySummary(campaign);

  return {
    slug: campaign.id,
    preview,
    state: campaign.status,
    stateLabel: STATE_LABELS[campaign.status],
    title: campaign.name,
    heroSlogan: displayBrief?.messaging.heroSlogan ?? campaign.name,
    subSlogan: displayBrief?.messaging.subSlogan ?? sanitizeShipCopyForCampaign(campaign.description, campaign),
    elevatorPitch: displayBrief?.messaging.elevatorPitch ?? sanitizeShipCopyForCampaign(campaign.description, campaign),
    heroImage,
    galleryImages,
    trustImages,
    imagePlacements,
    accentColor: normalizeColorToken(
      displayBrief?.visual.colorPalette.accent,
      "#2962FF",
    ),
    surfaceColor: normalizeColorToken(
      displayBrief?.visual.colorPalette.background,
      "#0F172A",
    ),
    textColor: normalizeColorToken(
      displayBrief?.visual.colorPalette.textOnDark,
      "#F8FAFC",
    ),
    designSystem,
    itinerary,
    facts: buildFacts(campaign, waitlistSummary),
    story: {
      whatItIs: buildWhatItIs(campaign, displayBrief),
      whyJoinNow: buildWhyJoinNow(campaign),
      whatToExpect: buildWhatToExpect(campaign, displayBrief),
      howItWorks: buildHowItWorks(campaign, displayBrief),
      guestInvitations: buildGuestInvitations(campaign, displayBrief),
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
    experienceBullets: buildExperienceBullets(campaign, displayBrief),
    trustBullets: buildTrustBullets(campaign),
    bookingPathChoices: getBookingChoices(campaign, displayBrief),
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
