# Deals-System Storage: Single Source of Truth

> Status: **Phase A complete** (2026-07-03). Operator directive: local-JSON vs
> DynamoDB dual sourcing "should be corrected once and for all." This doc is
> the code-verified inventory of what lives where, what was fixed, and the
> remaining migration phases.

## The rule

DynamoDB (`lll-deals-system`, via `deals-dynamo-store.ts`) is the single
source of truth for every record a route reads or writes. The local JSON
caches under `.github/data/` are legacy migration sources only — nothing live
may read them once its entity is migrated. New entity types get a Dynamo key
prefix from day one (the meta-ad-synthesis gap — lab-only JSON that never
reached production — must not recur).

## Inventory (verified 2026-07-03)

### Already single-source (Dynamo); JSON is dead legacy

| Entity | Dynamo prefix | JSON readers remaining |
|---|---|---|
| Curated deals + briefs | `DEAL#` / `BRIEF#` | only `curated-deal-cache.ts` itself + `scripts/migrate-deals-to-dynamo.ts` |
| Trip manifests | `MANIFEST#` | same pattern |
| Funnel syntheses (Step 7) | `SYNTHESIS#` | same pattern |
| Promo intelligence records | `PROMO#` | same pattern |
| Callback requests | (callback-request-store.ts, Dynamo) | none — public visitor path, was always Dynamo |

### Fixed in Phase A (2026-07-03)

| Entity | Was | Now |
|---|---|---|
| Meta ad syntheses (Step 8) | TRUE dual truth: lab + meta-distribution routes read local JSON; writes mirrored to JSON + Dynamo; production read Dynamo | `METAADSYNTH#` Dynamo is primary for ALL reads and writes (`meta-ad-synthesis/route.ts`, `meta-distribution/route.ts`). JSON cache module kept only for `scripts/backfill-deal-meta-ad-synthesis-dynamo.ts` (legacy import). The route's init-time card merge (`mergeExistingGeneratedCards`) now merges against the Dynamo record. |

### Remaining: local-JSON only (machine-bound, no Dynamo presence yet)

Ranked by how much it matters:

1. **Deal ad copy** (`deal-ad-copy-cache.json`) — read by the copywriter,
   funnel-synthesis, AND publish routes + dashboard-data. It gates publishing:
   the pipeline can only complete on the machine holding this file. Migrate
   first: `ADCOPY#<id>` records, mirror the funnel-synthesis pattern, one-time
   import script, then cut the routes over.
2. **Meta distributions** (`deal-meta-distributions-cache.json`) — records of
   dispatched Meta campaigns (campaign/adset/post ids). Losing this file loses
   the map of what's live on Meta. `METADIST#<id>`.
3. **Google Ads syntheses + distributions** — same shape of concern as 1–2.
4. **Unified manifests + discovery ideas** — upstream build tooling; migrating
   completes the "whole pipeline re-runnable from any machine" story.
5. **Link broker cache** — per-link lookup cache; least risky, could stay
   local (it is a true cache, rebuildable), but moving it removes the last
   exception to the rule.

Each migration follows the proven recipe: add types' key prefix + get/list/
upsert to `deals-dynamo-store.ts` → cut routes over to Dynamo reads/writes →
one-time import script from the JSON → leave the JSON module referenced only
by that script.

## Related fix shipped the same day (dual RECORDS, not dual stores)

One sailing routinely has TWO deal records: the workbench "Source & assemble"
staging record (slug id) plus the LIVE record the pipeline's Publish step
assembles fresh from the manifest (plain package-id id, via
`assembleCuratedDealFromManifest` in `publish/route.ts` — it never updates or
retires the staging record). This made the workbench look "out of touch": a
stale staging record shows failing gates while its sibling is live on the
homepage (seen with package 1584138: stub
`oceania-vista-dutchmans-caribbean-november-1584138` vs live `1584138`; same
pattern for 1543052). The workbench now shows a sibling-record banner whenever
another record shares the selected record's packageId, highlighting the live
one with a one-click "Switch to the live record" (campaign-workbench.tsx).
Follow-up worth considering: have Publish auto-delete (or mark superseded) the
staging record.
