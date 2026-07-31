# Deal Campaign Process Memory

Record operator-driven workflow corrections, recurring friction, temporary rules, and refactor implications here. Add dated entries. Keep each entry focused on the operational lesson.

## 2026-06-23 - Use agency inventory tools

- Trigger: A cruise recommendation was initially approached like general travel research.
- Operating rule: Use CB and Odysseus agent tools for real package candidates. Generic web research may enrich a campaign later, but it is not the source of truth for package selection.
- Refactor implication: Candidate lookup should remain directly accessible from the Deal workflow.

## 2026-06-23 - Workbench is an intake and handoff surface

- Trigger: The operator wanted to select a ship in the Workbench, then continue in the stronger Deals pipeline.
- Operating rule: Use the Workbench to import or assemble the sailing, attach the correct promo, generate initial ad and targeting angles, and hand the Deal to the pipeline for copy and finalization.
- Refactor implication: Avoid rebuilding weaker copies of mature pipeline stages inside the Workbench.

## 2026-06-23 - Generate the angles for the operator

- Trigger: The operator did not already have an advertising or targeting angle.
- Operating rule: Angle generation is a required workflow stage, not a form field the operator must invent before continuing.
- Refactor implication: Pipeline handoff stays disabled until meaningful angle fields exist.

## 2026-06-23 - Scaffold output is not finished intelligence

- Trigger: Workbench stage cards displayed `ready` while their source was `deterministic_scaffold`.
- Operating rule: Always expose provenance. Describe scaffold output as a placeholder and require richer generation before approval when campaign quality depends on research or AI.
- Refactor implication: Readiness labels should distinguish scaffolded, AI-generated, operator-edited, and approved output.

## 2026-06-23 - Promotion context must reach the copywriter

- Trigger: Ad copy ignored the Celebrity promotion that motivated the campaign.
- Operating rule: Carry full promotion briefs into the unified manifest. If a promo is attached, copy may not silently claim `promo: none`.
- Refactor implication: Fail closed when applicable promo ids exist but source promo records are unavailable.

## 2026-06-23 - Promo state belongs to the selected Deal

- Trigger: The top assembly form and lower selected Deal shared promo state, causing a Royal Caribbean promo to appear on a Celebrity Deal.
- Operating rule: Keep assembly promo selection separate from the selected existing Deal's promo selection.
- Refactor implication: Every promo selector must make its record scope explicit.

## 2026-06-23 - Market and timing fit are preflight gates

- Trigger: A UK audience angle and a near-term sailing made otherwise valid Celebrity candidates unusable.
- Operating rule: Check audience market, promo market, departure geography, booking window, sailing date, and operator timing constraints before copy generation.
- Refactor implication: Surface `market needs review` and block clear market mismatches.

## 2026-06-23 - Clear destructive language

- Trigger: `Delete Duplicate` appeared on every Deal, even when no duplicate was established.
- Operating rule: Label the action `Delete Deal`. Let the operator choose the record after reviewing outputs and provenance.
- Refactor implication: Never encode an unproven duplicate judgment into a destructive action label.

## 2026-06-23 - Preserve ASCII punctuation

- Trigger: Unicode punctuation rendered as mojibake in operator-facing text.
- Operating rule: Prefer ASCII hyphens, arrows written as `->`, and three periods unless a Unicode character has been verified after writing.
- Refactor implication: Read edited files back when punctuation encoding is uncertain.

## 2026-06-23 - Package number is the primary intake

- Trigger: Daily Workbench intake required a carefully formatted multi-field note even when the exact Odysseus package number was already known.
- Operating rule: When a package number is available, ask for that number only and load the remaining sailing facts directly from Odysseus.
- Refactor implication: Keep structured-note import and fuzzy ship search as advanced fallbacks, not the primary operator workflow.

## 2026-06-24 - Image candidates need direct landing-page assignment

- Trigger: A useful Destination Scenery image was visible in Funnel Synthesis but could not be assigned to a landing-page section.
- Operating rule: Every image candidate must expose a direct `Use on page` action for the hero or any landing section, regardless of its search category.
- Refactor implication: Image categories guide discovery and defaults; they must not prevent operator curation across sections.

## 2026-06-24 - Package pricing must survive Workbench handoff

- Trigger: The exact Odysseus package response included cabin pricing, but the Workbench-created manifest and landing page did not receive it.
- Operating rule: Package-number intake must carry real cabin-tier pricing through assembly, pipeline handoff, Funnel Synthesis, and public projection.
- Refactor implication: Do not reduce exact package lookup to display-only sailing fields when downstream pages consume richer supplier facts.

## 2026-06-24 - Approved Workbench promos must reach the landing page

- Trigger: A promotion selected in the Workbench remained `possibly_applicable_needs_review`, so the public projection silently omitted it even after the Deal was operator-approved.
- Operating rule: Prefer likely-applicable promos. When none exist, retain the operator-selected review-qualified promo and render only its public-safe summary, claims, structured offer terms, and booking window.
- Refactor implication: Applicability review status must control qualification and approval, not erase an attached promotion from the final customer experience.

## 2026-07-03 - Avoid vague agent-conversation CTAs

- Trigger: Generated Royal Caribbean family Deal ads leaned on vague "Ask us" / freeform conversation language that was hard to reconcile with the actual landing-page mechanism.
- Operating rule: Use concrete CTA language such as `Check eligibility`, `View this sailing`, `Send me the deal`, or `Request callback`. Keep promo uncertainty in qualified disclaimers and structured callback notes, not as the core ad promise.
- Refactor implication: Promo summaries and copywriter prompts should frame review-qualified offers as eligibility checks with clear labels, not open-ended questions to an agent.

## 2026-07-04 - Entity ids are built ONLY by deal-ids.ts; the dealId IS the Odysseus packageId

- Trigger: Two different deals collapsed onto the same DynamoDB partition key and mixed together in the Step 9 Google Ads lab. Ids were built ad-hoc at each stage: the discovery pipeline slugged marketing titles (ignoring the real packageId it already had), seed scripts hand-typed their own formats, and downstream steps re-slugged parent ids with an 80-char slice that truncated away the disambiguating tail.
- Operating rule: The Odysseus packageId (e.g. `1543052`) IS the dealId - verbatim, no prefix, no slug. Every derived entity id leads with that dealId and appends a bounded readable slug: `manifest-{dealId}-{slug}`, `adcopy-{dealId}-{slug}`, `funnel-{dealId}-{slug}`; Meta and Google Ads syntheses reuse the funnel id 1:1. NEVER hand-build an entity id in a seed script, generator, or agent step - import the builders from `lib/cb/deals-system/deal-ids.ts` (`buildTripManifestId`, `buildDealAdCopyId`, `buildFunnelSynthesisId`, `slugifyIdPart`). `assembleDraft.suggestedDealId` carries the bare packageId verbatim.
- Refactor implication: Uniqueness must come from the leading dealId, never from a sliced slug tail. Any new entity type gets its builder added to deal-ids.ts first; a hand-composed template literal id in review is a defect. Legacy pre-2026-07 records keep their old ids (public pages match on the stable dealId field, so they still display).

## 2026-07-04 - Google Ads copy must be mojibake-clean and policy-plain

- Trigger: Step 9/10 Google Ads drafts carried corrupted punctuation such as `â‰ˆ` and `â€”` into Responsive Display Ad text fields, while repeated live dispatch attempts failed with opaque Google policy errors.
- Operating rule: Sanitize Google Ads text fields at save and dispatch boundaries. Prefer plain ASCII punctuation and conservative, non-price-comparison copy for Google drafts. Do not blame the model by default; mojibake usually means real Unicode passed through a bad encoding boundary and then got persisted in cache.
- Refactor implication: Google Ads Step 9 should show and store clean ad text before Step 10 dispatch. If a Google policy failure interrupts the flow, keep the active thread pinned: for deal `1576786`, gallery images were selected and the next test is clean conservative copy plus the same gallery images.

## 2026-07-15 - Exact-package Workbench intake must preserve canonical ids and itinerary truth

- Trigger: Package `1640418` was ready for Workbench assembly, but the handoff route still built a legacy `manifest-workbench-*` id and exact-package intake dropped the supplier day-by-day itinerary.
- Operating rule: Normalize the Deal id to the Odysseus package id, build brief and manifest ids through `deal-ids.ts`, and carry the exact package-page itinerary through Workbench form state into `cruiseFacts.dayByDayItinerary`.
- Refactor implication: Exact-package campaigns must reach Copywriter with package-led ids and the real port calendar; do not reconstruct either from marketing slugs or a comma-split display string.

## 2026-07-15 - Empty promo selection does not authorize public no-promo claims

- Trigger: The copywriter correctly received no attached Virgin Voyages promo but turned that absence into the public claim that no special promotional offer existed.
- Operating rule: No attached promo means the copy must omit promotion and savings claims. It must not tell visitors that no promotion exists. Fare inclusions, tips, gratuities, all-inclusive language, and absolute dining claims require explicit source support in the unified manifest.
- Refactor implication: Copywriter guardrails should distinguish `no attached promo context` from `verified no promotion`, and unsupported inclusion claims must fail before persistence.

## 2026-07-16 - Booking-link pricing is a required pipeline handoff

- Trigger: Exact-package intake for Virgin Voyages package `1640418` resolved the sailing and booking URL, but both the stored Deal and trip manifest carried only a currency code. The public page consequently rendered no cabin rows.
- Operating rule: After the booking URL is acquired, the pipeline must preserve supplier cabin pricing when it already exists or attempt initial hydration from that exact booking URL. If neither source exposes a numeric cabin-tier fare, block the pipeline handoff and approval instead of publishing a cabinless Deal page.
- Refactor implication: Initial booking-link hydration belongs in the shared package-resolution and Workbench handoff paths. Later fare-drift corrections remain operator-reviewed and must never be silently applied.

## 2026-07-17 - Normalize typography without hiding place-name rewrites

- Trigger: Step 3 repeatedly rejected otherwise structured copy because the model returned curly punctuation, while the guard reported every non-ASCII character as a possible place-name rewrite.
- Operating rule: Convert a bounded set of known typographic punctuation to plain ASCII before public-copy validation. Preserve all other non-ASCII characters so accented or rewritten supplier place names still fail closed.
- Refactor implication: Copywriter validation must distinguish harmless typography from factual spelling changes, and tests must cover both outcomes.

## 2026-07-17 - Angle changes update one package campaign

- Trigger: Editing the MSC campaign angle created a second resolved manifest for package `1553111`, and both appeared as live campaigns in Publish.
- Operating rule: The Odysseus package id is the stable Deal campaign identity. A new, selected, or edited angle replaces that package's active manifest instead of creating another campaign. Creative alternatives belong in ad-copy variants.
- Refactor implication: Both local and Dynamo manifest upserts must remove the superseded manifest for the same package after the replacement write succeeds. The Workbench must tell the operator that angle editing updates the campaign.

## 2026-07-17 - Remove the public bonus-offer callback CTA

- Trigger: `Check bonus offer` looked like an automated eligibility check but only created another manual callback task with no defined operator resolution workflow.
- Operating rule: Deal landing pages expose the verified booking action, email-link action, and one general callback request. Promotion questions can be included in the normal callback notes; do not create a separate bonus-check CTA or queue.
- Refactor implication: Keep legacy `promo_check` records readable for history, but public Deal components must not create new ones.

## 2026-07-25 - Deal landing pages have one Booking Assistant entry

- Trigger: The public Deal hero still displayed `Email me the link` and `Request callback` beside `Start booking`, even though the approved Booking Assistant design begins through one guided funnel and must account for guests who never reach an agent call.
- Operating rule: A Deal landing page exposes one booking action: `Start booking`. Secure email resume (`Continue later`) and contextual human help/final call actions appear only inside the Booking Assistant after the required context exists, and all of them remain on one journey, draft, and Booking Activity Journal.
- Refactor implication: Do not recreate public link-request, callback-request, bonus-check, or generic ask-an-agent CTAs. Preserve old records for history, and project every assistant entry - including pre-contact exits and all other non-call outcomes - into the Deal-System analytics work.

## 2026-07-25 - Booking intake uses a focused app viewport

- Trigger: The normal corporate landing-page footer appeared directly below the Booking Assistant controls on a phone, adding dense legal/contact text to an already sensitive older-guest form.
- Operating rule: Once `Start booking` opens the assistant, hide unrelated site chrome and the normal footer. Lock the background document in place, keep the primary controls predictable, and allow scrolling only inside the active task or sheet so long forms and accessibility controls remain reachable.
- Refactor implication: Legal and privacy information remains available through the assistant's contextual privacy/help surfaces, but it must not be repeated as a full site footer beneath every booking task.

## 2026-07-25 - Every Booking Assistant step must be reversible

- Trigger: A guest could move forward through intake but had no direct way to return to the previous step and correct an earlier answer.
- Operating rule: Show a large, plainly labeled `Back` control on every task after the first. Back preloads the saved answer, preserves all unrelated confirmed data, and records the navigation. When an upstream correction changes task requirements, reopen only the dependent steps. The ready-to-call screen also provides a review/change path until call handoff begins.
- Refactor implication: Do not rely on final-review edit links or browser history as the only correction path. Forward and backward task navigation are both required parts of the mobile booking contract.

## 2026-07-28 - Meta carousel style defaults should be intelligent and operator-editable

- Trigger: GPT Image 2 continued producing attractive Deal carousel flyers, but unrelated campaigns increasingly shared the same glossy collage, typography, badge, and color treatment because the Step 8 prompt supplied no distinct design direction.
- Operating rule: Give each new Deal Meta synthesis an AI-recommended default from a controlled creative-direction preset library. Make the recommendation, rationale, and active style visible before image spend. The operator may override or restore it at any time, and changing the style must not automatically regenerate images.
- Implementation: The bounded style decision now runs once during Step 8 initialization through the LLM Gateway, using campaign context plus recent style usage. The AI recommendation is persisted separately from the active operator selection so intelligent defaults improve variety without weakening operator control or carousel coherence.

## 2026-07-30 - Consolidated fast-campaign execution and superseding rules

- Trigger: A time-sensitive New Year's Deal succeeded through exact-package capture, a current CB promotion, direct review-state pipeline orchestration, selected copy, and funnel synthesis, while exposing gaps in the older top-level skill guidance.
- Operating rule: Later dated process-memory corrections supersede earlier conflicting entries. In particular, the 2026-07-25 single `Start booking` rule supersedes older public email-link, callback, bonus-check, or ask-an-agent CTA guidance.
- Operating rule: When a package ID is known, load and validate the exact package page. Do not broaden back into a candidate/link-broker search merely to reconstruct a URL that already loaded successfully.
- Operating rule: If raw promotion capture succeeds but structured extraction fails after one repair attempt, allow a bounded single-record source review. Preserve raw terms and provenance, structure only explicit facts, mark diagnostics `needs_review`, qualify uncertain benefits, and attach the reviewed record before copy.
- Operating rule: Treat the route action named `publish` as publication-review assembly. It may persist a Curated Deal and pass every mechanical gate while the Deal remains `needs_review`; only operator approval authorizes public publication.
- Operating rule: Funnel synthesis and a large image-candidate count do not establish factual or media readiness. Recheck generated landing claims, verify ASCII persistence, and select only exact-ship or exact-destination imagery.
- Operating rule: For urgent "sell now" work, accept a recent sentiment dossier as prior evidence and create a campaign-specific delta dossier. Revalidate live package, fare, promotion, and link facts, then rank conversion velocity using occasion specificity, price proof, promotion deadline, departure access, hook clarity, and booking friction.
- Refactor implication: Keep these consolidated rules in `SKILL.md`, `AGENT_ENV.md`, and `WORKFLOW.md` so agents do not need to infer the current contract from historical entries.
