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
