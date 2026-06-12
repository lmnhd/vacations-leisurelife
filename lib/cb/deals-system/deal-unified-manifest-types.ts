/**
 * Deal Unified Manifest — the single artifact passed into Step 3 (Copywriter).
 *
 * Multi-agent pipelines drift when a downstream agent has to re-guess what an
 * upstream agent decided. The unified manifest prevents that: it bundles BOTH the
 * Step 1 creative brief (the SailingAngleProfile — voice, insider hooks, pain
 * points, visual anchor) AND the Step 2 inventory manifest (cruise line, ship
 * class, itinerary, dates, applied promos, promo strategy) into one object so the
 * copywriter expands a known hook against known constraints — it never originates.
 *
 * It is assembled deterministically (no AI) from a DealDiscoveryIdea + its
 * DealTripManifest by `assembleDealUnifiedManifest`.
 */

import type { SailingAngleProfile } from "./deal-discovery-types";
import type {
  DealManifestAssembleDraft,
  DealManifestLookupQuery,
} from "./deal-trip-manifest-types";
import type { PromoApplicabilityResult } from "./promo-intelligence-types";

/** Step 1 half — the creative brief (the "why" + the voice). */
export interface DealUnifiedCreativeBrief {
  isolatedNiche: string;
  angle: SailingAngleProfile;
}

/** Step 2 half — the inventory + promo manifest (the "what / where / perks"). */
export interface DealUnifiedInventoryManifest {
  assembleDraft: DealManifestAssembleDraft;
  lookupQuery: DealManifestLookupQuery;
  appliedPromos: PromoApplicabilityResult[];
  promoStrategy: string;
  manifestReasoning: string;
}

export interface DealUnifiedManifest {
  /** Slug; idempotency key in the cache. */
  id: string;
  generatedAtIso: string;
  /** Optional public visibility cutoff carried from the trip manifest. */
  expiresOnIso?: string;
  /** Provenance — the angle + trip-manifest this was stitched from. */
  sourceAngleId: string;
  sourceManifestId: string;
  /** Carried for display. */
  sailingAngleTitle: string;
  creativeBrief: DealUnifiedCreativeBrief;
  inventoryManifest: DealUnifiedInventoryManifest;
}

export interface DealUnifiedManifestsCache {
  version: 1;
  generatedAtIso: string;
  manifests: DealUnifiedManifest[];
}
