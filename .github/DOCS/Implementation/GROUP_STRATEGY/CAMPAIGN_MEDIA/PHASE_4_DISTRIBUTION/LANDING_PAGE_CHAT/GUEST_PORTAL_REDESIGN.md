# Interactive Guest Portal — Redesign Spec

**Status:** In progress (2026-05-06)
**Owner:** Curtis (product) / Claude Code (implementation)
**Replaces conceptually:** "Campaign landing page" → "Interactive Guest Portal"
**Touches:** [components/campaign-landing/*](../../../../../../components/campaign-landing/), [lib/campaigns/landing/view-model.ts](../../../../../../lib/campaigns/landing/view-model.ts), [app/(landing)/groups/[slug]/page.tsx](../../../../../../app/(landing)/groups/[slug]/page.tsx), [app/(tests)/tests/campaign-landing/[slug]/page.tsx](../../../../../../app/(tests)/tests/campaign-landing/[slug]/page.tsx)

---

## 1. Diagnostic — what we have today vs. what the guide promises

### What VISUAL_SYSTEMS.md asks for
Four full visual systems (System 1 Editorial, System 2 Nostalgia, System 3 Zine, System 4 Modular). Each is a complete **world**: hero treatment, body sections, itinerary format, social cards, merch, audio register. System 4 is the structural base; Systems 1–3 are expressive overlays selected by `identityBlueprint.visualFlavor`.

### What we actually ship today
| Layer | Status | Evidence |
|---|---|---|
| **Hero** | ✅ Faithful to all 4 systems | [landing-system-heroes.tsx](../../../../../../components/campaign-landing/landing-system-heroes.tsx) renders Editorial / Nostalgia / Zine / Modular heroes with masthead, postcard, polaroid collage, and modular-type variants. |
| **Page body** | ❌ Generic two-column shell with system-aware tinting | [landing-page-visual-system.tsx:319-489](../../../../../../components/campaign-landing/landing-page-visual-system.tsx#L319) — same status panel, experience list, FAQ, trust grid for every system. Only colors and a few fonts change. |
| **Itinerary** | ⚠️ Single component, theme-tinted | [landing-system-itinerary.tsx](../../../../../../components/campaign-landing/landing-system-itinerary.tsx) — does not produce System-1 voyage-contents-as-TOC, System-2 boarding-pass strip, or System-3 tracklist as distinct artifacts. |
| **Tour Conductor chat** | ❌ Sidebar widget (390px sticky right rail) | [landing-page-visual-system.tsx:438-441](../../../../../../components/campaign-landing/landing-page-visual-system.tsx#L438) renders [LandingPageTourConductor](../../../../../../components/campaign-landing/landing-page-tour-conductor.tsx) variant=`sidebar`. Reads as a Walmart support widget. |
| **Width** | ❌ `max-w-7xl` everywhere | Never goes full-bleed. Modern engagement-first products run edge-to-edge. |
| **Visual flavor selection** | ❌ Auto-only, no override | [identity-blueprint.ts:451-456](../../../../../../lib/campaigns/design-system/identity-blueprint.ts#L451) selects flavor deterministically from `energyMode`. There is no per-campaign override and no preview/audition surface. |

### Net answer to "are we even following the guide?"
Hero yes. Everything else, no — the rest of the page is a single layout with theme tinting bolted on top. The chat and the page width also undermine the engagement model the guide implies.

---

## 2. Reframe: this is a portal, not a landing page

**Old model (2024):** Read the page → join a list. Page is a brochure with a chat widget.
**New model (2026):** Walk into a room → see who's already there → see what they're saying → join updates → talk. Page is a *room with collateral on the walls.*

This reframe drives every other decision below.

### Page hierarchy (top to bottom)
1. **Voyage Hero** — system-themed, full-bleed (existing 4 hero variants).
2. **Group Chat Hall** — full-width Discord-tier shared chat, system-themed. Above-the-fold or just below the hero. *Centerpiece.*
3. **Trip Status Strip** — group progress, pricing, threshold. Compact.
4. **Voyage Brief Sections** — what it is, what to expect, why now (system-distinct treatments — Phase B work).
5. **System-flavored Itinerary** — TOC (System 1), Boarding Pass (System 2), Tracklist (System 3), Module Grid (System 4) (Phase B work).
6. **CTA Strip** — waitlist + book now.
7. **Trust + FAQ + Footer**.

The chat is the second thing a visitor sees, not a corner widget.

---

## 3. The four-system override + audition mechanism

### Three layers of selection (highest precedence first)
1. **URL override (preview only):** `?flavor=editorial_magazine` (or `travel_nostalgia` / `indie_zine` / `none`) on the test/preview routes. Lets you A/B in the browser without writing to the DB.
2. **Persisted manual override:** new `Campaign.manualVisualFlavor` field. Once set, takes precedence over identity-blueprint inference. Cleared = "auto."
3. **Auto from energy mode:** existing `selectVisualFlavor(energyMode)` in `identity-blueprint.ts` — unchanged behavior, used when no override present.

### Audition flow (test/preview surface)
On `/tests/campaign-landing/[slug]`, a sticky toolbar at the top exposes:
- A 4-button switch: Editorial | Nostalgia | Zine | Modular (currently active = highlighted).
- Reads/writes the URL `?flavor=` so each click rerenders the same campaign in a different system instantly.
- A "Lock this flavor" button that PATCHes `Campaign.manualVisualFlavor` to make the choice durable. Lives next to existing `ReviewControls`.

### Why this design
- Decouples *exploration* (URL param) from *commitment* (DB field). The user can audition all four flavors in 30 seconds without polluting state.
- Existing auto-selection stays. Override is additive.
- Public route honors the persisted override but ignores URL params (preview-only).

---

## 4. The Group Chat Hall — Discord-tier, not Walmart-tier

### Layout (full-width, no `max-w-7xl`)
```
┌───────────────────────────────────────────────────────────────────────────────┐
│ TC Channel header  · 4 voyagers in thread · 47% filled         [Pin starter] │
├──────────────┬──────────────────────────────────────────┬─────────────────────┤
│              │                                          │                     │
│  Channel     │  Conversation stream                     │  Idea board         │
│  rail        │  ───────────────────                     │  (suggestions feed) │
│              │  Ghost Guest · STARTER                   │                     │
│  # voyage-   │  > What is this cruise about?            │  + Add an idea      │
│    main      │                                          │                     │
│  # ideas     │  Tour Conductor · HOST                   │  > Vinyl listening  │
│  # logistics │  > Brilliance of the Seas, Eastern       │    table at sunset  │
│  # meetups   │    Caribbean, 6 nights ...               │  > Catan tournament │
│              │                                          │  > Family game day  │
│  Active now  │  [more turns]                            │                     │
│  • Sara K.   │                                          │  Pin board          │
│  • Marcus    │                                          │  ────────────────   │
│  • Ghost     │                                          │  📌 Departure date  │
│              │                                          │  📌 Cabins needed   │
│              │  ───────────── compose ───────────────   │  📌 Ship reference  │
│              │  [signup gate OR textarea]               │                     │
└──────────────┴──────────────────────────────────────────┴─────────────────────┘
```

### Key features
- **Three-column layout** at desktop; collapses to single column on mobile (channel rail becomes a popover, idea board moves below conversation).
- **Channel rail (left):** Pinned starter post, "active now" presence, channel-style topic chips (`# main`, `# ideas`, `# logistics`, `# meetups`). Topic chips filter the conversation feed.
- **Conversation stream (center):** Same data source as today (`chat-storage`), but rendered as named messages with role badges (`HOST`, `STARTER`, `GUEST`). Tour Conductor messages get the host badge and accent border.
- **Idea board (right):** Distinct UI for `suggestionCategory: 'excursion'|'activity'|'project'`. Visitors can submit an idea inline; ideas pin separately from chat. Future hookup point for the suggestion-extraction tool described in [feature-specification.md](feature-specification.md).
- **Signup gate as overlay, not replacement:** Visitors see the full chat + ideas immediately. Compose surface is overlaid by a gentle "join updates to talk" card. Reading is unrestricted.
- **System-themed shell, single component:** One `GroupChatHall` component reads `landing.designSystem.system` and applies a per-system skin (Modular = dark glass; Editorial = letters-to-the-editor cream; Nostalgia = postcard mailroom; Zine = corkboard). Skin lives in a small `chatHallTheme()` helper, not duplicated components.

### What we do NOT build in v1
- Realtime WebSocket presence — we keep 15s polling like the current widget. "Active now" is faked from the recent message author list.
- Per-channel separate streams. Topic chips filter the same conversation; we save the channel taxonomy work for v2.
- Inline suggestion → manifest extraction. The suggestion list is read/write to a new column in chat storage; the automated insight extraction described in `feature-specification.md` §5 is downstream.

---

## 5. Phasing

| Phase | Deliverable | Ship gate |
|---|---|---|
| **A — Foundation** *(this PR)* | Manual flavor override field, URL param, audition toolbar, full-bleed Guest Portal shell, GroupChatHall scaffold replacing the sidebar TC. | All four system heroes still render; chat is now centerpiece; user can audition all four flavors on `board-games-at-sea`. |
| **B — System bodies** | Per-system body sections: System 1 voyage TOC + contributor card; System 2 boarding-pass strip + air-mail social; System 3 tracklist + sticker sheet + polaroid pinned posts; System 4 module strip. | Each campaign clearly *feels* like its system end-to-end, not just at the hero. |
| **C — Chat depth** | Real channel topics (separate streams), idea-extraction tool wiring, lead/SMS opt-in tool, hosted Tour Conductor agent persona refinement. | Chat earns its centerpiece position. Suggestions become structured campaign data per `feature-specification.md`. |

**This document covers Phase A.** Phase B and Phase C will get their own implementation notes in this directory when they ship.

---

## 6. Implementation map (Phase A)

### Schema + types
- `lib/campaigns/types.ts` — add optional `manualVisualFlavor?: VisualFlavor` to `Campaign`.
- `lib/campaigns/schema.ts` — already exports `VisualFlavorEnum`; no change.
- `lib/campaigns/landing/view-model.ts` — `buildLandingDesignSystem` accepts optional `flavorOverride: VisualFlavor` parameter and consults `campaign.manualVisualFlavor` before falling back to `identityBlueprint.visualFlavor`. `getCampaignLandingBySlug` accepts and threads `flavorOverride` through.

### Routes
- `app/(landing)/groups/[slug]/page.tsx` — public page. Honors `campaign.manualVisualFlavor` only. Ignores URL params.
- `app/(tests)/tests/campaign-landing/[slug]/page.tsx` — preview page. Reads `searchParams.flavor` and passes it as `flavorOverride`. New audition toolbar above the existing `ReviewControls`.

### Components
- New: `components/campaign-landing/guest-portal.tsx` — replaces `landing-page-visual-system.tsx` as the page shell. Full-bleed, hero → chat → status → body → CTA order.
- New: `components/campaign-landing/group-chat-hall.tsx` — Discord-tier chat hall. Replaces sidebar TC.
- New: `components/campaign-landing/flavor-audition-toolbar.tsx` — preview-only switcher.
- Keep: `landing-system-heroes.tsx`, `landing-system-itinerary.tsx`, `waitlist-form.tsx` — used as-is by the new shell.
- Deprecate (do not delete yet): `landing-page-visual-system.tsx`, `landing-page-tour-conductor.tsx`, the `landing-page-{gpt,kimi,gemini,claude}.tsx` design exploration files. They are useful as references during Phase B.

### API
- No new endpoints in Phase A. Existing `/api/groups/campaign/[slug]/chat` GET/POST is reused by `GroupChatHall`.
- Phase C will add `subscribeToCampaignUpdates` and an idea-submission endpoint as described in the feature spec.

---

## 7. Acceptance — Phase A

A reviewer should be able to:
1. Open `http://localhost:3000/tests/campaign-landing/board-games-at-sea` and see the **postcard hero** (since this campaign auto-selects `travel_nostalgia`).
2. Click **Editorial** in the audition toolbar → URL becomes `?flavor=editorial_magazine` and the page rerenders with the magazine cover hero. Click **Zine** → polaroid collage. Click **Modular** → dark type-driven hero.
3. Click **Lock** → the campaign is patched with `manualVisualFlavor`, and visiting `/groups/board-games-at-sea` (no preview) renders the locked flavor.
4. Scroll past the hero and see a **full-width Group Chat Hall**, not a 390px sidebar widget. The hall has three columns (channel rail, conversation, idea board) and a signup-gated compose surface.
5. The page has no `max-w-7xl` shell at the outermost level — the hero, chat hall, and CTA strip all run edge to edge.

If any of those fail, Phase A is not done.

---

## 8. Open questions / follow-ups

- **Suggestion / idea board persistence.** Phase A renders the idea-board column but stores submissions in conversation history with a `[idea]` prefix. Phase C should add a typed table.
- **Channel topic chips actually filter.** Phase A renders chips; Phase C wires the filter into chat storage queries.
- **Per-system body rebuild.** Phase B is non-trivial — each system needs its own itinerary artifact, social card, and section treatment as described in `VISUAL_SYSTEMS.md`. The current single-itinerary component will be split.
- **Mobile chat hall.** Phase A ships a basic responsive collapse. Phase C should consider a dedicated mobile layout (sheet-based channel switcher, full-screen compose modal).

---

## 9. Idea board copy register — known data gap (requires brief engine fix)

### Problem

The `IdeaBoard` in the Group Chat Hall seeds its "Pinned" items from `landing.story.guestInvitations`. This field is built by `buildGuestInvitations()` in `lib/campaigns/landing/view-model.ts`, which pulls from:

1. `campaign.optionalGatheringMoments` (discovery pipeline)
2. `brief.communityExpression.optionalGatherings` (brief engine)
3. `brief.communityExpression.belongingSignals` (brief engine)

**These fields were designed for dual use** (image generation + landing copy), but they drift toward the cinematographer register: *"a café table with a rotating library of open games, chips and drinks already poured, guests pulling up chairs as they pass by."* This is a camera-pose image cue, not a guest invitation.

`brief.visual.plausibilityFramework.nicheEnhancedMoments` is the worst offender and has been **explicitly excluded** from `guestInvitations`. It feeds only `whatToExpect` (used in the "On board" section) and the image generation pipeline.

### Correct register for the idea board

The idea board needs strings written from the **guest's action POV**:

| ❌ Camera pose (current) | ✅ Guest invitation (needed) |
|---|---|
| "a café table with a rotating library of open games, chips and drinks already poured, guests pulling up chairs as they pass by" | "Open game tables in the café — pull up a chair any time, no sign-up needed" |
| "an aft deck railing at golden hour with a travel-sized game laid out on a folded jacket" | "Bring a travel game to the stern deck at sunset — there's always a rail spot" |

### Layer 3 fix — brief engine

Add `communityExpression.activityInvitations` to `CommunityExpressionSchema` in `lib/campaigns/schema.ts`:

```typescript
activityInvitations: z.array(z.string()),
// 4-6 things a guest would tell a friend they got to do on this trip.
// Format: short, action-forward, present-tense.
// e.g. "Play whatever you brought to the open café tables any day at sea."
// NOT a camera direction. NOT a scene description.
```

And add the corresponding prompt instruction to the brief engine (wherever `optionalGatherings` is currently prompted):

```
communityExpression.activityInvitations: 4-6 short activity invitations written
from the guest's perspective ("you can...", "bring...", "join..."). These appear
verbatim in the Group Chat Hall idea board. They must NOT read as scene descriptions
or camera directions. Each should be one sentence, action-forward, and specific
to this niche on a cruise ship.
```

### Patching existing campaigns

Until the brief engine re-runs, `buildGuestInvitations()` falls back to `optionalGatheringMoments` (the most invitation-adjacent field available). To improve the idea board for a specific campaign without re-running the full brief, PATCH `campaign.optionalGatheringMoments` directly:

```powershell
# Example for board-games-at-sea
$body = @{
    optionalGatheringMoments = @(
        "Open game tables in the café — pull up a chair any time, no sign-up needed",
        "Bring a travel game to the stern deck at sunset — there's always a rail spot",
        "Two-player corner in the quiet lounge — set up a game and a 'join if you like' card",
        "Strategy game breakfast — the corner table by the window is yours from 8am",
        "Suggest a game swap or trade night — the Conductor will set it up if enough guests want it"
    )
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/groups/campaign/board-games-at-sea/patch-discovery" -Method POST -Body $body -ContentType "application/json"
```

Or, if no dedicated patch-discovery endpoint exists, PATCH via DynamoDB directly or by adding a simple endpoint to `app/api/groups/campaign/[slug]/route.ts` that accepts `optionalGatheringMoments` alongside the existing `status` and `manualVisualFlavor` fields.
