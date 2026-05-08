# The "Ghost Group" Issue: Supplier Inventory vs. Portal Desync

**Date Discovered:** May 6, 2026  
**Status:** Urgent Architectural Challenge  
**Impacts:** Phase B (Discovery Matching), Campaign Live Status, Booking Integrity

## 1. What is a "Ghost Group"?

During campaign discovery (Phase B), the system successfully maps a campaign to a pre-existing group block on Cruise Brothers (CB) Agent Tools. The system scrapes the official "Personal Link" (e.g., `https://bookings.cbagenttools.com/swift/cruise/package/1556595?siid=1049337`) to be used as the `cbagenttoolsBookingLink` for the campaign's "Book Now" CTA.

However, when a guest clicks this link, the Odysseus/Swift booking engine redirects and throws an `Oops! Package Not Found` or `404` error.

**The Root Cause:** The cruise line supplier (e.g., Royal Caribbean) has pulled the inventory, sold out the block, or expired the rate. However, **Cruise Brothers has not updated their internal agent portal to reflect this.** CB still lists the group as active and generates a Personal Link, but the underlying package ID is dead on the live retail/booking engine side. We are mapping to a "Ghost Group."

## 2. Immediate Fixes Applied During Discovery Session

- **True Link Extraction:** We updated `scripts/cb-inventory-scraper.ts` so that Phase B now navigates directly to the group's detail page (`/groups/view_group/[id]/`) and extracts the _actual_ `href` from the DOM, instead of blindly guessing the `PACKAGE_ID` based on the `groupId`.
- **Routing Fix:** We updated `app/api/groups/campaign/[slug]/waitlist/route.ts` to ensure that all users (whether waitlisting or buying immediately) receive this persistent `cbagenttoolsBookingLink` rather than an expiring, session-based `odysseusRetailBookingLink`.

_While these fixes ensure we grab the exact link CB provides, they do not solve the problem of CB providing a dead link._

## 3. The Core Challenge for the Team

This issue introduces a severe risk: **We could spend marketing budget advertising a specific ship, date, and price, only for the booking link to be a dead end.**

We need to brainstorm and implement solutions across two distinct phases of the campaign lifecycle:

### A. Pre-Flight Validation (Phase B / Discovery)

We cannot trust that a group exists just because it is listed in the CB inventory list.

- **Requirement:** During Phase B matching, the automated scraper must actively test the `cbagenttoolsBookingLink` before committing it to the database.
- **Implementation Idea:** Have Playwright navigate to the extracted link and check the DOM for the `Oops! Package Not Found` error text. If it is a Ghost Group, the system must discard the match, penalize the item, and search for the next best group block.

### B. Mid-Campaign Monitoring (Live State)

Even if a group is valid at launch, the supplier can pull the block or the inventory can sell out _while our campaign is active and gathering leads_.

- **Requirement:** We need a scheduled cron job (e.g., running every 12-24 hours) that pings the booking links of all `GATHERING_INTEREST` and `THRESHOLD_MET` campaigns to verify they are still alive.
- **Implementation Idea:** A headless script that visits the URLs and alerts the team via Discord/Slack if a 404 is detected.

### C. The Contingency Dilemma (Brainstorming Needed)

If a group vanishes mid-campaign after we've already generated hype, produced assets, and run ads for a specific ship and date, what is the fallback protocol?

- **Option 1: Switch to Retail.** We programmatically swap the campaign to point to live retail inventory for the exact same sailing. The price may increase, and we lose the Tour Conductor credit, but the trip is saved.
- **Option 2: Agent Intervention.** We pause the campaign ads automatically, alert the master agent, and have a human call the CB Group Department to see if the block can be reinstated or expanded.
- **Option 3: Campaign Pivot.** We inform the waitlist that the sailing sold out early, and offer them priority access to a cloned campaign on a different ship/date.

## 4. Next Steps

1. **Review this document** with the core engineering and strategy team.
2. **Implement Pre-Flight Validation** into `scripts/run-phase-b.ts` immediately to prevent any new Ghost Groups from entering the `CB_MATCHED` state.
3. **Draft a SOP** for how the master agent should handle campaigns that fail the mid-campaign heartbeat check.
