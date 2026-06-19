# Home Page Deals System - Next Agent Handoff

## Current Direction

The Deals system is a full Deal campaign development pipeline. The operator
develops a Deal end-to-end inside the workbench at `/tests/deals-system` before
anything reaches the public. The pipeline stages run independently and in order:

```text
research -> targeting -> pitch -> copy -> ad_structure -> media -> approval
```

The pitch stage (Phase 9B) is the explicit boundary between internal research
and customer-facing copy. Research output is analyst voice - context for the
operator and the AI. The pitch brief is the first thing written in customer
voice. Copy is then generated from the pitch brief, not from research strings.

## Hard Publishing Rule

A Deal may appear publicly only after all of these are true:

- `status === "bookable"`
- `operatorApproval.status === "approved"`
- `linkHealth.status === "valid"`
- `pitchBrief` exists
- public copy has no red flags
- Targeting-Demographic exists
- media/ad readiness is approved or text-only waived

## What Exists

### Pipeline stages

| Stage          | Output                    | Voice       |
|----------------|---------------------------|-------------|
| research       | `DealAngleResearch`       | Internal    |
| targeting      | `DealTargetingDemographic`| Internal    |
| pitch          | `DealPitchBrief`          | Customer    |
| copy           | `DealCopyPackage`         | Customer    |
| ad_structure   | `DealAdStructure`         | Internal    |
| media          | `DealMediaPlan`           | Internal    |
| approval       | `DealApprovalState`       | Gate        |

`generateDealCopyPackage` requires a `DealPitchBrief` parameter. The research ->
pitch -> copy order is enforced at the type level.

### Public surface

`getPublicDealTiles` / `getPublicDealPageById` in `public-deals.ts` read only
`isDealHomepageEligible` Deals and project them through `public-deal-projection.ts`
into narrow, public-safe shapes. The projection never exposes `researchRationale`,
agent-only notes, ad structure, targeting internals, or approval state.

### Committed Deal

`deal-rcl-southern-caribbean-1619969` (RCL Southern Caribbean, package 1619969)
is in the cache as `bookable` / `approved` / `valid`. It has a pitch brief, copy
package, and all campaign stages. Its link was marked valid by operator assertion
- run live `validateBrokerLink` before using it in production.

### CTA workflow (Phase 11/12)

| CTA                       | Route                              | Behavior |
|---------------------------|-------------------------------------|----------|
| Book now                  | (direct link)                       | opens `bookingUrl` |
| Email me the booking link | `POST /api/deals/link-request`      | upserts a Klaviyo profile and tracks `LLL Deal Link Requested`; the Klaviyo flow sends the prepared booking link by email and the UI does not open the booking portal |
| Request an agent callback | `POST /api/deals/callback-request`  | stores an `AgentCallbackRequest` in `deal-callback-requests-cache.json`, sends a Pushover admin notification |

`LLL Deal Link Requested` needs a Klaviyo flow configured against that metric
before live email delivery is observable end-to-end - `sendDealLinkEmail` in
`lib/cb/deals-system/deal-link-email.ts` reports `emailDelivered: false` if the
Klaviyo call itself fails, so the UI never claims a silent send.

### Callback operations dashboard (Phase 13)

`/tests/deals-system` renders a "Callback Requests" panel
(`app/(tests)/tests/deals-system/callback-requests-panel.tsx`) for every
`AgentCallbackRequest` in `deal-callback-requests-cache.json`. Each card shows
the deal/cruise context, visitor contact info (name/email/phone/notes), link
health, routing badges, and status history, plus buttons to mark the request
`assigned` / `contacted` / `closed` (with an optional note) via
`POST /api/tests/deals-system/callback-status`. `routing.dashboardQueued` is
set to `true` when the callback-request route creates the record, and flips
back to `false` the first time the operator changes its status. The route also
sends a Pushover admin alert using `PUSHOVER_API_TOKEN` and
`PUSHOVER_RECIPIENT_KEY`; supplied email and phone details are included in the alert so the operator can respond immediately.

### Production operator dashboard (Phase 14)

`/admin/deals-system` (`app/admin/deals-system/page.tsx`, `app/admin/layout.tsx`)
is the production operator dashboard, rendering the same
`DealsSystemDashboardView` (`app/(tests)/tests/deals-system/dashboard-view.tsx`)
as `/tests/deals-system`. Both routes share every panel and component; only the
header copy and refresh link differ. There is no additional auth layer yet -
this matches the existing `/tests/deals-system` exposure level. Add access
control here if/when this dashboard is exposed beyond trusted operators.

The Curated Deal Campaign Workbench gained homepage-visibility and
link/capture operator actions, all via `POST /api/tests/deals-system/curated-deal`:

| Action            | Effect |
|-------------------|--------|
| `pin` / `unpin`   | Sets `operatorVisibility.pinned`; pinned Deals sort first in `getPublicDealTiles`. |
| `hide` / `unhide` | Sets `operatorVisibility.hidden`; hidden Deals are excluded from `isDealHomepageEligible` even if otherwise eligible. |
| `refresh_link`    | Sets `linkHealth.status` to `"stale"` with a note, so the Deal drops out of the homepage gate until the operator re-verifies and runs `set_link_valid`. |
| `request_capture` | Appends a `[capture requested]` note to `agentOnlyNotes` - flags the Deal for an operator CBAT/Odysseus capture run. Does not trigger any browser automation itself. |

### Useful files

```text
lib/cb/deals-system/campaign-types.ts          DealPitchBrief + all campaign contracts
lib/cb/deals-system/campaign-generators.ts     generateDealPitchBrief, generateDealCopyPackage, ...
lib/cb/deals-system/curated-deal-assembly.ts   assembleCuratedDeal, runDealCampaignStage, isDealHomepageEligible, ...
lib/cb/deals-system/curated-deal-cache.ts      load/save/upsert cache helpers
lib/cb/deals-system/curated-deal-types.ts      CuratedOdysseusDeal + operatorVisibility (Phase 14)
lib/cb/deals-system/public-deal-projection.ts  customer-safe tile + page shapes
lib/cb/deals-system/public-deals.ts            approval-gated public loader (pinned-first ordering)
lib/cb/deals-system/deal-link-email.ts         Phase 12 Klaviyo link-email sender
lib/cb/deals-system/dashboard-data.ts          workbench data
lib/cb/deals-system/operator-actions.ts        safe test actions
lib/cb/link-broker/                            Link Broker + health + package lookup
lib/integrations/klaviyo.ts                    Klaviyo REST helper (profiles + events)
components/cb/curated-deals-tiles.tsx          homepage section
components/cb/curated-deal-page.tsx            /deals/[id] curated render + CTAs
app/(landing)/deals/[id]/page.tsx              route (curated branch first, legacy fallback)
app/api/deals/link-request/route.ts           Phase 11/12 email-link CTA
app/api/deals/callback-request/route.ts       Phase 11/13 callback CTA (queues to dashboard)
app/api/tests/deals-system/callback-status/route.ts  Phase 13 status/notes update route
app/api/tests/deals-system/curated-deal/route.ts     staged-action API route (+ Phase 14 visibility/link actions)
app/(tests)/tests/deals-system/               test workbench pages and controls
app/(tests)/tests/deals-system/dashboard-view.tsx       shared dashboard view (Phase 14)
app/(tests)/tests/deals-system/callback-requests-panel.tsx  Phase 13 operator panel
app/admin/deals-system/page.tsx               Phase 14 production operator dashboard
scripts/assemble-curated-deal.ts              operator CLI
```

### Local caches

```text
.github/data/cb-promo-intelligence-cache.json
.github/data/cb-link-broker-cache.json
.github/data/odysseus-curated-deals-cache.json
.github/data/deal-callback-requests-cache.json  <- populated/updated by callback-request and callback-status routes
```

### Test suite

```text
npm run test:deals-system:all   # 9 suites, 0 failures
```

## Next Implementation Slice

**Phase 15 - Scheduled Health and Refresh**

Daily active Deal link validation, pre-ad-launch validation, stale Deal
hiding, promo expiration checks, and a Deal replacement candidate workflow.
The `refresh_link` action (Phase 14) gives the operator a manual trigger to
mark a link stale; Phase 15 should make that detection automatic and
scheduled.

Other remaining open items are operational, not code:

- Configure a Klaviyo flow for the `LLL Deal Link Requested` metric so
  email-link delivery (Phase 12) is observable end-to-end.
- Run live `validateBrokerLink` against the committed Deal's booking link
  before any production use.
- Pushover plus the dashboard panel are the active callback notification path. Additional callback notification channels are out of scope unless deliberately reintroduced.

## Safety and Operational Notes

- Do not run `npm run build` unless the user explicitly asks.
- Do not automatically publish homepage Deals.
- Do not run booking, hold, stateroom selection, payment, or reservation actions.
- CBAT/Odysseus browser operations are operator-controlled.
- Keep Deals separate from Groups.
- The committed Deal's booking link needs live browser validation
  (`validateBrokerLink`) before production use.
