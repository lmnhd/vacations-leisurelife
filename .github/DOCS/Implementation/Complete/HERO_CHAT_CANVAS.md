# Hero Chat Canvas — Implementation Spec

**Location:** `app/(tests)/tests/hero-chat/page.tsx`
**Status:** Complete (Test Scaffold)
**Channel:** `text` | `voice` (toggle-ready)

---

## Overview

The Hero Chat Canvas is a full-screen interactive chat UI designed to be the primary surface for the Leisure Life agent experience. It consists of:

- A cinematic **Hero Headline** that animates based on response length
- A **Hero Image / Slideshow** for contextual visuals
- A **Dynamic Form** injected by the agent via JSON directives
- A responsive **Conversation History Drawer**
- A **Voice/Text toggle** input bar
- A **floating particle background** for ambient depth

---

## Architecture

### Hook: `useHeroChat`

Central state machine for the chat experience.

| State | Type | Purpose |
|-------|------|---------|
| `messages` | `ChatMessage[]` | Full conversation log, including display directives per turn |
| `headline` | `string` | Currently displayed text on the hero canvas |
| `headlineTurn` | `number` | Key for triggering animation resets |
| `activeForm` | `ParsedFormDirective \| null` | Currently visible form; null when no form shown |
| `isLoading` | `boolean` | Pipeline in-flight |
| `sessionId` | `string` | Stable per-page-load session identifier |

**Key methods:**

- `sendText(text)` — posts to `/api/tests/chat`, updates `messages`, applies `display` directives from response
- `viewPastTurn(index)` — **View-Only History Navigation**: restores headline and form state from a past message without modifying the conversation log. New input always appends to the end.

---

## Display Pipeline

```
LLM Raw Output
    ↓
parseResponse()   →   { cleanText, image?, form? }
    ↓                         ↓              ↓
 Spoken / Typed          Image fetch      Form rendered
 (TTS-safe)             on canvas        on canvas
```

The parser (`lib/chat/response-parser.ts`) strips all directives from `cleanText` before it is stored in history or sent to TTS. Voice mode only ever receives clean prose.

---

## Directive System

Agents embed directives inline in their response. These are parsed and stripped before display.

| Directive | Syntax | Effect |
|-----------|--------|--------|
| Single Image | `[Image: "query"]` | Fetches the default (or Nth) image |
| Indexed Image | `[Image: "query" (3)]` | Fetches specifically the 3rd result |
| Slideshow | `[Images: "query" (N)]` | Fetches N images, renders a slideshow |
| Form | `[Form: { "id": "...", "fields": [...] }]` | Renders agent-defined form on canvas |

> **Rule:** Images and forms are **mutually exclusive**. When a form is active, the image is hidden. When a form is submitted, images can reappear.

---

## Layout System

Layout adapts automatically based on text length and viewport:

| Condition | Layout |
|-----------|--------|
| `text.length < 100` | Typewriter mode — full centered column |
| `100 ≤ text.length ≤ 500` | Word Stream mode — full centered column |
| `text.length > 500` + desktop | **Cinematic mode** — split: text left, form/image right (only if right panel has content) |
| Mobile (any length) | Always full centered column |

---

## Form System (`ParsedFormDirective`)

Forms are defined by the agent as JSON embedded in a `[Form: {...}]` directive.

**Schema:**
```json
{
  "id": "unique_form_id",
  "title": "Optional heading",
  "fields": [
    { "name": "destination", "type": "select", "label": "Preferred Destination", "options": ["Caribbean", "Alaska"] },
    { "name": "passengers", "type": "number", "label": "Passengers", "min": 1, "max": 10 },
    { "name": "email", "type": "email", "label": "Email" }
  ]
}
```

**Supported field types:** `text` | `select` | `number` | `email` | `date`

On submit, form data is serialized as `Form Submitted: [key: value, ...]` and sent as a user message through the normal chat pipeline. The form submission message is filtered from the visible `UserMessageRail` (it appears only in the Conversation Drawer history).

---

## History Navigation (View-Only)

Clicking any past message in the `ConversationDrawer` calls `viewPastTurn(index)`:
- Restores the headline text and form state for that turn
- **Does not** modify the message log — the conversation remains linear
- Any new input appended after viewing is added to the end of history as normal
- Messages with forms attached show a `📋 Form attached` badge in the drawer

---

## Voice Mode

The mic toggle in the input bar switches between text and voice UX:
- **Text mode** (default): input enabled, send button active
- **Voice mode**: input disabled, mic button pulses red, send button disabled

`cleanText` (post-parser) is always what would be passed to TTS — all `[Image: ...]` and `[Form: {...}]` directives are stripped before any voice output.

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/tests/chat` | POST | Chat pipeline; returns `{ reply, sessionId, display? }` |
| `/api/tests/image-search` | POST | Searches Google Custom Search; accepts `query`, `count?`, `index?` |

---

## Files

| File | Role |
|------|------|
| `app/(tests)/tests/hero-chat/page.tsx` | Full UI — all components co-located for test iteration speed |
| `lib/chat/response-parser.ts` | Extracts `image`, `form` directives from raw LLM output |
| `lib/chat/types.ts` | `ChatMessage`, `ParsedFormField`, `ParsedFormDirective`, `DisplayDirective` |
| `lib/chat/pipeline.ts` | LLM call + `parseResponse` + display directive assembly |
| `app/api/tests/chat/core-logic.ts` | Chat route handler |
| `app/api/tests/image-search/core-logic.ts` | Image search route handler |
| `lib/services/media/google-images.ts` | Google Custom Search API wrapper |
