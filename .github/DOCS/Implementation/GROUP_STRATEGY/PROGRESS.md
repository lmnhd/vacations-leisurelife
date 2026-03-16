# Group Campaign Automation — Progress Log

**Branch**: `feature/shadow-groups`  
**Last Updated**: 2026-03-04  
**Strategy Reference**: [GROUP_CAMPAIGN_STRATEGY.md](./GROUP_CAMPAIGN_STRATEGY.md)  
**Campaign Media Sub-Pipeline**: [CAMPAIGN_MEDIA/README.md](./CAMPAIGN_MEDIA/README.md)  
**API Endpoint Reference**: [API_REFERENCE.md](./API_REFERENCE.md) ← **All endpoints MUST be documented here**

> ⚠️ **API Convention**: ALL endpoints live under `/api/groups/`. Never create routes under `/api/campaigns/`, `/api/media/`, or any other top-level prefix. See [API_REFERENCE.md](./API_REFERENCE.md).

---

## ✅ Phase 1: Discovery Infrastructure — COMPLETE

Full 2-phase discovery pipeline is operational and battle-tested. Phase A generates AI blueprints via Sonar Deep Research using **inventory-first** ship selection (CB group blocks from `cb-deals-cache.json` injected into Step 2 prompt). Phase B matches each campaign to live CB group inventory, populates pricing, and writes booking links to DynamoDB. **7/10 campaigns are CB_MATCHED** and ready to feed into Phase 2.

> **Campaign ID (slug)** — e.g., `analog-film-and-darkroom-odyssey-2026` — is the key passed into all downstream phases (Aesthetic Design, media generation, ad campaigns).

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
  - first test : 'Analog Film & Darkroom Odyssey' slug: `analog-film-and-darkroom-odyssey-2026`

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

### Dev Environment Notes
- Windows + Dropbox can lock `.next` during Next.js manifest rewrites and surface `EPERM` rename failures under Turbopack.
- Repo recovery helper: `npm run next:prepare-local-cache` moves `.next` behind a junction rooted in `%LOCALAPPDATA%\LeisureLifeInteractive\next-cache` so generated build artifacts stop competing with Dropbox sync.
- Recommended local dev command after preparing the cache: `npm run dev:webpack`

**test campaign**: `analog-film-and-darkroom-odyssey-2026`

*Corresponds to Strategy §6.3 "Vibe Asset Generation." This is a multi-step sub-pipeline with its own phased docs in [`CAMPAIGN_MEDIA/`](./CAMPAIGN_MEDIA/README.md).*

### 2A. Aesthetic Design (Phase C.1) — ✅ COMPLETE

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
  - `POST /api/groups/campaign/:slug/media/aesthetic` — generates + persists brief
  - `GET /api/groups/campaign/:slug/media/aesthetic` — retrieves existing brief
  - `POST /api/groups/campaign/:slug/media/aesthetic/approve` — validates via Zod + locks `humanReviewStatus: 'approved'`
- **Dashboard UI**: `app/dashboard/campaigns/[slug]/media/aesthetic/page.tsx` — visual palette preview, slogans, raw JSON, approve button
- **Test Page**: `app/(tests)/tests/aesthetic-devising/page.tsx` — isolated pipeline runner

#### Spec Reference
Full schema and generation process: [PHASE_1_AESTHETIC_DEVISING.md](./CAMPAIGN_MEDIA/PHASE_1_AESTHETIC_DEVISING.md)

### 2B. Media Generation (Phase C.2) — ✅ COMPLETE

**Infrastructure**
- [x] `AssetRecord`, `MediaGenerationJob`, `CampaignMediaManifest` Zod schemas — `lib/campaigns/schema.ts`
- [x] R2 client — `lib/campaigns/media/r2-client.ts` (upload/delete, CDN URL builder)
- [x] Media DynamoDB store — `lib/campaigns/media/media-store.ts` (jobs, assets, manifest, campaign status)

**Generators** (`lib/campaigns/media/generators/`)
- [x] `stability-generator.ts` — Stability AI hero images (5×) + aesthetic concepts (4×); optional count param for test mode
- [x] `sharp-processor.ts` — 8-format platform crops (16:9, 4:5, 9:16, 1:1, banner, email, OG, thumbnail)
- [x] `dalle-generator.ts` — DALL-E 3 merch designs (core + practical + niche items)
- [x] `heygen-generator.ts` — TikTok seed, hero explainer, threshold announcement videos
- [x] `runway-generator.ts` — Countdown video series + cinematic B-roll clips
- [x] `elevenlabs-generator.ts` — Ambient narration + hype clip
- [x] `replicate-music-generator.ts` — Theme music via Replicate MusicGen using `REPLICATE_API_TOKEN`; downloads MP3 output and stores as `theme_music`
- [x] `theme-music-library.ts` — shared default track library selector using AI-agent-friendly tags + prompt notes; supports deterministic best-match selection from premade tracks
- [x] `copy-generator.ts` — GPT-4o single structured call: carousel slides, ad variants, captions, email subjects

**Orchestrator**
- [x] `lib/campaigns/media/media-orchestrator.ts` — Two-phase parallel pipeline; Group 1 (independent) + Group 2 (depends on hero images); per-generator job tracking; manifest assembly

**API Routes**
- [x] `POST /api/groups/campaign/:slug/media/generate` — Full or targeted pipeline trigger with optional `themeMusicSource: 'default' | 'replicate'`
- [x] `GET  /api/groups/campaign/:slug/media/manifest` — Retrieve `CampaignMediaManifest`
- [x] `GET  /api/groups/campaign/:slug/media/assets?type=` — Query assets by type
- [x] `GET  /api/groups/theme-music-library` — List shared premade tracks; optional `campaignSlug` returns current best default match
- [x] `POST /api/groups/theme-music-library` — Bulk upload shared premade theme music tracks
- [x] `PATCH /api/groups/theme-music-library/:assetId` — Update tags / notes / duration metadata for library tracks

**Per-Generator Test Routes** *(current test routes use real generator paths; audio/image/video assets upload to R2 where applicable)*
- [x] `POST /api/groups/campaign/:slug/media/test/copy` — GPT-4o copy batch
- [x] `POST /api/groups/campaign/:slug/media/test/audio` — ElevenLabs narration / hype / Replicate MusicGen theme audio / shared default theme music
- [x] `POST /api/groups/campaign/:slug/media/test/images` — Stability AI hero / concepts / Sharp crops
- [x] `POST /api/groups/campaign/:slug/media/test/merch` — DALL-E 3 single item by index
- [x] `POST /api/tests/musicgen` — dedicated standalone Replicate MusicGen prompt + duration test route

**Test Pages**
- [x] `app/(tests)/tests/media-generation/page.tsx` — Category-level pipeline runner with cost confirmation and theme music source selector (`default` vs `replicate`)
- [x] `app/(tests)/tests/media-generation/test/page.tsx` — **Per-generator test page**: individual cards hitting current group media test routes; theme music card can use shared default library or Replicate and previews returned audio
- [x] `app/(tests)/tests/musicgen/page.tsx` — standalone Replicate MusicGen test page for prompt + duration validation before full pipeline testing
- [x] `app/(tests)/tests/theme-music-library/page.tsx` — shared theme music library manager for bulk upload, tag editing, prompt-note editing, and track preview

> **API keys in `.env.local`**: `OPENAI_API_KEY` ✅ · `ELEVENLABS_API_KEY` ✅ · `REPLICATE_API_TOKEN` required only when using Replicate theme music ✅ · `STABILITY_API_KEY` ❌ · `HEYGEN_API_KEY` ❌ · `RUNWAYML_API_KEY` ❌ · R2 credentials required for uploaded test assets and shared theme music library uploads

Spec: [PHASE_2_MEDIA_GENERATION.md](./CAMPAIGN_MEDIA/PHASE_2_MEDIA_GENERATION.md)

### 2C. Storage & Organization (Phase C.3) — ✅ COMPLETE

**Binary Storage**
- [x] Cloudflare R2 bucket `lll-campaign-media` with deterministic path structure: `campaigns/{slug}/{type}/...`
- [x] All assets served via CDN `https://cdn.leisurelifeinteractive.com/campaigns/{slug}/...` (zero egress cost)
- [x] AWS S3 as fallback / large video overflow only
- [x] WebP for all static images (Sharp post-processing); MP4 H.264 for video; MP3 for audio

**DynamoDB Schema Extensions**
- [x] `MEDIA#AESTHETIC_BRIEF` record — serialized `CampaignAestheticBrief` JSON
- [x] `MEDIA#MANIFEST` record — serialized `CampaignMediaManifest` with total asset count + CDN URLs
- [x] `MEDIA#ASSET#{assetId}` records — per-asset metadata (generator, prompt, dimensions, review status)
- [x] `MEDIAJOB#{jobId}` records — generation job tracking (status, retries, cost audit)
- [x] `METADATA` record updated with `mediaStatus`, `mediaGeneratedAt`, `mediaManifestUrl`

**Asset Versioning**
- [x] `version` + `active` fields on each `MEDIA#ASSET#` record — prior versions retained on regeneration
- [x] Manifest always references `active: true` version per `assetId`

**Storage API**
- [x] `POST /api/groups/campaign/:slug/media/store` — upload asset binary to R2 + write `MEDIA#ASSET#` record
- [x] `GET /api/groups/campaign/:slug/media/manifest` — retrieve `CampaignMediaManifest`
- [x] `GET /api/groups/campaign/:slug/media/assets?type=&format=` — query assets by type/format
- [x] `POST /api/groups/campaign/:slug/media/regenerate` — swap asset version, optionally override prompt
- [x] `DELETE /api/groups/campaign/:slug/media/manifest/image-artifact` — remove hero_image, aesthetic_concept, platform_crop, ship_reference_image from manifest
- [x] `DELETE /api/groups/campaign/:slug/media/manifest/scene-image-artifact` — remove scene_image from manifest
- [x] `DELETE /api/groups/campaign/:slug/media/manifest/video-artifact` — remove video assets from manifest
- [x] `POST /api/groups/campaign/:slug/media/regenerate-with-revision` — revise prompt and regenerate; supports scene_image, hero_image, aesthetic_concept, and all video types

Spec: [PHASE_3_STORAGE_ORGANIZATION.md](./CAMPAIGN_MEDIA/PHASE_3_STORAGE_ORGANIZATION.md)

### 2D. Distribution & Platform Delivery (Phase C.4) — NOT STARTED

**Stage-Triggered Dispatch**
- [ ] `DistributionSchedule` DynamoDB record — machine-readable posting calendar per campaign (`MEDIA#DISTRIBUTION_SCHEDULE`)
- [ ] `ScheduledPost` records with `scheduledAt` as ISO, `'ON_THRESHOLD'`, `'ON_MANIFEST_SUBMIT'`, or `'ON_EXPIRY'` tokens
- [ ] Distribution triggered by campaign lifecycle events (same Lambda path as DynamoDB status transitions)

**Platform Integrations**
- [ ] **TikTok** — TikTok Content Posting API v2: upload + publish seed video; schedule countdown series (2 posts/day rate limit)
- [ ] **Instagram** — Meta Graph API: single image, Reels, 7-slide carousel; scheduled up to 75 days ahead
- [ ] **Meta Ads** — Marketing API: upload creatives → create `AdCreative` + `AdSet` + `Ad`; 3 A/B/C variants created as `PAUSED`, activated at `GATHERING_INTEREST`
- [ ] **Klaviyo** — Pre-build all 7 email campaigns with hero assets injected into templates; flows triggered by DynamoDB events (`lll_waitlist_join`, `lll_threshold_met`, `lll_manifest_submitted`, `lll_campaign_expired`)
- [ ] **Twilio SMS** — Blast on `THRESHOLD_MET`; MMS attachment of hype clip where supported
- [ ] **Discord** — Webhook dispatch of welcome embed + ship imagery at Stage 2.6; merch launch pin at `THRESHOLD_MET`
- [ ] **Printful** — Transition merch products `DRAFT` → `PUBLISHED` on `THRESHOLD_MET`; auto-close orders 21 days pre-sail
- [ ] **Pinterest** — Pin aesthetic concept images weekly through Seed Phase via Pinterest API v5

**Endpoint & Dashboard**
- [ ] `POST /api/groups/campaign/:slug/media/distribute` — run full distribution or targeted platform subset
- [ ] `POST /api/groups/campaign/:slug/media/distribute/tiktok` — targeted TikTok dispatch
- [ ] Distribution Status Dashboard: `/dashboard/campaigns/[slug]/media/distribution` — timeline view, per-platform status, engagement summary pull, manual post triggers, asset swap UI, kill switch

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

> ⚠️ **Core Targeting Principle — Niche Spaces, Not Cruise Spaces.**
> Every ad placement, organic post, and keyword target in this pipeline MUST target the **niche identity** of the campaign — NOT cruise-category inventory.
> - ✅ A film photography campaign appears on Lomography forums, `/r/analog`, Flickr Pro upgrade pages, and YouTube channels reviewing film stocks.
> - ✅ A retro-gaming campaign appears inside GameBoy subreddits, retro-tech YouTube, and TikTok's `#AnalogPocket` community.
> - ❌ **Never** target: "cruise vacations", "cruise deals", "travel agency" keywords, cruise brand interest segments, or travel-category display networks.
>
> The campaign finds people who do not know a niche cruise is possible — it does not compete for people already searching for one. Implementation of every ad platform integration below MUST enforce this rule in its targeting configuration.

### 6A. Top-of-Funnel Traffic Generation

**Promotion Brief Generation**
- [ ] Auto-generate Promotion Brief per campaign from `Campaign.targetingKeywords` and `CampaignAestheticBrief`
- [ ] Brief includes: niche identity statement, platform-specific niche keyword list, forbidden terms list (must include cruise/travel category terms), copy angles
- [ ] **⏸️ HUMAN CHECKPOINT**: approve ad copy variants, budget tier, and **targeting keyword list** before any spend activates

**Google Custom Intent Audience — Niche Search Targeting (§5.1A)**
- [ ] Audience built from `campaign.targetingKeywords` — these are niche-domain terms ONLY (e.g., `["Lomography", "film photography", "darkroom processing", "Portra 400"]`)
- [ ] Placement Targeting: force display onto specific niche YouTube channels and blogs matching the campaign theme — do NOT use Google's broad audience expansion
- [ ] Forbidden: "cruise", "vacation packages", "travel deals" as keywords or audience interests
- [ ] Implementation: `targetingKeywords` from DynamoDB `METADATA` are the ONLY seed for this audience — no augmentation with travel-category terms

**Meta Lead Form Ads — Niche Interest Targeting (§5.1B)**
- [ ] Interest targeting: niche-specific Facebook/Instagram interests ONLY (e.g., film photography communities, analog enthusiast groups, hobby-specific pages)
- [ ] Webhook: Lead Form submit → AWS Lambda → `USER#<email>` written to `lll-shadow-campaigns` DynamoDB → Klaviyo nurture triggered
- [ ] Forbidden: "Travel & Tourism", "Cruises", "Vacation" interest categories in audience config
- [ ] Lookalike audience (post Seed Phase): seeded from existing DynamoDB `USER#` signups exported as CSV — NOT from cruise/travel lookalike pools

**TikTok Organic Seeding — Niche Hashtags Only (§5.5A)**
- [ ] Post AI-generated concept video at campaign activation using assets from Phase 2B
- [ ] Hashtag set: 3–5 niche-specific tags ONLY — sourced from `campaign.targetingKeywords` transformed to hashtags (e.g., `["#FilmPhotography", "#AnalogPocket", "#35mmFilm"]`). Do NOT include `#Cruise`, `#CruiseLife`, `#Travel`, or generic vacation tags.
- [ ] Caption framing: curiosity-hook about the niche event, never "cruise deal" positioning
- [ ] DM every commenter with campaign landing page slug directly — highest-converting entry point

**TikTok Lead Gen Ads — Post Validation (§5.5B)**
- [ ] Activated only after Day 30 Decision Gate signals Scale (3+ Strong metrics)
- [ ] Interest & Behavior targeting: niche identity categories matching the campaign theme
- [ ] Lookalike: seeded from TikTok profile matches of existing DynamoDB organic commenters — NOT travel/vacation interest sets
- [ ] Creative: reuse Phase 2B HeyGen/ElevenLabs assets — same content as organic, native TikTok format

### 6B. Lead Nurture (§5.2)
- [ ] Klaviyo/Beehiiv 3-part email sequence (T+0, T+3d, T+7d)
- [ ] Sequence content references the **niche activity**, not the cruise — the ship is the venue, not the headline
- [ ] Twilio SMS on `THRESHOLD_MET` status change

### 6C. Privacy-First Attribution (§5.3)
- [ ] Meta Conversions API (CAPI) — server-side event ping from DynamoDB write Lambda

### 6D. Budget Auto-Scaling
- [ ] Agent reads waitlist count every 24h
- [ ] Tier 1 ($5/day) → Tier 2 ($15/day) → Tier 3 ($30/day) based on traction
- [ ] Auto-pause on 0 signups after 48h

### 6E. Synthetic Influencer Assets (§5.4)
- [ ] ElevenLabs "Hype-Man" voice for video ads
- [ ] HeyGen AI avatar "Specialist" video — persona is a niche expert (e.g., photographer, gamer), not a travel agent
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
- [ ] TikTok Organic (zero budget): post niche-targeted concept video, DM commenters directly
- [ ] Tier 1 Targeted Ads ($5–10/day): Google Custom Intent (niche keywords only) + Meta Lead Ads (niche interests only)
- [ ] Seed Phase budget ceiling: ~$300/month per campaign
- [ ] All paid leads → DynamoDB via webhook → Klaviyo nurture sequence
- [ ] **Targeting enforcement**: implementation of ad platform calls MUST pull `campaign.targetingKeywords` as the audience seed. No travel, cruise, or vacation category terms may be added. Violation of this breaks the niche-identity acquisition model.

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
