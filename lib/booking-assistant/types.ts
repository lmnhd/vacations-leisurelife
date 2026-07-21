/**
 * Canonical booking data model types.
 *
 * Single source of truth for all booking draft, traveler, cabin, contact,
 * decision, field-status, and journal-payload shapes.
 *
 * See implementation plan Section 10 for the authoritative field list.
 */

import type { BookingDraftStatus } from "./contracts";
import type { EncryptedBlob } from "./encryption";

// ── Sensitive data tiers (Section 11) ──────────────────────────────────────

export type SensitiveTier = "A" | "B" | "C" | "D";

// ── Field status contract (Section 10.7) ──────────────────────────────────

export type FieldStatus =
  | "missing"
  | "proposed"
  | "confirmed"
  | "stale"
  | "not_applicable"
  | "blocked";

export type FieldSource =
  | "guest_form"
  | "guest_voice"
  | "guest_chat"
  | "imported_profile"
  | "operator"
  | "odysseus";

export interface FieldStatusRecord {
  status: FieldStatus;
  source: FieldSource;
  confidence?: number;
  confirmedBy: string;
  confirmedAtIso?: string;
  lastUpdatedAtIso: string;
  sensitiveTier: SensitiveTier;
  validationErrors: string[];
  revision: number;
}

// ── Deal and price snapshot (Section 10.2) ─────────────────────────────────

export interface DealPriceSnapshot {
  dealId: string;
  packageId: string;
  siid: string;
  cruiseLine: string;
  ship: string;
  sailingDateIso: string;
  nights: number;
  departurePort: string;
  itineraryLabel: string;
  dealAngle: string;
  priceDisplay: string;
  currency: string;
  taxFeeBasis: string;
  priceCapturedAtIso: string;
  sourceBookingUrl: string;
  linkHealthState: "healthy" | "broken" | "unknown";
  observedTotal?: string;
  paymentSchedule?: string;
}

// ── Contact record (Section 10.3) ──────────────────────────────────────────

export interface ContactRecord {
  firstName: string;
  email: string;
  phoneE164: string;
  preferredChannel: "email" | "phone" | "sms";
  emailVerified: boolean;
  phoneVerified: boolean;
  transactionalEmailConsent: boolean;
  callbackConsent: boolean;
  smsConsent: boolean;
  marketingConsent: boolean;
}

// ── Traveler record (Section 10.4) ─────────────────────────────────────────

export type TravelerClassification = "adult" | "minor";

export type RateQualificationType =
  | "age_based"
  | "military"
  | "veteran"
  | "first_responder"
  | "government_civil_service"
  | "interline"
  | "family_member"
  | "other";

export type ClaimStatus = "candidate" | "claimed" | "verified" | "rejected";
export type ProofReadiness = "available_later" | "need_help" | "not_sure";

export interface RateQualificationClaim {
  type: RateQualificationType;
  broadCategory: string;
  claimStatus: ClaimStatus;
  proofReadiness: ProofReadiness;
  ruleVersion?: string;
  confirmedAtIso?: string;
}

export interface TravelerRecord {
  travelerId: string;
  isPrimary: boolean;
  relationship?: string;
  classification: TravelerClassification;
  ageAtSailing?: number;
  ageCalculationDateIso?: string;
  ageCalculationRuleVersion?: string;
  title?: string;
  supplierGender?: string;
  legalFirstName?: string;
  legalMiddleName?: string;
  legalLastName?: string;
  legalSuffix?: string;
  dateOfBirth?: string;
  nationality?: string;
  residencyCountry?: string;
  residencyStateProvince?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressCity?: string;
  addressState?: string;
  addressPostalCode?: string;
  addressCountry?: string;
  email?: string;
  phone?: string;
  loyaltyNumber?: string;
  pastPassengerNumber?: string;
  rateQualificationClaims: RateQualificationClaim[];
  accessibilityNeeds?: string;
  dietaryNeeds?: string;
  fieldStatuses: Record<string, FieldStatusRecord>;
}

// ── Cabin record (Section 10.5) ────────────────────────────────────────────

export interface RateCandidate {
  rateCandidateId: string;
  supplierRateCode: string;
  rateLabel: string;
  capturedAtIso: string;
  qualifiedTravelerIds: string[];
  totalIncludingTaxesFees: string;
  ordinaryRateBaselineTotal: string;
  depositSchedule?: string;
  cancellationRules?: string;
  cabinCategoryInventory?: string;
  includedBenefits?: string[];
  combinabilityResult?: string;
  proofType?: string;
  proofDeadline?: string;
  verificationStatus: ClaimStatus;
  ruleSourceVersion?: string;
}

export interface CabinRecord {
  cabinId: string;
  assignedTravelerIds: string[];
  categoryPreference?: string;
  farePreference?: string;
  cabinPreference?: string;
  acceptableTradeoffs?: string;
  selectedCategory?: string;
  selectedRate?: string;
  selectedCabin?: string;
  qualifyingTravelerIds: string[];
  rateCandidates: RateCandidate[];
  ordinaryRateBaseline?: string;
  selectedRateCandidateId?: string;
  savingsValueSummary?: string;
  notSelectedReasons?: string[];
  proofRequirementSnapshot?: string;
  priceSnapshot?: string;
  accessibilityRequirement?: string;
  selectionConfirmedAtIso?: string;
}

// ── Decisions and consents (Section 10.6) ──────────────────────────────────

export interface DecisionsAndConsents {
  bookingContactProfileId?: string;
  bookingContactConfigVersion?: string;
  servicesDecisionSet?: Record<string, boolean>;
  addOnDecisionSet?: Record<string, boolean>;
  travelInsuranceDecision?: string;
  insuranceDisclosureVersion?: string;
  passengerDataReviewConfirmed: boolean;
  packetStorageConsent: boolean;
  callDisclosureVersion?: string;
  callDisclosureAcknowledgedAtIso?: string;
  priceChangeConfirmations?: string[];
  qualifyingRateComparisonVersion?: string;
  selectedRateConfirmation?: string;
  termsPresentedVersion?: string;
  completionModeAcknowledgement?: string;
  paymentAmountScheduleInstruction?: string;
}

// ── Fallback call-key record (Section 10.1.1) ──────────────────────────────

export type CallKeyState = "active" | "revoked" | "consumed" | "expired";

export interface FallbackCallKeyRecord {
  keyVersion: number;
  state: CallKeyState;
  issuedAtIso: string;
  expiresAtIso?: string;
  closedAtIso?: string;
  packetVersion: number;
  callDisclosureVersion?: string;
  issuanceActor: string;
  issuanceReason: string;
  rotationActor?: string;
  rotationReason?: string;
  /** Encrypted raw display value for authorized guest display only. */
  encryptedRawValue?: EncryptedBlob;
  /** HMAC digest used for the authenticated operator lookup index. */
  lookupHmac: string;
}

// ── Draft metadata (Section 10.1) ──────────────────────────────────────────

export interface BookingDraftMetadata {
  bookingDraftId: string;
  personId: string;
  dealId: string;
  packageId: string;
  siid: string;
  status: BookingDraftStatus;
  urgency: "informational" | "normal" | "urgent";
  flowDefinitionVersion: number;
  bookingFlowVersion: number;
  completionMode: string;
  completionModeVersion: number;
  completionCapabilitySnapshot?: string;
  completionModeSelectedAtIso?: string;
  completionFallbackReason?: string;
  packetVersion: number;
  callDisclosureVersion?: string;
  callKeyVersion?: number;
  callKeyState?: CallKeyState;
  callKeyIssuedAtIso?: string;
  callKeyExpiresAtIso?: string;
  readyToCallAtIso?: string;
  callLaunchRequestedAtIso?: string;
  activeCallAttemptId?: string;
  callIntentExpiresAtIso?: string;
  odysseusContractVersion?: string;
  createdAtIso: string;
  updatedAtIso: string;
  lastGuestActivityAtIso: string;
  lastMeaningfulGuestActivityAtIso: string;
  lastOperatorActivityAtIso?: string;
  lastConversationAtIso?: string;
  currentInteractionSessionId?: string;
  journalSequence: number;
  lastJournalEventAtIso?: string;
  pausedAtIso?: string;
  pausedFromStatus?: BookingDraftStatus;
  resumeTaskId?: string;
  version: number;
  attribution?: Record<string, string>;
  assignedOperatorId?: string;
  claimLeaseExpiresAtIso?: string;
  completionSummary?: string;
  nextTaskId?: string;
}

// ── Complete draft aggregate ───────────────────────────────────────────────

export interface BookingDraft {
  metadata: BookingDraftMetadata;
  dealSnapshot: DealPriceSnapshot;
  contact: ContactRecord;
  travelers: TravelerRecord[];
  cabins: CabinRecord[];
  decisions: DecisionsAndConsents;
  fallbackCallKey?: FallbackCallKeyRecord;
}

// ── DynamoDB item shapes (Section 12.1) ────────────────────────────────────

export interface DraftMetaItem {
  pk: string;
  sk: "META";
  status: BookingDraftStatus;
  urgency: string;
  flowDefinitionVersion: number;
  bookingFlowVersion: number;
  completionMode: string;
  completionModeVersion: number;
  packetVersion: number;
  version: number;
  journalSequence: number;
  createdAtIso: string;
  updatedAtIso: string;
  lastGuestActivityAtIso: string;
  lastMeaningfulGuestActivityAtIso: string;
  dealId: string;
  packageId: string;
  personId: string;
  nextTaskId?: string;
  resumeTaskId?: string;
  assignedOperatorId?: string;
  claimLeaseExpiresAtIso?: string;
  readyToCallAtIso?: string;
  callKeyState?: CallKeyState;
  activeCallAttemptId?: string;
  callIntentExpiresAtIso?: string;
  // GSI1: status#urgency -> updatedAtIso
  gsi1pk: string;
  gsi1sk: string;
  // GSI2: personId -> updatedAtIso
  gsi2pk: string;
  gsi2sk: string;
}

export interface DraftContactItem {
  pk: string;
  sk: "CONTACT";
  encryptedContact: EncryptedBlob;
  updatedAtIso: string;
  version: number;
}

export interface DraftTravelerItem {
  pk: string;
  sk: string;
  travelerId: string;
  isPrimary: boolean;
  encryptedTraveler: EncryptedBlob;
  updatedAtIso: string;
  version: number;
}

export interface DraftCabinItem {
  pk: string;
  sk: string;
  cabinId: string;
  encryptedCabin: EncryptedBlob;
  updatedAtIso: string;
  version: number;
}

export interface DraftDecisionsItem {
  pk: string;
  sk: "DECISIONS";
  encryptedDecisions: EncryptedBlob;
  updatedAtIso: string;
  version: number;
}

export interface DraftCallKeyItem {
  pk: string;
  sk: "CALL_KEY";
  keyVersion: number;
  state: CallKeyState;
  issuedAtIso: string;
  packetVersion: number;
  lookupHmac: string;
  encryptedRawValue?: EncryptedBlob;
  updatedAtIso: string;
}

export interface CallKeyLookupItem {
  pk: string;
  sk: string;
  draftId: string;
  state: CallKeyState;
  issuedAtIso: string;
}

export interface JournalEventItem {
  pk: string;
  sk: string;
  journalEventId: string;
  eventType: string;
  actorType: string;
  occurredAtIso: string;
  privacyClass: string;
  idempotencyKey: string;
  expectedDraftVersion: number;
  sequence: number;
  payload: Record<string, unknown>;
}

// ── Operator queue card (Section 17.1) ─────────────────────────────────────

export interface OperatorQueueCard {
  bookingDraftId: string;
  firstName: string;
  dealSummary: string;
  status: BookingDraftStatus;
  completionPct: number;
  urgency: string;
  lastActivityIso: string;
  missingSections: string[];
  channels: string[];
  callKeyState?: CallKeyState;
  readyToCallAge?: string;
  assignedOperatorId?: string;
  activeCallAttemptId?: string;
  callIntentExpiresAtIso?: string;
}

// ── Call intent signal for operator display ────────────────────────────────

export interface OperatorCallIntentDisplay {
  callAttemptId: string;
  draftId: string;
  maskedCallerSummary: string;
  dealSummary: string;
  packetVersion: number;
  publishedAtIso: string;
  expiresAtIso: string;
  acknowledged: boolean;
  callerIdState?: string;
  callerVerified: boolean;
  status: BookingDraftStatus;
}
