# Research — Canva-Style Template-Driven Ad Generation

Goal: pick the cheapest, most flexible way to turn **a Canva template I design by hand** into **a programmatically rendered ad PNG**, with named variable slots filled by our existing pipeline.

---

## Option A — Canva Connect API (Autofill)

**Source docs:**
- Autofill guide: https://www.canva.dev/docs/connect/autofill-guide/
- Create design autofill job: https://www.canva.dev/docs/connect/api-reference/autofills/create-design-autofill-job/
- Exports API: https://www.canva.dev/docs/connect/api-reference/exports/create-design-export-job/

**How it works (short):**
1. Design a *Brand Template* in Canva, tag each variable element with a data field name (text / image / chart).
2. `GET /v1/brand-templates/{id}/dataset` to discover the field names + types.
3. `POST /v1/autofills` with `{ brand_template_id, data: { FIELD: { type, text|asset_id } } }`. Returns an async `job_id`.
4. Poll the autofill job → returns a `design_id`.
5. `POST /v1/exports` with the `design_id` → poll until done → download PNG (URL valid 24h).
6. Images must first be uploaded via the **Assets** API to get an `asset_id`.

**Required scopes:** `design:content RW`, `design:meta R`, `brandtemplate:meta R`, `brandtemplate:content R`, `asset RW`.

**Blocker (hard):**
- **Both the integration developer AND every end user must be on a Canva Enterprise plan.** This is stated explicitly in the Autofill prerequisites. There is a "development access" exception you can apply for, but it does not extend to end users / production use.
- Enterprise plan: custom pricing, 30+ seat minimum, annual contract, sales-cycle weeks long.

**Verdict:** Not viable now. Keep as a deferred provider so the interface is ready if we ever go Enterprise.

---

## Option B — Templated.io ⭐ (recommended primary)

**Source:**
- https://templated.io/canva-api/
- https://templated.io/blog/how-to-import-canva-templates-directly-into-templated-for-automation/
- https://templated.io/pricing/

**How it works:**
1. Design in **Canva as normal** (Pro plan is fine — no Enterprise).
2. Use Templated.io's **Canva import** feature to bring the design into Templated's editor.
3. Mark fields as variables (text, image, color) — uses similar named-slot model to Canva Autofill.
4. From Node.js (official SDK), `POST /v1/render` with `{ template, layers: { headline: "...", image_1: "https://..." } }`.
5. Returns a PNG/JPG/WebP/PDF URL. Renders typically ~2 seconds.

**Advantages:**
- Same hand-design experience in Canva that you want.
- No Enterprise requirement.
- Node SDK exists.
- Embedded editor available (could be useful for the CB Deals operator UI later).
- Supports static image **and** MP4 / animated outputs (relevant for future Reels/Stories animation).

**Drawbacks:**
- No permanent free tier — Starter plan caps templates (~15) and renders.
- Annual commitment for best pricing.
- Vendor lock-in for the render step (but template *design* stays in Canva, so we can leave if needed).

**Verdict:** ✅ Best fit. Matches the request almost exactly: design-in-Canva + automate-via-API + isolated from our app code + reusable across workflows.

---

## Option C — Other template-image APIs (alternatives surveyed)

| Vendor | Strength | Why not first choice |
|---|---|---|
| **Placid** | No-code automations (Zapier/Make), good docs | No Canva import; templates must be rebuilt in Placid editor |
| **APITemplate.io** | Strong PDF/HTML support, cheap | Editor is weaker than Canva; PDF-oriented |
| **Imejis.io** | Cheap, generous free tier | Newer; no Canva import |
| **RenderForm** | Free tier exists | Limited editor; smaller user base |
| **Stencil (UseStencil)** | Data-viz heavy | Niche; not ad-focused |
| **Bannerbear** | Mature, popular template-image API | No Canva import; would need to redesign templates in their editor |

All would work technically. None preserve the **"I design in Canva"** part of the requirement except Templated.io.

---

## Option D — Keep code-rendered (satori), add AI copy upstream only

We could leave the renderer in `lib/campaigns/design-system/ad-templates.ts` and only add the **Copy Forge** AI step in front of it.

**Pros:**
- Zero new vendor.
- No new monthly cost.

**Cons:**
- The whole point of the request is *I want to design the look myself*. Code-rendered layouts cannot easily absorb a hand-designed Canva file.
- Still inflexible — every new template kind = new dev work.

**Verdict:** Keep `satori_legacy` as a fallback provider behind the same interface, but it does not satisfy the design freedom requirement.

---

## Option E — Self-host (PSD/Figma → PNG)

E.g. import a Figma file, mark variable layers, render through a headless renderer (Playwright + HTML clone, or custom Skia pipeline).

**Verdict:** Too much engineering for the value. Same end state as Templated.io but we own all the maintenance.

---

## Cost comparison (rough, public-facing pricing)

| Option | Setup cost | Per-render cost | Lock-in | Time-to-first-ad |
|---|---|---|---|---|
| Canva Connect | $$$ (Enterprise) | Included | High (Canva) | Weeks (sales cycle) |
| Templated.io | $ (Starter ~ low monthly) | Included in plan, capped | Medium | Hours |
| Placid / Bannerbear / Imejis | $ | Included in plan | Medium | Days (redesign templates) |
| satori legacy | $0 | $0 | None | Already built |
| Self-host | High dev hours | $0 | None | Weeks |

---

## Decision

**Primary provider:** Templated.io.
**Fallback / legacy:** existing `satori` renderer (kept behind same `AdRenderProvider` interface).
**Future option (deferred):** Canva Connect Autofill, if we ever go Enterprise.

The architecture in `02_ARCHITECTURE_PLAN.md` is **provider-agnostic** — switching is config-level, not a rewrite.
