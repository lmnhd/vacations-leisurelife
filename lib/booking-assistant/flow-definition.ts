import { BOOKING_FIELD_CATALOG_VERSION } from "./field-catalog";

export interface ServerTaskDefinition {
  taskId: string;
  section: string;
  title: string;
  fieldIds: readonly string[];
  dependsOn?: readonly string[];
  optional?: boolean;
}

export interface BookingFlowDefinition {
  flowId: "deal_booking_completion/call_agent_to_finalize_v1";
  version: 1;
  fieldCatalogVersion: number;
  tasks: readonly ServerTaskDefinition[];
}

export const PILOT_FLOW_DEFINITION: BookingFlowDefinition = {
  flowId: "deal_booking_completion/call_agent_to_finalize_v1",
  version: 1,
  fieldCatalogVersion: BOOKING_FIELD_CATALOG_VERSION,
  tasks: [
    { taskId: "first_name", section: "Contact", title: "What should we call you?", fieldIds: ["contact.first_name"] },
    { taskId: "email", section: "Contact", title: "Where should we email your saved progress?", fieldIds: ["contact.email"] },
    { taskId: "phone", section: "Contact", title: "What's the best mobile number for you?", fieldIds: ["contact.phone"] },
    { taskId: "party_size", section: "Passenger details", title: "How many people are sailing?", fieldIds: ["party.size"] },
    { taskId: "ages", section: "Passenger details", title: "How old will each traveler be on sailing day?", fieldIds: ["travelers.ages"], dependsOn: ["party_size"] },
    { taskId: "legal_identity", section: "Passenger details", title: "Legal details", fieldIds: ["travelers.legal_identity"], dependsOn: ["party_size"] },
    { taskId: "citizenship_residency", section: "Passenger details", title: "Citizenship and home state", fieldIds: ["travelers.citizenship_residency"] },
    { taskId: "savings_eligibility", section: "Savings check", title: "Check possible qualifying rates", fieldIds: ["savings.qualification_claims"], dependsOn: ["ages"] },
    { taskId: "address", section: "Passenger details", title: "Primary traveler's mailing address", fieldIds: ["contact.address"] },
    { taskId: "accessibility", section: "Preferences", title: "Accessibility or special requests", fieldIds: ["preferences.accessibility"] },
    { taskId: "cabin_preference", section: "Preferences", title: "Cabin preference", fieldIds: ["preferences.cabin"] },
    { taskId: "celebration", section: "Preferences", title: "Celebration", fieldIds: ["preferences.celebration"], optional: true },
    { taskId: "insurance_interest", section: "Preferences", title: "Travel insurance interest", fieldIds: ["preferences.insurance"] },
    { taskId: "review", section: "Review", title: "Review everything we have", fieldIds: ["review.confirmation"] },
  ],
};

export function getPilotFlowDefinition(): BookingFlowDefinition {
  return PILOT_FLOW_DEFINITION;
}
