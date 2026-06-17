/**
 * Deal Discovery data contracts.
 *
 * Discovery is the FIRST step of the deal workflow (TO_FIX.md §"Workflow Order —
 * Research First, Package Second"; design in 6-10-26/DISCOVERY_LAB_DESIGN.md). It
 * reads the operator's last saved niche research (`discovery-research-cache.json`,
 * produced by the Group pipeline) and emits one or more SAILING ANGLE PROFILES —
 * direct-response retail cruise angles pitched to a passionate consumer/household.
 *
 * An angle is only accepted into the cache once it is GROUNDED: its two match
 * fields (onboardAssetRequirements, destinationAndTimeOfYearHints) are used to
 * search live Odysseus inventory right here in Discovery, and only an angle with
 * a real, high-confidence candidate (`groundedCandidate`) is kept. An angle must
 * never exist without real ship + sail-date candidates — see DealDiscoveryGroundedCandidate.
 */

import type { DealAiGenerationTrace } from "./campaign-types";

/**
 * A direct-response retail cruise angle generated from niche research. Pitched to
 * an independent consumer/household — never a group, meetup, club, or organized event.
 */
export interface SailingAngleProfile {
  /** Punchy 3–6 word thematic ad hook. */
  sailingAngleTitle: string;
  /** 2-sentence emotional direct-response pitch driving an immediate booking. */
  theCorePitch: string;
  /** Description of the high-contrast ad imagery matching the pitch. */
  visualAnchor: string;
  /** Specific buyer profile: lifestyle + household dynamic. */
  targetAudienceDescriptor: string;
  /** 6–8 hyper-targeted insider search terms / semantic tags for ad targeting. */
  relevantKeywords: string[];
  /** Strategic geographic + seasonal recommendations (inventory match key). */
  destinationAndTimeOfYearHints: string;
  /** Precise physical checklist of ship amenities / vessel style / layout (inventory match key). */
  onboardAssetRequirements: string;
}

/**
 * A real, bookable Odysseus sailing found at Discovery time that grounds this
 * angle — its ship, sail date, and nights ACTUALLY EXIST in inventory. Carried
 * forward into Step 2 (Trip Manifestation) so the manifest is built around this
 * verified candidate instead of re-searching and risking a different pick.
 */
export interface DealDiscoveryGroundedCandidate {
  /** When the grounding search ran. */
  resolvedAtIso: string;
  packageId: string;
  cruiseName: string;
  cruiseLine?: string;
  sailDateIso: string;
  nights?: number;
  departurePortCode?: string;
  portsOfCall?: string;
  /** 0..1 ranker confidence — gated at >= MATCH_CONFIDENCE_THRESHOLD to be accepted. */
  confidence: number;
  reasons: string[];
}

export interface DealDiscoveryIdea {
  /** Slug derived from the sailing angle title; idempotency key in the cache. */
  id: string;
  generatedAtIso: string;
  /** Always "gpt" — discovery angles are AI-generated (AI-FIRST mandate). */
  generator: "gpt";
  /** The saved-research date the angle was generated from, for traceability. */
  sourceResearchCachedAt?: string;
  /** The isolated niche identity this angle was derived from (Step 1). */
  isolatedNiche: string;
  /** The direct-response sailing angle (Step 2 output). */
  sailingAngleProfile: SailingAngleProfile;
  /**
   * The real Odysseus sailing that grounds this angle. REQUIRED for an angle to
   * exist in the cache — see the header comment. Step 2 builds its manifest
   * around this candidate instead of re-searching.
   */
  groundedCandidate: DealDiscoveryGroundedCandidate;
  /** AI provenance (model + prompt + raw response + latency). */
  aiTrace?: DealAiGenerationTrace;
}

export interface DealDiscoveryIdeasCache {
  version: 1;
  generatedAtIso: string;
  ideas: DealDiscoveryIdea[];
}
