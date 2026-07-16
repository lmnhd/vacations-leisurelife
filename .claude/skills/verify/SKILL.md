---
name: verify
description: How to runtime-verify changes to this Next.js app (deals operator dashboard, public pages, API routes)
---

# Verifying changes in this repo

## Handle

- The operator usually already has `next dev` running on **http://localhost:3000** (check with `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/`). It hot-reloads file edits — no rebuild needed. Only start your own (`npm run dev`) if :3000 is down.
- Drive with **Playwright** (a devDependency, chromium already installed): write a throwaway `.mjs` script (`import { chromium } from "playwright"`), run with `node`, screenshot to a temp dir, delete both afterwards.

## Key surfaces

- Deals operator dashboard: `/admin/deals-system?tab=inventory|tools|pipeline|health` (same view as `/tests/deals-system`). No auth in dev.
- Operator deal mutations: `POST /api/tests/deals-system/curated-deal` with `{ action, dealId }` (actions incl. `pin/unpin/hide/unhide/approve/delete`). Per-deal activity: `GET /api/tests/deals-system/deal-activity?dealId=…`.
- `dealId` = Odysseus packageId verbatim (shown on each card as "package NNNNNNN").

## Gotchas

- **Operator APIs write to live DynamoDB** (`lll-deals-system`) — the same store production reads. Any state you mutate while verifying (pin/hide/approve) must be reverted before finishing (e.g. `hide` → `unhide`).
- After a mutation the dashboard calls `router.refresh()` and re-sorts the list — a Playwright click fired during that reflow can land on a neighboring card's button. Wait ~1.5–2.5s after each mutating click, and re-resolve locators (don't reuse stale bounding boxes / `page.mouse` coordinates).
- `npm run lint` is broken (`next lint` invalid project directory) — pre-existing; use `npx tsc --noEmit` for static checks, but the verdict comes from driving the app.
- Typecheck takes ~1–2 min; the dev server compiles routes lazily, so the first page load after an edit is slow — use generous timeouts and `waitUntil: "networkidle"`.
