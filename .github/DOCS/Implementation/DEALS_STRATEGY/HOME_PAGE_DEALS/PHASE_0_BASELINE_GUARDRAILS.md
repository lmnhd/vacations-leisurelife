# Phase 0 - Baseline and Guardrails (Locked)

Status: implemented.

This document is the Phase 0 proof artifact. It locks the rules and shared
vocabulary that every follow-on phase must obey before any building starts.

It reconciles the three plan documents:

- `CB_AGENT_TOOLS_PROMO_INTELLIGENCE_PLAN.md`
- `ODYSSEUS_LINK_BROKER_PLAN.md`
- `PRELIMINARY_PLAN.md`

If a later phase contradicts anything here, this document wins until it is
explicitly revised.

## Locked Rules

### 1. Deals are separate from Groups

- Home Page Deals are individual retail cruise offers a visitor can click and
  buy now through the Cruise Brothers portal.
- Groups remain their own campaign lane (`lll-shadow-campaigns`, campaign
  tooling) and are not mixed into Deals unless an operator explicitly converts
  a Deal into a Group.
- Group inventory, Price Advantage rows, and inferred package matches are **not**
  valid public Deals. This was already decided in `PRELIMINARY_PLAN.md` Slice 2
  and remains in force.

### 2. No public Deal publishes without a valid CB/Odysseus booking path

- A Curated Deal may only become public when it has a booking URL whose link
  health is `valid`.
- `info_only`, `needs_review`, `needs_operator_capture`, `stale`, and `broken`
  records stay internal.
- `getStoredCbDealDetailById` already enforces this for the current pipeline:
  a detail without `booking.bookingUrl` and `status === "bookable"` returns
  not found rather than rendering a pending stub. New Curated Deals must hold to
  the same gate via link health.

### 3. The Link Broker is internal backend infrastructure

- The Link Broker produces, normalizes, validates, caches, and refreshes
  CB/Odysseus links. It does not render UI, own the public CTA model, send
  email, or create callback requests.
- Frontend CTA flows (Book now / Email me the booking link / Request an agent
  callback) consume Link Broker output through thin API routes. They never build
  CB URLs themselves.

### 4. CBAT/Odysseus browser automation stays operator-run

- Any authenticated portal interaction (CB Agent Tools, Odysseus search, share
  link capture, browser link validation) runs as an **operator command** — a CLI
  script run from the operator's environment — not as a request-time or
  visitor-triggered action inside the web app.
- "Operator-run" does NOT mean a human must perform the login. The established
  pattern (3+ months in production, see `scripts/scrape-cb-deals.ts` and
  `.github/DOCS/PROCESSES/odysseus-playwright-automation.md`) is fully automated:
  scripts load the saved Playwright session (`.playwright-state.json`) and, when
  it has expired, log in headlessly with `CB_EMAIL` / `CB_PASSWORD` from
  `.env.local`. An AI assistant running these scripts via the CLI is the operator
  workflow. No hardcoded credentials.

### 5. No workflow creates holds, reservations, payments, stateroom selections, or passenger submissions

- Every Deals workflow stops at producing/validating a booking link.
- No code path may enter guest details, choose cabins, hold space, collect
  payment, or create reservations.

## Package-Link Safety Assumptions (Confirmed)

- **Package entry links are broad entry links.** Class 1
  (`/swift/cruise/package/{PACKAGE_ID}--{slug}?siid={AGENT_ID}&lang=1`) is the
  safest, simplest target while the package exists. Still must be validated
  because package availability changes.
- **Prepared `details.aspx` links are preferred when user setup exists.** Class 2
  (prepared details) is the default internal generation target when traveler
  setup is sufficient, because it uses mostly stable, understandable parameters
  and avoids portal-generated tokens.
- **`clonebkg` and `brn` are portal-generated only.** Class 3 (captured clone)
  and Class 4 (cabin/stateroom) tokens are never synthesized or guessed. They
  are accepted only when freshly captured from the portal and validated.
  Note: real Share links carry a structured-looking `clonebkg` such as
  `07A__BESTPRICE__07A__`. The structured appearance does NOT make it safe to
  build — it remains capture-only. A details.aspx link that carries a `clonebkg`
  classifies as Class 3 (captured clone), not Class 2.

## Locked Vocabulary

All follow-on phases share these terms:

| Term | Meaning |
| --- | --- |
| **Promo Intelligence** | Structured CB Agent Tools Today's View promotion records: rules, perks, windows, combinability, restrictions, warnings. Not publishable alone. |
| **Link Broker** | Internal backend module that turns cruise facts + traveler setup into the best CB/Odysseus booking link, validated and cached. |
| **Curated Deal** | A publishable retail Deal record merging package facts, Link Broker output, promo applicability, trip research, targeting, visitor-safe copy, and link health. |
| **Targeting-Demographic** | A package-specific targeting research artifact (audiences, niche/trend keywords, channel notes, confidence) generated before ad packaging. |
| **CTA workflow** | The three public actions a Deal exposes: Book now, Email me the booking link, Request an agent callback. Consumers of the Link Broker, not owners of it. |
| **Callback request** | A stored `AgentCallbackRequest` capturing a visitor's request for an agent to call back, with full deal/package/link context, routed to email/dashboard/Crisp where practical. |

## Link Class Reference (Locked)

| Class | Name | Synthesizable | Use |
| --- | --- | --- | --- |
| 1 | Package Entry | Yes | Safest broad entry. Only package ID + `siid` known. |
| 2 | Prepared Details | Yes | Default target when traveler setup is sufficient. |
| 3 | Captured Clone/Resume (`clonebkg`) | No (portal-generated) | Only when freshly captured + validated. |
| 4 | Cabin/Stateroom (`brn`) | No (portal-generated) | Only when freshly captured + validated. |

Always-required parameters: `packageId`, `siid`, `lang=1`.

## Exit Criteria Check

- [x] Deals confirmed separate from Groups.
- [x] No public Deal publishes without a valid booking path.
- [x] Link Broker confirmed as internal backend infrastructure.
- [x] CBAT/Odysseus browser automation confirmed operator-run.
- [x] No hold/reservation/payment/stateroom/passenger-submission workflow allowed.
- [x] Package-link safety assumptions confirmed.
- [x] Shared vocabulary locked for all follow-on phases.

Phase 0 is complete. Phase 1 (Data Contracts and Local Caches) may proceed.
