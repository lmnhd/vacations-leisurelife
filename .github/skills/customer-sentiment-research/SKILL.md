---
name: customer-sentiment-research
description: Build source-grounded customer-language intelligence for Leisure Life cruise Deals. Use when the operator wants to discover or preserve exact customer search phrases, shopping language, objections, desired outcomes, proof requirements, market conversations, or competitor framing; turn that evidence into real CB-backed Deal candidates, landing/copy hypotheses, and channel tests; prepare a sentiment dossier before invoking deal-campaign-generation; or rapidly refresh a recent dossier for a time-sensitive, sellable campaign.
---

# Customer Sentiment Research

Turn customer language into Deal intelligence without reducing it to a Meta interest list. This is an upstream research skill; use it before `deal-campaign-generation`, which remains the authority for package truth, promotion applicability, campaign assembly, and approval-gated publication.

## Read first

1. `AI_POLICY.md`.
2. `.github/DOCS/Implementation/DEALS_STRATEGY/CUSTOMER_SEARCH_PATTERN_RESEARCH/VERBATIM_CUSTOMER_SENTIMENT_SYSTEM.md`.
3. `.github/DOCS/Implementation/DEALS_STRATEGY/CUSTOMER_SEARCH_PATTERN_RESEARCH/GOOGLE_SEARCH_INTENT_RESEARCH_PROTOCOL.md`.
4. `.github/DOCS/Implementation/DEALS_STRATEGY/CUSTOMER_SEARCH_PATTERN_RESEARCH/CBAT_BOOKING_RECONCILIATION_AMENDMENT.md`.
5. `.github/skills/deal-campaign-generation/SKILL.md` before handing a candidate to the Deal pipeline.

## Hard rules

- Preserve source, market, date, permission state, and uncertainty for every signal.
- Use exact wording only from owned or explicitly consented sources. For external public discussion, retain a short internal paraphrase and source locator; do not turn it into a testimonial or public quote.
- Redact or omit personal data, booking references, payment data, and private messages from research artifacts and prompts.
- Use the LLM Gateway for runtime extraction. Never implement regex-based text matching.
- Treat Google, Meta, social, reviews, and competitor ads as evidence with different strengths. Do not claim that a Google phrase is a Meta targeting option or that a competitor's ad proves customer demand.
- Never fabricate a cruise, package ID, fare, booking URL, promotion, or eligibility claim. Use CB/Odysseus tools before recommending a Deal.
- Do not create a hold, reservation, payment, booking, live ad, or publish a Deal without the required operator approval.
- Store all documentation for a new campaign or Deal ad in a dedicated, descriptively named subdirectory inside `.github/DOCS/Implementation/DEALS_STRATEGY/LIVE_DEAL_DATA_WORK_DIRECTORY/`. Use the campaign or Deal slug as the directory name when available. Keep the dossier, source ledger, handoff notes, and later campaign documentation together there so the research and downstream work remain transparent and discoverable.
- When a recent dossier is reused, treat it as prior evidence rather than current proof. Record what was reused, revalidate drift-prone package/promotion facts, and write a campaign-specific delta dossier in the new Deal directory.

## Workflow

### 1. Define the decision

State what needs to be learned: package demand, audience tension, price proof, promotion concern, ship experience, itinerary constraint, or checkout friction. Choose the target market, travel window, and source budget.

### 2. Choose the research depth

Use a full research pass when the operator is exploring demand, audience language, or multiple campaign directions.

Use a rapid sellable-campaign pass when the operator prioritizes time to market and a recent relevant dossier already exists. In that lane:

1. Reuse only sourced, permission-safe customer tensions and clearly label them as prior evidence.
2. Create a campaign-specific delta dossier instead of duplicating the older dossier.
3. Revalidate live package identity, numeric cabin pricing, promotion window, promotion applicability, and booking-link health through `deal-campaign-generation`.
4. Preserve missing owned-language, Keyword Planner, Trends, Search Console, or competitor-audit evidence as explicit gaps.
5. Rank candidates by conversion velocity as well as audience fit:
   - exact occasion or deadline;
   - clear, current fare proof;
   - promotion deadline and public-safe claim strength;
   - departure accessibility;
   - itinerary clarity;
   - strength of the one-sentence hook;
   - likely booking friction.

Do not call the rapid lane quantified sentiment research when no quantified source was used.

### 3. Collect a balanced evidence set

Prioritize sources in this order:

1. Owned high-intent language: onsite search, chat, callback notes, emailed-link requests, form responses, and consented surveys.
2. Google: Keyword Planner for demand estimates, Trends for seasonality, Search Console for existing query/page performance, then a small approved Search campaign for actual paid queries.
3. Outcome data: first-party booking handoffs and read-only CBAT Trip confirmations.
4. Bounded external research: permitted public communities, reviews, YouTube, TikTok Creative Center, and Meta Ad Library.

Do not collect broadly for its own sake. Stop when the evidence has enough variety to challenge the leading hypothesis and enough provenance to review it.

### 4. Extract structured meaning

For every signal, record:

```text
source and locator
market and capture date
permission/public-use state
exact owned wording or external paraphrase
job to be done
tension or objection
desired outcome
proof required before booking
language atoms and associated travel constraints
```

Use semantic extraction to cluster signals. Keep conflicting interpretations; do not force one audience story from thin evidence.

### 5. Build the sentiment dossier

Create a durable Markdown dossier in the campaign or Deal's dedicated subdirectory inside `.github/DOCS/Implementation/DEALS_STRATEGY/LIVE_DEAL_DATA_WORK_DIRECTORY/` containing:

1. A source ledger with evidence quality and limitations.
2. Customer-language cards with provenance and permission state.
3. Three to five intent clusters, each with job, tension, desired outcome, proof needed, exact source phrases, and market confidence.
4. A candidate-package brief for each cluster: factual constraints that a real CB/Odysseus package must satisfy, not invented travel claims.
5. Activation hypotheses for search landing pages, Meta creative, short-form video, email/SMS, agent callback, and FAQ content.
6. A measurement plan from landing view to booking handoff to CBAT-confirmed booking, excluding marked internal tests.

### 6. Hand off to the Deal workflow

For an operator-selected cluster, provide the smallest valid intake to `deal-campaign-generation`:

```text
selected cluster and evidence
market and travel constraints
required package proof
public-safe language direction
candidate promotion constraints
channel hypotheses and measurement keys
research depth: full or rapid delta
reused evidence and current evidence gaps
```

The Deal skill resolves inventory, verifies promotions and links, assembles the manifest, and stops at the appropriate approval surface.

## Quality check

Before handing off, confirm:

- The dossier distinguishes observed wording from model inference.
- The customer claim can be supported by a real package or is labeled a test.
- Public copy does not borrow unconsented external wording.
- The cluster has a defined success event beyond page clicks.
- No source is treated as stronger than it is: Trends is not volume, Meta is not search-query data, and a CBAT confirmation is not sentiment.
- A rapid delta dossier identifies its prior dossier and separately dates every live package, fare, promotion, and link check.
