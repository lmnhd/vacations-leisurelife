/**
 * Deal activity event contracts — the Deals-side analog of the Group Campaign
 * lead-event spine (`lib/campaigns/types.ts` `CampaignLeadEvent`).
 *
 * Append-only events recorded against a published Deal so the operator can see
 * page reach, engagement, and contact actions (email-the-link / callback) for
 * any chosen active deal — mirroring the conversion tracking campaigns already
 * have. Stored in the existing `lll-deals-system` DynamoDB table under a
 * per-deal events partition:
 *
 *   PK = DEAL#${dealId}#EVENTS
 *   SK = EVENT#${occurredAt}#${eventId}
 *
 * This sits alongside the deal's metadata record (`PK = DEAL#${id}`, `SK =
 * METADATA`), so one Query on the events partition returns the full timeline.
 */

import type { LeadAttribution } from "@/lib/campaigns/types";

export type DealEventType =
  // Reach + engagement (anonymous, beacon-driven)
  | "deal_page_view" // raw per-session reach
  | "deal_engaged" // one-time-per-browser qualified view
  | "book_now_click" // visitor clicked the CB booking handoff
  // Contact actions (may carry an email)
  | "link_requested" // "email me the booking link" submitted
  | "link_email_sent" // the link email was actually dispatched
  | "callback_requested" // "request an agent callback" submitted
  | "callback_contacted" // operator marked the callback contacted
  | "callback_closed"; // operator closed the callback

/**
 * One append-only Deal activity event.
 *
 * `email` is `anonymous` for reach/engagement; a real address for contact
 * actions where the visitor supplied one.
 */
export interface DealEvent {
  /** DynamoDB Partition Key: `DEAL#${dealId}#EVENTS` */
  PK: string;
  /** DynamoDB Sort Key: `EVENT#${occurredAt}#${eventId}` */
  SK: string;
  eventId: string;
  dealId: string;
  email: string;
  eventType: DealEventType;
  occurredAt: string;
  attribution: LeadAttribution;
  notes?: string;
  metadata?: Record<string, string>;
}
