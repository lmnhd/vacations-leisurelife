# Inventory Health and Failover Plan

**Status:** Planning draft  
**Created:** May 8, 2026  
**Related:** [README.md](README.md)  
**Scope:** Ghost Group prevention, backup inventory, retail conversion, and consumer-facing disclosure.

---

## 1. Working Principle

The system must never silently switch the consumer promise.

If a campaign launches as an official group-block offer, the page, booking flow, chat, email, and paid ads must continue to describe that exact promise only while the group block is actually healthy. If the group block fails, the campaign can continue, but the public promise must change visibly before guests are asked to act.

This is not just a compliance issue. It protects trust. A guest who joins because they saw "confirmed group pricing" should not later discover that the booking path became retail inventory with different pricing, cabin proximity, or amenities.

---

## 2. Upfront Consumer Disclosure

The page should set expectations earlier than it does today. The current trust language says the page does not take payment and that the trip can close if the cabin target is not reached, but it does not clearly explain that inventory can change before the campaign converts.

Recommended disclosure locations:

1. **Process section**
   Add a plain-language note near "How it works":

   > Cruise inventory can change while a group is forming. We verify the sailing before launch and keep checking it while interest builds. If the group block changes, we will either switch to a verified backup, offer an individual-booking path for the same sailing, or pause the campaign instead of sending you to a dead booking page.

2. **Trust section**
   Add a more specific booking-integrity bullet:

   > Group pricing, cabin availability, and group amenities are subject to supplier inventory. If the official group block is no longer available, we will clearly mark the page before offering any alternate booking path.

3. **First-visit modal or disclosure sheet**
   A first-visit modal can work if it is short and calm. It should not feel like legal panic. The best shape is a one-time "How this group forms" sheet with three points:

   - You are joining interest first, not paying on this page.
   - We verify the group block before launch and monitor it while the campaign is active.
   - If inventory changes, the page will clearly show whether the next path is a backup group, individual booking, or campaign pause.

   Store dismissal in local storage per campaign slug, for example `campaign-disclosure:board-games-at-sea`.

4. **Form acknowledgement**
   The form does not need a heavy checkbox unless legal review wants one. A short note near submit is enough for now:

   > By joining, you are asking for updates on this sailing. Booking details may change if supplier inventory changes before the group is finalized.

---

## 3. Inventory Strategy

The system should treat inventory as a health-managed portfolio, not a single link.

Recommended model:

```ts
type CampaignInventoryMode =
  | "GROUP_BLOCK_ACTIVE"
  | "GROUP_BACKUP_SWITCHED"
  | "RETAIL_MULTI_BOOKING"
  | "INVENTORY_FAILED_PAUSED";

type InventoryHealthStatus =
  | "UNVERIFIED"
  | "HEALTHY"
  | "DEGRADED"
  | "FAILED";

interface CampaignInventoryCandidate {
  rank: number;
  source: "CB_GROUP" | "ODYSSEUS_RETAIL";
  groupId?: string;
  personalLink?: string;
  retailLink?: string;
  shipName: string;
  sailDate: string;
  departurePort?: string;
  nights?: string;
  startingPrice?: number;
  priceSource: string;
  matchScore: number;
  priceDeltaFromPrimary?: number;
  promiseDelta: "NONE" | "PRICE_ONLY" | "AMENITIES_CHANGED" | "SHIP_OR_DATE_CHANGED";
  healthStatus: InventoryHealthStatus;
  lastCheckedAt?: string;
  failureReason?: string;
}
```

Current state:

- `matchGroupInventoryToCampaign()` returns one best match.
- `run-phase-b.ts` writes one `cbagenttoolsBookingLink` and one `odysseusRetailBookingLink`.
- The campaign does not store backup candidates or inventory health evidence.

Target state:

- Phase B ranks multiple candidates.
- The top candidate becomes primary only after link validation passes.
- The next 2-3 viable candidates are stored as backups.
- A retail fallback for the same sailing is generated and validated separately.
- The campaign stores active inventory mode plus the health status of each candidate.

---

## 4. Pre-Flight Validation

A group match should not be approved just because it appears in the CB group inventory list.

Before writing `CB_MATCHED`, Phase B should physically test:

- CB group detail page opens.
- Personal booking link exists on the group detail page.
- Personal booking link opens in a browser session.
- Page does not show `Oops`, `Package Not Found`, expired package copy, login loops, or repeated redirects.
- Booking engine exposes expected itinerary/cabin/category content.
- Price and ship/date still match the campaign enough to preserve the public promise.

Validation should use Playwright, not HTTP status alone. These booking engines can return `200` or redirect successfully while still rendering a dead-end page.

Suggested result shape:

```ts
interface BookingLinkValidationResult {
  status: "HEALTHY" | "FAILED" | "DEGRADED";
  checkedAt: string;
  url: string;
  finalUrl?: string;
  pageTitle?: string;
  detectedText?: string[];
  hasBookableCabins?: boolean;
  failureReason?: string;
  screenshotPath?: string;
}
```

Failure should exclude the candidate from becoming primary. If backups exist, the next healthy candidate is promoted. If no group candidate survives, the campaign should either remain in draft or enter retail-only review.

---

## 5. Backup Candidate Policy

Backups should be ranked, but they should not be treated as interchangeable.

Recommended backup rules:

- **Tier 1 backup:** same ship, same sail date, same departure port, acceptable price delta.
- **Tier 2 backup:** same ship, nearby sail date, same departure region, clear page-copy change required.
- **Tier 3 backup:** same destination/length, different ship/date, campaign likely needs operator approval and media copy review.

Only Tier 1 should be eligible for a mostly automatic switch. Tier 2 and Tier 3 change the consumer promise too much to swap silently.

Suggested policy knobs:

```ts
const MAX_AUTO_PRICE_DELTA_PERCENT = 10;
const MAX_AUTO_DATE_DELTA_DAYS = 0;
const REQUIRE_SAME_SHIP_FOR_AUTO_SWITCH = true;
const REQUIRE_SAME_DEPARTURE_PORT_FOR_AUTO_SWITCH = true;
```

If a backup switch changes the advertised price, ship, date, or amenities, the page should show an "Inventory updated" notice and paid distribution should pause until review.

---

## 6. Retail Multi-Booking Mode

Retail multi-booking is the practical final fallback when the group block disappears and no equivalent backup group is healthy.

This should be a deliberate campaign mode, not just a different link.

In `RETAIL_MULTI_BOOKING` mode, the campaign promise becomes:

- same sailing if possible
- individual bookings instead of official group block
- live retail pricing, not locked group pricing
- cabin proximity requested but not guaranteed
- group amenities may not apply
- Tour Conductor credit may not apply
- the team can still coordinate communication, dining requests, and optional meetups where the cruise line allows

Recommended page copy:

> The official group block for this sailing is no longer available. We can still help guests book the same cruise individually and coordinate the group experience where possible. Pricing, cabin location, and group-specific amenities may differ from the original group offer.

Recommended internal behavior:

- Keep the waitlist and chat active if interest is strong.
- Change pricing source label from "Confirmed group pricing" to "Live individual-booking estimate."
- Keep "Join the list" as the main CTA.
- Keep "Book now" as a secondary path to the validated retail link.
- Add an operator task list for guests with high intent:
  - preferred cabin type
  - passenger count
  - dining preference
  - cabin proximity preference
  - booking readiness

This mode preserves the business opportunity without pretending the group block still exists.

---

## 7. Live Heartbeat

Once a campaign is public, inventory should be rechecked on a schedule.

Suggested cadence:

- `DRAFT`: check during approval only.
- `GATHERING_INTEREST`: daily.
- `GATHERING_INTEREST` with paid ads active: every 4-6 hours.
- `THRESHOLD_MET`: every 4-6 hours until booking handoff is complete.
- `CONVERTED`: stop checking unless there are unresolved booking handoffs.

Heartbeat checks should validate:

- primary group link
- backup group links
- retail fallback link
- price drift
- visible cabin/category availability
- redirect or session-loop failure

When a heartbeat fails:

1. Mark candidate `FAILED`.
2. Pause paid distribution if active.
3. Promote healthy Tier 1 backup if available.
4. Otherwise switch to review-required retail mode if retail is healthy.
5. Otherwise set `INVENTORY_FAILED_PAUSED`.
6. Surface the failure in the test/review UI.

---

## 8. Implementation Fit With Current Repo

Near-term changes:

- Add a ranked matcher alongside `matchGroupInventoryToCampaign()` rather than replacing the existing function immediately.
- Add a Playwright validator that can test both CB group links and Odysseus retail links.
- Extend `upsertCampaignPricingMatch()` to store inventory candidates and health status.
- Update the landing view model to expose `activeBookingMode`, `inventoryHealth`, and consumer-safe disclosure copy.
- Update `GuestPortal` trust/process sections to display the correct promise for the active mode.

Medium-term changes:

- Add a scheduled inventory heartbeat route or script.
- Add review UI warnings when a campaign has no verified backup.
- Add paid-distribution guardrails so ads cannot launch against `UNVERIFIED`, `FAILED`, or stale inventory.
- Add email/chat copy for retail conversion events.

Do not start by building the whole retail multi-booking workflow. Start by making inventory health explicit, because that gives every later decision a reliable signal.

---

## 9. Cancellation and Guest Communication

If a campaign loses its group block or inventory path mid-stream, communication should be immediate, plainspoken, and specific. Guests should never discover the problem by clicking a broken link or by noticing that the page quietly changed.

### Trigger conditions

Send a guest-facing update when any of these happen:

- the primary group block fails validation and no equivalent Tier 1 backup exists
- the campaign switches from `GROUP_BLOCK_ACTIVE` to `RETAIL_MULTI_BOOKING`
- the campaign changes ship, sail date, departure port, or price beyond review thresholds
- the campaign is paused because no healthy booking path remains

### Channel policy

- **Email:** always send for any meaningful inventory failure, mode switch, or cancellation. Email is the durable source of record and is the right place for context, alternatives, and next steps.
- **SMS:** send only to guests who gave consent and only for urgent changes that affect booking readiness. SMS should be short and should point back to email or the updated campaign page.
- **Landing page + chat hall:** update both at the same time. The page should reflect the new state before or at the same moment the outbound message is sent.

### Communication sequence

1. Mark the campaign state internally.
2. Pause paid distribution if the promise has materially changed.
3. Update the landing page banner, trust/process copy, and booking mode.
4. Send the email to all active leads.
5. Send SMS to high-intent or consented leads when the change is urgent.
6. Post a pinned Tour Conductor / campaign update in the chat hall so returning guests see the same explanation in-product.

### Message types

**A. Backup group switch, same promise mostly intact**

Use when:

- same ship
- same sail date
- same departure port
- acceptable price delta

Recommended tone:

> We re-verified the sailing and updated the inventory source behind this trip. The overall trip remains available, and the page now reflects the latest booking path.

This can be relatively calm because the guest-facing promise is mostly intact.

**B. Retail multi-booking conversion**

Use when the group block is no longer available but the same sailing can still be booked individually.

Recommended tone:

> The original group block for this sailing is no longer available. We can still help you book the same cruise individually and coordinate the experience where possible. Pricing, cabin location, and group-specific amenities may differ from the original offer.

This message should include:

- the updated price framing
- whether the sailing is still the same
- whether cabin proximity can be requested
- whether group amenities may change
- a clear link back to the updated page

**C. Campaign pause or cancellation**

Use when there is no healthy group path, no acceptable backup, and no viable retail fallback worth presenting.

Recommended tone:

> We are pausing this sailing because the original inventory is no longer available in a way we can stand behind. Rather than send guests into an uncertain booking path, we are stopping this version of the offer and will follow up with the best available alternative.

This should never read like a vague marketing delay. It should name the reason as inventory integrity.

### Alternative offers

When sending a cancellation or failure notice, the message should not stop at "sorry." It should offer the next best path:

- the same sailing through individual booking, if healthy
- the best verified backup sailing, if consumer promise drift is acceptable
- a nearby replacement cruise curated for the same audience, if the original trip is gone

For this system, the cleanest fallback bundle is:

- `Option 1:` same sailing, individual booking
- `Option 2:` closest verified backup group or same-ship alternative
- `Option 3:` notify me when a stronger replacement opens

### Audience segmentation

Not every lead needs the same message depth.

- **All leads:** receive the baseline transparency email.
- **High-intent leads** (`BOOK_NOW`, repeat visitors, guests near threshold, guests who clicked booking links): receive a more direct alternative offer and optional SMS.
- **Already converted guests:** should get a separate operator-reviewed communication path because their needs are closer to servicing than marketing.

### Suggested implementation fit

The repo already has nurture plumbing in [nurture-orchestrator.ts](/C:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/nurture-orchestrator.ts) and waitlist/SMS consent handling in [route.ts](/C:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/app/api/groups/campaign/[slug]/waitlist/route.ts). The simplest next step is to add new transactional message types for:

- `inventory_changed`
- `retail_conversion_notice`
- `campaign_paused_inventory`
- `replacement_offer_ready`

Those should be event-driven from inventory heartbeat or failover transitions rather than manually triggered ad hoc.

### Operational rule

If the campaign promise materially changes, the system should assume communication is part of the state transition itself, not an optional follow-up.

---

## 10. Open Questions

- What price delta is acceptable before the page must require manual review?
- Should a same-ship different-date backup ever be auto-promoted, or always require approval?
- How much of "near each other" can be promised for individual bookings? The safest wording is "we will try to coordinate nearby cabins when inventory allows."
- Should first-visit disclosure be required only while the campaign is in `GATHERING_INTEREST`, or also in public preview?
- Should paid distribution be blocked unless the campaign has at least one verified backup or a verified retail fallback?

---

## 11. Recommended Next Move

The next implementation milestone should be:

1. Add ranked backup candidate generation in Phase B.
2. Add Playwright booking-link validation before approval.
3. Store health evidence and active booking mode on the campaign.
4. Add visible landing-page disclosure for inventory-change scenarios.

That sequence keeps the already-built landing, chat, waitlist, and media system intact while adding the missing booking integrity layer underneath it.
