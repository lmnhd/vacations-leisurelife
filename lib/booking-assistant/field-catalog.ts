export type BookingFieldPrivacy = "tier_a" | "tier_b" | "tier_c";
export type BookingFieldValueType = "text" | "email" | "phone" | "integer" | "boolean" | "object";

export interface BookingFieldDefinition {
  fieldId: string;
  taskId: string;
  valueType: BookingFieldValueType;
  privacy: BookingFieldPrivacy;
  required: boolean;
  maximumTextLength?: number;
}

const DEFINITIONS: readonly BookingFieldDefinition[] = [
  { fieldId: "contact.first_name", taskId: "first_name", valueType: "text", privacy: "tier_b", required: true, maximumTextLength: 80 },
  { fieldId: "contact.email", taskId: "email", valueType: "email", privacy: "tier_b", required: true, maximumTextLength: 254 },
  { fieldId: "contact.phone", taskId: "phone", valueType: "phone", privacy: "tier_b", required: true, maximumTextLength: 32 },
  { fieldId: "party.size", taskId: "party_size", valueType: "integer", privacy: "tier_a", required: true },
  { fieldId: "travelers.ages", taskId: "ages", valueType: "object", privacy: "tier_b", required: true },
  { fieldId: "travelers.legal_identity", taskId: "legal_identity", valueType: "object", privacy: "tier_c", required: true },
  { fieldId: "travelers.citizenship_residency", taskId: "citizenship_residency", valueType: "object", privacy: "tier_c", required: true },
  { fieldId: "savings.qualification_claims", taskId: "savings_eligibility", valueType: "object", privacy: "tier_c", required: true },
  { fieldId: "contact.address", taskId: "address", valueType: "object", privacy: "tier_c", required: true },
  { fieldId: "preferences.accessibility", taskId: "accessibility", valueType: "text", privacy: "tier_c", required: true, maximumTextLength: 1000 },
  { fieldId: "preferences.cabin", taskId: "cabin_preference", valueType: "text", privacy: "tier_a", required: true, maximumTextLength: 120 },
  { fieldId: "preferences.celebration", taskId: "celebration", valueType: "text", privacy: "tier_b", required: false, maximumTextLength: 300 },
  { fieldId: "preferences.insurance", taskId: "insurance_interest", valueType: "text", privacy: "tier_a", required: true, maximumTextLength: 120 },
  { fieldId: "review.confirmation", taskId: "review", valueType: "object", privacy: "tier_a", required: true },
];

export const BOOKING_FIELD_CATALOG_VERSION = 1;
export const BOOKING_FIELD_CATALOG = DEFINITIONS;

export function getBookingFieldDefinition(fieldId: string): BookingFieldDefinition | null {
  if (fieldId.startsWith("travelers.legal_identity.")) {
    return DEFINITIONS.find((definition) => definition.fieldId === "travelers.legal_identity") ?? null;
  }
  return DEFINITIONS.find((definition) => definition.fieldId === fieldId) ?? null;
}

export function validateBookingFieldValue(
  definition: BookingFieldDefinition,
  value: unknown
): string | null {
  if (definition.valueType === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "An object value is required";
    return null;
  }
  if (definition.valueType === "integer") {
    return Number.isInteger(value) ? null : "An integer value is required";
  }
  if (definition.valueType === "boolean") {
    return typeof value === "boolean" ? null : "A boolean value is required";
  }
  if (typeof value !== "string") return "A text value is required";
  const trimmed = value.trim();
  if (definition.required && trimmed.length === 0) return "A value is required";
  if (definition.maximumTextLength && trimmed.length > definition.maximumTextLength) {
    return `Value exceeds ${definition.maximumTextLength} characters`;
  }
  if (definition.valueType === "email") {
    const at = trimmed.indexOf("@");
    if (at <= 0 || at !== trimmed.lastIndexOf("@") || trimmed.slice(at + 1).indexOf(".") <= 0) {
      return "A valid email address is required";
    }
  }
  return null;
}
