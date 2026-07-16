# Verbatim Customer Sentiment System

## Decision

Do not reduce customer language to a Meta interest list. Preserve the original
intent, tension, desired outcome, and proof requirement from each signal, then
connect that research to a real CB-backed package, landing-page decision, and
measured booking outcome.

Google search is one input. Meta is one activation channel. Neither is the
customer-language system by itself.

## What "verbatim" means

The system preserves exact customer wording only when Leisure Life has the
right to retain and use it: first-party conversations, form responses, surveys,
and testimonials with recorded permission. External public content is research
only: store a short internal paraphrase, source link, and evidence notes rather
than reusing a person's words in public copy.

Never put names, email addresses, phone numbers, booking references, or other
personal data into the research corpus, prompts, ad parameters, or public copy.
Never present an external comment as a customer testimonial without explicit
permission.

## Source portfolio

| Source | Signal captured | Strength | Recommended use |
| --- | --- | --- | --- |
| Onsite search, chat, callback, email-link, and form responses | The visitor's own words at the point of shopping | Highest intent | Primary verbatim corpus |
| Post-handoff and post-booking micro-surveys | Objections, missing proof, why they booked or did not | Highest diagnostic value | Improve checkout readiness and follow-up |
| Google Keyword Planner, Trends, and Search Console | Market demand, timing, and exact search phrasing | Strong discovery signal | Select clusters and package candidates |
| Google Ads Search terms | Actual paid queries that produced handoffs/confirmed bookings | Strongest scalable query evidence | Scale or negate search terms |
| Sales/callback dispositions | Human explanation of hesitation, price concerns, cabin questions | High intent but lower volume | Add proof, FAQs, and assisted-booking flows |
| CBAT Trip confirmations | Confirmed conversion, package, booking date, and sail date | Outcome authority, not sentiment | Close the learning loop |
| Public Reddit and YouTube discussion | Unprompted language, anxieties, comparison criteria | Exploratory only | Research themes and hypothesis generation |
| TikTok Creative Center and Meta Ad Library | Current creative language and market framing | Competitor/creative evidence, not sentiment | Creative audit and differentiation |
| Review and community sites | Experience vocabulary and recurring tradeoffs | Exploratory, rights-sensitive | Manual research only unless approved access exists |

## The customer-language record

Create a versioned internal record for each collected signal:

```text
CustomerLanguageSignal
  id, capturedAtIso, sourceType, sourceLocator, market, permissionState
  rawTextRedacted optional (owned/consented sources only)
  researchParaphrase required
  sourceQuality, freshness, transactionProximity
  extractedJob, tension, desiredOutcome, proofNeeded, languageAtoms
  associatedCruiseLine/ship/destination/date/promotion optional
  linkedIntentClusterId optional, linkedDealId optional
  publicUseAllowed, operatorReview, provenance
```

Use the LLM Gateway to extract structured meaning from language. Do not use
regex-based matching. The raw record stays internal; only reviewed public-safe
copy can reach a landing page or ad.

## The no-loss translation

Every signal must carry three layers instead of becoming a bare keyword:

```text
Customer language
  -> meaning: job, tension, desired outcome, proof needed
  -> package truth: exact sailing, price basis, promotion applicability
  -> activation: page decision, copy hypothesis, channel-specific test
```

Example:

```text
Language: "I want a Caribbean cruise, but I do not want a floating waterpark."
Meaning: wants warm itinerary, quiet/lower-crowd ship experience, and proof.
Package truth: only select a real smaller-ship or adult-oriented option that
can substantiate the experience.
Activation: page compares ship scale and itinerary; Meta creative tests calm
ship experience against itinerary depth. It does not target the literal phrase.
```

## Activation options beyond Meta

| Option | What it preserves | Best role |
| --- | --- | --- |
| Search-led landing pages | Exact query-to-promise continuity | Organic and Google Search campaigns |
| Meta language-layer creative tests | Emotional tension, proof, and framing | Demand creation and retargeting |
| TikTok/Reels creative tests | Spoken phrasing, objections, and visual proof | Short-form discovery |
| Email/SMS follow-up | The individual request and unresolved question | High-intent recovery after link/callback action |
| On-page guided chooser | The tradeoff the visitor is trying to resolve | Convert broad traffic into a package match |
| Agent callback playbook | Exact customer objections and questions | Assisted conversion and research capture |
| Destination/package FAQ modules | Repeated proof requests in customer language | Landing conversion and organic search |

Meta Ad Library exposes active ads for creative audit, and TikTok Creative
Center exposes trend and keyword-insight tools. Treat both as market-framing
research. They do not prove customer intent or authorize copying competitors.

## Pilot: three-loop system

### Loop 1 - Owned language

Add one optional open question to high-intent surfaces:

`What are you trying to get right about this cruise?`

Capture the response only with the appropriate privacy notice. Add structured
callback outcome choices such as price uncertainty, date uncertainty, cabin
uncertainty, promotion eligibility, itinerary mismatch, or wants agent help.

### Loop 2 - Market language

For each real CB package family, collect Google keyword evidence plus a bounded
manual research sample from permitted public sources. Use public discussion to
find themes and questions, not testimonials to reuse.

### Loop 3 - Outcome feedback

Join the new booking-handoff record with CBAT Trip confirmation. Score each
intent cluster and language hypothesis on:

- landing views;
- booking handoffs, excluding internal tests;
- callback/email-link requests and stated objection;
- CBAT-confirmed bookings;
- margin and promotion viability.

## Operator review card

Before a sentence becomes public copy, the Workbench must show:

1. The source category, date, market, and permission state.
2. The exact owned/consented wording or external paraphrase.
3. The extracted tension and required package proof.
4. The matching real package and promotion constraints.
5. The proposed landing, search, Meta, TikTok, email, or agent application.
6. The result metric and the operator approval state.

This makes the strategy a controllable research-to-revenue loop, rather than a
one-way Google-to-Meta conversion.

## Priority order

1. Build owned language capture and the CBAT-confirmed booking loop.
2. Run Google research for scalable demand and seasonality.
3. Add a small, disciplined Search pilot when the handoff measurement exists.
4. Add public-community and competitor creative research as a bounded
   hypothesis source, with provenance and rights guardrails.
