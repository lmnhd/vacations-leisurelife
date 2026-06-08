/**
 * Agent Callback Request data contracts.
 *
 * One of the three public CTA options (Book now / Email me the booking link /
 * Request an agent callback). A callback request stores full deal/package/link
 * context and routes to email, dashboard, and Crisp where practical.
 *
 * The Link Broker never creates these directly (PHASE_0_BASELINE_GUARDRAILS.md
 * rule 3); a thin CTA route does. Operations land in Phase 13; this is the
 * Phase 1 schema.
 */

export type AgentCallbackStatus = "new" | "assigned" | "contacted" | "closed";

export type AgentCallbackCtaSource =
  | "book_now"
  | "email_link"
  | "request_callback";

export interface AgentCallbackRequest {
  id: string;
  createdAtIso: string;
  status: AgentCallbackStatus;
  ctaSource: AgentCallbackCtaSource;
  /** Visitor contact. Phone is sensitive; redact in logs. */
  visitor: {
    name?: string;
    email?: string;
    phone?: string;
    notes?: string;
  };
  deal: {
    dealId: string;
    dealTitle: string;
    cruiseLine?: string;
    shipName?: string;
    sailDateIso?: string;
    packageId?: string;
    primaryAngle?: string;
    promoNotes?: string[];
  };
  /** Link health of the booking path at request time. */
  linkHealthStatus?: "valid" | "stale" | "broken" | "unknown";
  /** Booking link attached to the request, when one was generated. */
  brokerLinkUrl?: string;
  routing: {
    emailNotified?: boolean;
    dashboardQueued?: boolean;
    crispNotified?: boolean;
  };
  assignedTo?: string;
  statusHistory: Array<{
    status: AgentCallbackStatus;
    changedAtIso: string;
    note?: string;
  }>;
}

export interface AgentCallbackRequestsCache {
  version: 1;
  generatedAtIso: string;
  requests: AgentCallbackRequest[];
}
