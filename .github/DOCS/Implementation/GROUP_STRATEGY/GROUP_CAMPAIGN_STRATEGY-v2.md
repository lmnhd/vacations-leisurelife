# Group Campaign Strategy V2: Current Discovery State and Canonical Test Blueprints

**Document Status:** Active working strategy
**Last Updated:** 2026-03-14
**Current Focus:** Freeze discovery churn, hand-pick the strongest discovery-approved candidates, and use them to validate the full Phase 2 media, ad, and landing-page formula one campaign at a time.

---

## 1. Strategic Position

The original V2 pivot remains correct: group cruises should feel like **vacations first** and **shared-interest communities second**. The theme is an icebreaker and social magnet, not a curriculum.

What changed is execution reality. The expanded discovery loop now supports:

- raw Phase A blueprint review before aesthetics
- single-card and bulk review
- single-card and bulk revision
- iteration memory, stagnation detection, branch revision, and retirement/operator-cleanup logic

That infrastructure was useful, but it also proved that unconstrained iteration can become operationally heavy for a human operator. The current decision is therefore pragmatic:

**We are not going to keep grinding discovery indefinitely. We will move forward with the best discovery-approved campaigns, perfect them into canonical test blueprints, and use those to validate the next phase of the system.**

---

## 2. Current Discovery Process

### Phase A Generation

Current discovery generation remains:

1. Perplexity Sonar Deep Research — psychographic discovery
2. Perplexity Sonar Deep Research — cruise-expression / ship-plausibility follow-up
3. GPT-5 structured generation — typed campaign blueprints

Core principle:

- discovery must find **cruise-plausible, socially magnetic, low-pressure, hobby/taste-driven communities**
- concepts must remain **ambient, optional, and vacation-first**
- discovery should prefer **believable ship behavior** over novelty theater

### Discovery Review Gate

Before aesthetics, each blueprint can now receive a dedicated discovery-stage red-team review.

Current verdict definitions:

- `pass`: the blueprint is Phase-2-ready now; no required fixes remain
- `warn`: the core idea is viable, but discovery-level revision or operator cleanup is still needed
- `block`: the concept is not strong enough to advance in current form

Important correction now in force:

- a blueprint may no longer receive `pass` while still carrying `requiredFixes`
- if required fixes remain, the system demotes the result to `warn`

### Revision Logic

Discovery revision now supports:

- single revision when the concept is still moving in a productive direction
- 3-branch revision when the system detects stagnation or loop behavior
- re-review after revision to see whether the issue mix actually improved

### Iteration State

Each blueprint can now carry discovery iteration state:

- review count
- revision count
- fingerprint similarity
- repeated issue signatures
- recommended next action: `hold`, `continue`, `branch`, `operator_cleanup`, or `retire`

### Practical Stop Rule

For this wave, the system should be treated as a **decision aid**, not a license for infinite revision.

The practical stop rule is:

- if a blueprint earns a clean `pass`, stop discovery and move it forward
- if a blueprint remains structurally weak, retire it
- if a blueprint is conceptually good but still messy on ops/spec detail, mark it as operator cleanup or hold, not endless creative iteration

---

## 3. What We Learned From This Discovery Wave

### What Worked

- upstream discovery review is materially better than waiting for aesthetics to expose weak concepts
- targeted revision and branch revision help avoid shallow paraphrase loops
- iteration memory gives the system a defensible way to identify stagnation

### What Failed

- the human cost of managing many review/revise cycles became too high
- the system initially over-retired some concepts because ops-heavy warnings were mistaken for concept failure
- discovery can become excessively procedural if it is not deliberately cut off once Phase-2-worthy candidates exist

### Current Operating Decision

For the next phase, we are moving from **breadth discovery mode** to **depth validation mode**.

That means:

- stop optimizing the entire slate at once
- select the best 2 campaigns
- perfect those 2 into canonical test assets
- run the full Phase 2 and landing/ad workflow **one campaign at a time**

---

## 4. Current Live Slate

As of 2026-03-14, the currently stored discovery slate contains 4 campaigns:

| Campaign | Slug | Discovery Status | Operational Decision |
|---|---|---|---|
| Leaf & Leisure: Houseplant People Afloat | `houseplant-botanical-caribbean-2026` | `pass` | Selected for Phase 2 testing |
| Caps & Cuffs: Menswear-Forward Vintage Afloat (All Welcome) | `vintage-sustainable-style-mediterranean-2026` | `pass` | Selected for Phase 2 testing |
| Stitch & Sail: Quiet Library Circle (Med 2026) | `cottagecore-textile-makers-mediterranean-2026` | `warn` | Deprioritized for this wave |
| Silent Sides at Sea: Sleeve Club with Sync-Play | `vinyl-collectors-alaska-2026` | `warn` | Deprioritized for this wave |

The canonical campaigns for the next testing wave are the two `pass` results above.

---

## 5. Canonical Test Blueprint 01

### Leaf & Leisure: Houseplant People Afloat

**Slug:** `houseplant-botanical-caribbean-2026`
**Status:** Canonical Phase 2 test campaign
**Why Selected:** It has the cleanest combination of social plausibility, cruise-native lightness, and low operational burden. It is also structurally distinct from the vintage campaign, which makes it a strong first test of formula portability.

### Finalized Blueprint

**Positioning**

A relaxed Southern Caribbean cruise for houseplant people and plant-curious guests who enjoy easy compliments, tiny recognition cues, and low-pressure visual sharing. The trip is a real cruise first: ports, breeze, coffee, windows, dinner, and a soft social layer for the right people to notice each other.

**Core promise**

Plant people can find one another through a simple, accessible icon+codename cue and a few tiny daily touchpoints without the trip ever turning into a class, a swap, or a structured event.

**Final social mechanic**

- recognition is driven by a host-visible icon+codename cue in EN/ES
- guests may participate through compliments, a quick camera-roll share, or a simple “I noticed this motif” moment
- no live materials, no swaps, no giveaways, no rosters, no QR codes, no PII collection

**Daily rhythm**

- AM micro hello around coffee, under 10 minutes
- PM quick share before dinner, under 10 minutes
- one optional sea-day “Camera-Roll One-Pick” moment, around 20 minutes max

**Operational non-negotiables**

- no live plants, cuttings, seeds, soil, water gear, or ashore purchases of live plant material
- no table spreads, signage, displays, or egress-adjacent clustering
- all activity remains in all-ages, non-bar-compatible seating zones with defined backups
- recognition is icon+codename first; color is support information only, never a guest task
- sketching is solo-only and never host-led

**Phase 2 creative direction anchors**

- visual world: soft greens, warm neutrals, simple icons, sunlit café corners, shaded windows, botanical prints without literal greenhouse fantasy
- emotional register: kind, breezy, observant, quietly social, vacation-soft
- anti-drift: no horticulture lecture, no workshop framing, no “luxury spa retreat” substitution

### What “A+” Means For This Blueprint

To qualify as A+ in downstream testing, the media and landing page must make the cruise feel:

- socially warm, not lonely
- visually distinctive, not generic resort marketing
- plant-coded without becoming costume logic
- accessible and bilingual in spirit without turning into heavy informational UX

---

## 6. Canonical Test Blueprint 02

### Caps & Cuffs: Menswear-Forward Vintage Afloat (All Welcome)

**Slug:** `vintage-sustainable-style-mediterranean-2026`
**Status:** Canonical Phase 2 test campaign
**Why Selected:** It is the strongest style-led concept in the slate after the menswear-forward correction. It is differentiated, socially legible, and tests whether the system can handle a more fashion-coded campaign without drifting into exclusivity, runway theater, or retail behavior.

### Finalized Blueprint

**Positioning**

A vacation-first Mediterranean sailing for vintage lovers with a soft menswear/workwear/sportswear emphasis: caps, cuffs, ties, denim, windbreakers, watches, scarves, brooches, and classic resort pieces. All genders and styles are welcome. The trip offers compliments, tiny detail-recognition moments, and optional host-present micro-gatherings with no classes, no retail, and no pressure.

**Core promise**

Vintage-minded guests can find one another through tiny style details and short story-first exchanges that feel natural on a Mediterranean cruise, not staged as a fashion event.

**Final social mechanic**

- compliments, label lore, tiny detail-recognition moments, and hand-to-hand sharing only
- optional magnetic lapel pin as a low-friction recognition tool
- phone album or pocket folio sharing only
- if the accessories-only exchange is not approved, the fallback is bring-a-photo or story-circle, not cancellation of the social experience

**Daily rhythm**

- pre-dinner lounge hello + “Cap & Cuff Salute” under 10 minutes
- sea-day coffee hello with repeat pass if turnout exceeds cap
- golden-hour Rooftop Garden pass with indoor fallback
- optional micro-chat on market manners / cultural respect

**Operational non-negotiables**

- no selling, no DM-to-buy behavior, no retail tables, no brand activation energy
- no signage, no walls, no unattended display surfaces, no fixed-table takeover optics
- no try-ons, no garment handling, no runway framing, no judged contest logic
- explicit all-welcome framing must survive all creative output
- aesthetics must avoid sliding into male-only or heritage-purist gatekeeping

**Phase 2 creative direction anchors**

- visual world: sun-faded Mediterranean palette, classic resort silhouettes, soft tailoring, worn denim, workwear details, watches, scarves, polished-but-relaxed ship settings
- emotional register: confident, warm, observant, lightly insider, socially generous
- anti-drift: no runway, no editorial snobbery, no retail pop-up, no “exclusive mens club” energy

### What “A+” Means For This Blueprint

To qualify as A+ in downstream testing, the media and landing page must make the cruise feel:

- stylish without becoming exclusionary
- clearly vintage-coded without becoming costume parody
- socially magnetic without implying programmed events or venue takeover
- premium and specific without collapsing into generic Mediterranean lifestyle marketing

---

## 7. Testing Order

The next wave should be executed one campaign at a time in this order:

1. `houseplant-botanical-caribbean-2026`
2. `vintage-sustainable-style-mediterranean-2026`

Reason:

- Leaf & Leisure is the cleaner systems test: low ops risk, strong social logic, lower likelihood of exclusivity drift
- Caps & Cuffs is the stronger second test of whether the same formula can support a more style-forward campaign

---

## 8. Rules For The Next Phase

For the next wave of work, all agents should assume:

- discovery is not the current bottleneck
- the main question is whether the full campaign formula can turn an A-level blueprint into A+ downstream outputs
- we are testing the **campaign system**, not trying to keep re-litigating the niche itself
- all Phase 2 and landing/ad work must preserve the discovery constraints that made these blueprints viable

Use this document together with the next-wave goals document for all follow-on work.
