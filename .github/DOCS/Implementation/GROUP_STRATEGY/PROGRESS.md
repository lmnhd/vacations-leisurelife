# Group Campaign Automation — Progress Log

**Branch**: `feature/shadow-groups`  
**Last Updated**: 2026-03-04  
**Strategy Reference**: [GROUP_CAMPAIGN_STRATEGY.md](./GROUP_CAMPAIGN_STRATEGY.md)  
**Campaign Media Sub-Pipeline**: [CAMPAIGN_MEDIA/README.md](./CAMPAIGN_MEDIA/README.md)

---

## ✅ Phase 1: Discovery Infrastructure — COMPLETE

Full 2-phase discovery pipeline is operational and battle-tested. Phase A generates AI blueprints via Sonar Deep Research using **inventory-first** ship selection (CB group blocks from `cb-deals-cache.json` injected into Step 2 prompt). Phase B matches each campaign to live CB group inventory, populates pricing, and writes booking links to DynamoDB. **7/10 campaigns are CB_MATCHED** and ready to feed into Phase 2.

> **Campaign ID (slug)** — e.g., `analog-film-and-darkroom-odyssey-2026` — is the key passed into all downstream phases (aesthetic devising, media generation, ad campaigns).

### What Was Built

#### Data Layer
- **DynamoDB Table**: `lll-shadow-campaigns` — ACTIVE in `us-east-1`
  - Single-Table Design: `PK = CAMPAIGN#<slug>`, `SK = METADATA` or `SK = USER#<email>`
  - Provisioned via: `scripts/create-campaign-dynamodb-tables.ps1`
- **Types**: `lib/campaigns/types.ts` — `Campaign` and `CampaignWaitlistEntry` interfaces
- **Store**: `lib/campaigns/campaign-store.ts` — `saveCampaignBlueprint`, `getCampaignBlueprint`

#### Discovery Pipeline — Phase A (`app/api/groups/discovery/`)
- **`route.ts`** — `GET /api/groups/discovery`
  - In-flight lock (`isRunning` flag) — returns `409` if already running
  - Returns `message`, `count`, `skippedCount`, and `campaigns[]` with `fetchUrl` per blueprint
- **`core-logic.ts`** — 3-step:
  1. **Sonar Deep Research** — Psychographic trend-mining (§6.1)
  2. **Sonar Deep Research** — Aesthetic gap / ship infrastructure cross-reference (§6.1)
  3. **GPT-5-mini `generateObject`** — Produces 5 structured `Campaign` blueprints
  4. **DynamoDB write** — Idempotent: skips slugs that already exist

#### Phase B — CB Inventory Match ✅ COMPLETE
- [x] **Scraper Library**: `scripts/cb-inventory-scraper.ts` — Playwright, authenticates to CBAT, scrapes `view_groups/?price_advantage=on` → returns typed `CbGroupInventoryItem[]`
- [x] **Matcher Engine**: `lib/campaigns/cb-inventory-matcher.ts` — pure scoring logic, fuzzy-matches inventory items to campaign by ship name, date, destination, and keyword overlap. Returns `CbInventoryMatch | null`
- [x] **Pricing Formula**: `startingPrice = CB group 'Price From' × 1.15` (§6.2)
- [x] **DynamoDB write**: `upsertCampaignPricingMatch` — writes `cbagenttoolsGroupId`, `cbagenttoolsBookingLink`, `cbPriceAdvantage`, `startingPrice`, `pricingStatus: 'CB_MATCHED'`
- [x] **Unmatched handling**: `markCampaignUnmatched` — sets `pricingStatus: 'UNMATCHED'`, no error thrown
- [x] **Personal Link construction**: `https://bookings.cbagenttools.com/swift/cruise/package/<groupId>?siid=<CB_AGENT_SIID>`

#### Phase B — Runner & API Endpoints ✅
- [x] **`scripts/run-phase-b.ts`** — standalone CLI runner (`npx tsx scripts/run-phase-b.ts [--slug <id>]`)
- [x] **`GET /api/groups/discovery/phase-b?run=true`** — AI Agent trigger (OpenClaw scheduler pattern; matches Phase A's GET trigger). Optional `&slug=<id>` to target single campaign.
- [x] **`GET /api/groups/discovery/phase-b`** — Status-only: returns all unmatched campaigns + `running` flag for test page polling.
- [x] **`POST /api/groups/discovery/phase-b`** — UI trigger: body `{ slug? }`, same as GET `?run=true` for test page use.
- [x] **In-flight lock**: `409` returned if Phase B already running (same pattern as Phase A)

#### Campaign Lookup Endpoint (`app/api/groups/campaign/[id]/`)
- **`route.ts`** — `GET /api/groups/campaign/:id`
  - Fetches single campaign from DynamoDB by slug
  - Returns AI-readable flat JSON with all fields including `pricingStatus`, `cbagenttoolsBookingLink`, `cbPriceAdvantage`

#### Test UI (`app/(tests)/tests/groups/discovery/page.tsx`)
- **Phase A panel**: Cost-guarded button, button lockout while results loaded, Clear & Reset
- **Phase B panel**: "Run Matching" button → fires POST + polls GET every 5s
- Per-campaign pricing badges: `CB_MATCHED` (green) · `AI_ESTIMATE` (amber) · `UNMATCHED` (red)
- **Blueprint cards** (updated): show description, ship, dates, booking link, price advantage, **View JSON** link per campaign
- **"Clear All" button**: `DELETE /api/groups/discovery/clear` — wipes all DynamoDB campaigns + research cache for clean re-run
- **Auto-load on mount**: `GET /api/groups/discovery?load=true` → pre-populates grid from DynamoDB without triggering Phase A
- **"Load Status" button**: checks existing campaigns without triggering a run

#### Maintenance Scripts
- **`scripts/remap-campaigns-to-inventory.ts`** — GPT-4o-mini maps stale campaign `shipTarget` to real CB inventory ships. Resets `pricingStatus` to `AI_ESTIMATE` for Phase B retry.
  - `npx tsx scripts/remap-campaigns-to-inventory.ts [--slug <id>]`
- **`DELETE /api/groups/campaign/:id`** — Deletes a single campaign METADATA record from DynamoDB
- **`DELETE /api/groups/discovery/clear`** — Deletes all campaigns + clears research cache

### Safeguards In Place
| Risk | Guard |
|---|---|
| Concurrent Phase A scheduler calls | `409` in-flight lock in `GET /api/groups/discovery` |
| Concurrent Phase B scheduler calls | `409` in-flight lock in Phase B route |
| Accidental double-click on test page | Button disabled while results loaded |
| Blind cost exposure (Phase A) | `window.confirm` with ~$1.60–$2.00 estimate |
| Silent DynamoDB overwrites | Idempotency check skips existing campaign slugs |
| CB session expired | Playwright re-logs in automatically via `CB_EMAIL`/`CB_PASSWORD` env vars |
| No inventory match found | `pricingStatus: 'UNMATCHED'` set; run not aborted; retried on next Phase B run |
| Phase A picks non-CB ship line | CB `priceAdvantages` ship list injected into Step 2 Perplexity prompt |
| Perplexity ECONNRESET | Retry logic (3×) + keep-alive + AbortController timeout |
| Duplicate themes generated | Existing campaign names injected into both Perplexity + GPT prompts as exclusion list |
| Research cost wasted on failure | Disk cache (`discovery-research-cache.json`) — resumes from last completed step |

---

## ✅ Phase 2: Campaign Media Pipeline — IN PROGRESS

*Corresponds to Strategy §6.3 "Vibe Asset Generation." This is a multi-step sub-pipeline with its own phased docs in [`CAMPAIGN_MEDIA/`](./CAMPAIGN_MEDIA/README.md).*

### 2A. Aesthetic Devising (Phase C.1) — ✅ COMPLETE

**The Campaign Identity Engine** — generates a locked `CampaignAestheticBrief` before any image/video/audio assets are created.

#### What Was Built
- **Zod Schemas**: `lib/campaigns/schema.ts` — `CampaignAestheticBriefSchema` + all nested types (`VideoBrief`, `TikTokConceptSet`, `MerchItemBrief`, etc.) with inferred TypeScript types
- **DynamoDB Ops**: `lib/campaigns/campaign-store.ts` — `saveAestheticBrief`, `getAestheticBrief` (writes to `SK: MEDIA#AESTHETIC_BRIEF`, updates campaign `METADATA` with `aestheticBriefStatus`)
- **AI Engine**: `lib/campaigns/aesthetic-engine.ts` — Two-pass GPT-4o generation via `@ai-sdk/openai`:
  - **Pass 1**: Core identity (visual palette, typography, messaging, merch direction, audio identity)
  - **Pass 2**: Platform-specific expansion (social concepts for 8 platforms + 5 video briefs)
  - **Slogan Quality Gate**: Programmatic check — rejects clichés and enforces word-count limits; auto-retries up to 3×
  - **Brand Constraint Integration**: Hard constraints from `brand-identity` skill injected into system prompt
- **API Endpoints**:
  - `POST /api/campaigns/[slug]/media/aesthetic` — generates + persists brief
  - `GET /api/campaigns/[slug]/media/aesthetic` — retrieves existing brief
  - `POST /api/campaigns/[slug]/media/aesthetic/approve` — validates via Zod + locks `humanReviewStatus: 'approved'`
- **Dashboard UI**: `app/dashboard/campaigns/[slug]/media/aesthetic/page.tsx` — visual palette preview, slogans, raw JSON, approve button
- **Test Page**: `app/(tests)/tests/aesthetic-devising/page.tsx` — isolated pipeline runner

#### Spec Reference
Full schema and generation process: [PHASE_1_AESTHETIC_DEVISING.md](./CAMPAIGN_MEDIA/PHASE_1_AESTHETIC_DEVISING.md)

### 2B. Media Generation (Phase C.2) — NOT STARTED
- [ ] AI image generation (Midjourney / DALL-E) driven by aesthetic brief
- [ ] Ship reference imagery via `/api/imageSearch` (§6.3)
- [ ] HeyGen avatar video generation from `VideoBrief` specs
- [ ] ElevenLabs narration from `audio.ambientNarrationScript`
- [ ] Suno/original music from `audio.musicMood` prompt seed

Spec: [PHASE_2_MEDIA_GENERATION.md](./CAMPAIGN_MEDIA/PHASE_2_MEDIA_GENERATION.md)

### 2C. Storage & Organization (Phase C.3) — NOT STARTED
- [ ] Asset CDN/S3 storage structure
- [ ] Metadata linking assets back to campaign slug + aesthetic brief

Spec: [PHASE_3_STORAGE_ORGANIZATION.md](./CAMPAIGN_MEDIA/PHASE_3_STORAGE_ORGANIZATION.md)

### 2D. Distribution & Platform Delivery (Phase C.4) — NOT STARTED
- [ ] Auto-format assets per platform specs (TikTok, IG, FB, Pinterest, etc.)
- [ ] Email template image embedding (Klaviyo/Beehiiv)

Spec: [PHASE_4_DISTRIBUTION.md](./CAMPAIGN_MEDIA/PHASE_4_DISTRIBUTION.md)

---

## 🔜 Phase 3: Campaign Build & Guest Onboarding — NOT STARTED

*Converts a `DRAFT` campaign into a live `GATHERING_INTEREST` landing page and handles the full guest journey through manifest collection. Corresponds to Strategy §3 Stages 1, 2, 2.5, 2.6, 2.7.*

### 3A. Landing Page (Stage 1)
- [ ] Dynamic landing page: `app/(campaigns)/campaigns/[slug]/page.tsx`
- [ ] Dual CTA model: "Join Group Waitlist" (`bookingMode: 'GROUP_WAIT'`) + "Book My Spot Now" (`bookingMode: 'BOOK_NOW'`)
- [ ] Waitlist form → DynamoDB `USER#<email>` record write
- [ ] Live "Hype" counter — real-time DynamoDB read: *"X of Y cabins pledged"*
- [ ] Proposed Events leaderboard from waitlist entries
- [ ] Interactive "Vibe Quiz" → email capture → `proposedEvents` population

### 3B. Threshold & Validation Logic (Stage 2)
- [ ] Auto-threshold check on every waitlist submission
  - `BOOK_NOW` → immediate manifest trigger (no threshold check)
  - `GROUP_WAIT` → threshold check against `minCabinsRequired`
- [ ] Internal alert (Pushover/Slack) when `THRESHOLD_MET`
- [ ] `BOOK_NOW` guests count toward threshold total

### 3C. Passenger Manifest Collection — "The Golden Window" (Stage 2.5)
- [ ] "Trip is GO!" email to all `USER#` records on threshold event
- [ ] Manifest page: `/campaigns/[slug]/manifest?token=<signed-jwt>` (72h expiry)
- [ ] AI-assisted conversational form flow via `/api/chat`
- [ ] Pre-seeded from parent `USER#` record data
- [ ] Writes `GUEST#<email>` record with full `GUEST_INFO` JSON
- [ ] Per-guest dispatch gate: CB link sent on `manifestStatus: 'SUBMITTED'`
- [ ] Non-submitter reminder sequence (24h, 48h, 72h → agent alert)

### 3D. Group Community Channel (Stage 2.6)
- [ ] `communityChannelUrl` in campaign config (Discord / WhatsApp / Facebook Group)
- [ ] Channel invite included in "Trip is GO!" email
- [ ] `BOOK_NOW` guests get invite immediately on manifest completion
- [ ] Pre-configured channels: `#intros`, `#event-voting`, `#cabin-tips`, `#ship-day-photos`

### 3E. Branded Merchandise (Stage 2.7)
- [ ] Print-on-demand via Printful/Printify (zero inventory, zero upfront cost)
- [ ] Merch page: `/campaigns/[slug]/merch` or Printify Pop-Up Store link
- [ ] Activates on `THRESHOLD_MET` — teaser shown before
- [ ] `merchandiseStoreUrl` populated on `METADATA` record at activation
- [ ] Designs sourced from `CampaignAestheticBrief.merch` section
- [ ] Order window closes 21 days before sailing date

---

## 🔜 Phase 4: CB Inventory Match & Link Pre-Loading (Stage 3) — NOT STARTED

*Strategy updated (March 2026): CB pre-negotiates and holds hundreds of group blocks at **no agent-side cost**. The primary path is matching to existing pre-blocked inventory — Formstack is fallback only. This stage happens during pre-launch setup, not at threshold time.*

**Primary Path (Pre-blocked CB Inventory):**
- [ ] Search CB `view_groups` for sailings matching campaign destination, duration, date window
- [ ] On match: "Copy Link" to retrieve Personal Booking Link — no Formstack needed
- [ ] Populate `cbagenttoolsGroupId` and `cbagenttoolsBookingLink` on `METADATA` record
- [ ] Link is pre-loaded **before** campaign goes live (zero-latency threshold dispatch)

**Fallback Path (External/Custom Blocks Only):**
- [ ] Register via Formstack at `https://anhywhereinc.formstack.com/forms/private_group_booking`
- [ ] Only needed if sailing is negotiated outside CB's pre-existing inventory

---

## 🔜 Phase 5: Financial Handoff & Booking (Stage 4) — NOT STARTED

*Dual-mode booking system: Self-Serve link dispatch OR OdysseusEngine automated booking. Mode selected automatically by `autoHandoffThreshold`.*

### 5A. Self-Serve Path (Above Threshold)
- [ ] CB personal link dispatched to guest on `manifestStatus: 'SUBMITTED'`
- [ ] Guest completes CB's own checkout, pays deposit directly
- [ ] Confirmation screen text: multi-cabin booking instructions
- [ ] `converted: true` via webhook callback

### 5B. OdysseusEngine-Assisted Path (Below Threshold)
- [ ] OdysseusEngine invoked programmatically from `GUEST_INFO` record
- [ ] Headless Chrome automation: login → navigate group → select cabin → fill passenger details → hold
- [ ] Reservation number captured → written to `GUEST#` record → confirmation email dispatched
- [ ] **Current status**: OdysseusEngine operational through `holdCabin()` scaffolding. Outstanding gap: final Passenger Details form fill + hold submission.

### 5C. Graceful Expiry (Stage 5)
- [ ] Daily scheduled function checks `GATHERING_INTEREST` campaigns against `expiresAt`
- [ ] "This One Didn't Sail" email to `GROUP_WAIT` guests with pivot to individual booking
- [ ] CTA → same manifest page → CB link dispatched individually
- [ ] All `USER#` / `GUEST#` records retained as CRM for future campaigns

---

## 🔜 Phase 6: Digital Promotion Stack (Strategy §5) — NOT STARTED

*Drives external traffic into `/campaigns/[slug]` waitlist. Human-in-the-loop approval for ad spend.*

### 6A. Top-of-Funnel Traffic Generation
- [ ] Auto-generate Promotion Brief per campaign from blueprint data
- [ ] **⏸️ HUMAN CHECKPOINT**: approve ad copy variants, budget tier, targeting keywords
- [ ] Google Custom Intent Audience + Display campaign via Google Ads API (§5.1A)
- [ ] Meta Lead Form Ads with Webhook → DynamoDB write (§5.1B)
- [ ] TikTok organic seeding: AI-generated concept videos (§5.5A)
- [ ] TikTok Lead Gen Ads post-validation (§5.5B)

### 6B. Lead Nurture (§5.2)
- [ ] Klaviyo/Beehiiv 3-part email sequence (T+0, T+3d, T+7d)
- [ ] Twilio SMS on `THRESHOLD_MET` status change

### 6C. Privacy-First Attribution (§5.3)
- [ ] Meta Conversions API (CAPI) — server-side event ping from DynamoDB write Lambda

### 6D. Budget Auto-Scaling
- [ ] Agent reads waitlist count every 24h
- [ ] Tier 1 ($5/day) → Tier 2 ($15/day) → Tier 3 ($30/day) based on traction
- [ ] Auto-pause on 0 signups after 48h

### 6E. Synthetic Influencer Assets (§5.4)
- [ ] ElevenLabs "Hype-Man" voice for video ads
- [ ] HeyGen AI avatar "Specialist" video
- [ ] Original niche-native music (copyright-safe)

---

## 🔜 Phase 7: Campaign Lifecycle Tracking — NOT STARTED

*Structured process for monitoring campaigns over months. Prevents missed deadlines, stale campaigns, and budget waste.*

### 7A. Campaign Health Status Engine
- [ ] New DynamoDB attributes: `promotionStatus`, `promotionStartedAt`, `lastHealthCheckAt`, `adSpendTotal`, `deadlines`
- [ ] Status flow: `BRIEF_GENERATED` → `PENDING_APPROVAL` → `APPROVED` → `LIVE` → `PAUSED` → `EXPIRED`

### 7B. Deadline Tracking
- [ ] Per-campaign deadline object: `sailingDate`, `groupBlockExpiry`, `depositDeadline`, `promotionCutoff`
- [ ] OpenClaw daily cron checks all `LIVE` campaigns
  - 🟡 Alert within 14 days of `groupBlockExpiry` and waitlist < threshold
  - 🔴 Alert if `LIVE` but 0 signups for 7+ days
  - ⛔ Auto-pause ads past `promotionCutoff`

### 7C. Campaign Health Report
- [ ] `GET /api/groups/health` endpoint
- [ ] Returns: waitlist count vs threshold, days until deadlines, CPL, status flags (`ON_TRACK` | `AT_RISK` | `STALE` | `EXPIRED`)

### 7D. Campaign Archival
- [ ] On `CONVERTED` or `EXPIRED`: pause/delete ads, snapshot metrics, status → `ARCHIVED`

---

## 🔜 Phase 8: Operations Calendar (Strategy §7) — NOT STARTED

*The "factory floor" layer — how blueprints are batched, campaigns launched, and performance gates enforced.*

### 8A. Monthly Blueprint Sprint (§7.1)
- [ ] 5 × Phase D `campaign-config` objects produced in single AI-assisted session
- [ ] Cross-reference themes to avoid keyword overlap / audience cannibalization
- [ ] All configs committed as `DRAFT` to DynamoDB

### 8B. Weekly Launch Rate (§7.2)
- [ ] Staggered activation: 1–2 campaigns per week from monthly batch
- [ ] Activation = `DRAFT` → `GATHERING_INTEREST`

### 8C. Seed Phase — Days 1–30 (§7.3)
- [ ] TikTok Organic (zero budget) + Tier 1 Targeted Ads ($5–10/day)
- [ ] Seed Phase budget ceiling: ~$300/month per campaign
- [ ] All paid leads → DynamoDB via webhook → Klaviyo nurture sequence

### 8D. Day 30 Decision Gate — Scale or Kill (§7.4)
- [ ] Score against 5 metrics: waitlist %, email open rate, TikTok save rate, CPL, manifest completion rate
- [ ] **Scale**: 3+ Strong → increase budget, add TikTok Lead Gen Ads, extend window
- [ ] **Kill**: 3+ Weak → Stage 5 Graceful Expiry, archive, retain CRM, re-queue niche

---

## Known Gaps (Deferred)
- **Phase B match quality**: Scoring is keyword-based fuzzy match. A campaign with a very generic `shipTarget` (e.g., "Caribbean cruise") may return a low-confidence match. Future improvement: semantic embedding similarity.
- **Phase B vtgSearch integration**: `/api/vtgSearch` retail pricing not yet cross-referenced — CB group rate is used directly as the sole pricing source.
- **Auth on discovery endpoints**: Deferred — local-only system for now; no auth middleware
- **Perplexity fetch timeout/retry**: No timeout on Sonar calls; acceptable for local dev, revisit before production
- **`GUEST_INFO` schema**: Full JSON schema for manifest collection not yet defined as Zod
- **OdysseusEngine final step**: Passenger Details form fill + hold submission click outstanding
- **`CB_AGENT_SIID` env var**: Must be set in `.env.local` for personal booking link construction to be correct
