# Package Builder — Implementation Complete

Completed: 2026-02-25

---

## Overview

The Package Builder is a synthesis engine that consolidates raw cruise data, calculates holistic per-party costs, injects deterministic Agent Perks, applies deposit tier rules, and returns a fully typed `CruisePackage` object rendered as a rich `PackageCard` UI component. It supports single-package presentation and side-by-side comparison of 2–3 options simultaneously, with each card containing a "Book Now" button that deep-links directly into the Odysseus booking system.

---

## Architecture & Components

| Layer | File |
|---|---|
| **Type Definitions** | `lib/chat/types.ts` |
| **Tool JSON Schema** | `lib/chat/prompt-data/tools/construction/package-builder.json` |
| **Handler Logic** | `lib/chat/tools/package-builder.ts` |
| **UI Component** | `components/chat/PackageCard.tsx` |
| **Tool Dispatcher** | `lib/chat/tool-dispatcher.ts` |
| **Prompt Schema** | `lib/chat/prompt-data/prompt-schema.json` |
| **LLM Skill** | `lib/chat/prompt-data/skills/booking/package-presentation.md` |
| **Test Page** | `app/(tests)/tests/package-builder/page.tsx` → `/tests/package-builder` |
| **API Endpoint** | `app/api/tests/package-builder/route.ts` + `core-logic.ts` |

---

## Types Added (`lib/chat/types.ts`)

- `PackageLineItemCategory` — `"cruise_fare" | "taxes_fees" | "excursion" | "agent_perk" | "gratuities" | "deposit"`
- `PackageLineItem` — Per-line cost row: `category`, `label`, `unitPrice`, `quantity`, `totalPrice`, `isSavings`
- `DepositTier` — `"standard" | "promo" | "group"`
- `AppliedPerk` — `{ perkCode, label, savingsAmount }`
- `CruisePackage` — The fully built output object per cruise option
- `PackageBuilderCruiseInput` / `PackageBuilderExcursionInput` — Typed inputs
- `PackageBuilderInput` — Per-package request shape
- `PackageBuilderOutput` — `{ packages: CruisePackage[], comparisonMode: boolean }`
- `DisplayDirective.packageCard` — `CruisePackage | CruisePackage[]` (injected into chat response)

---

## Handler Mechanics (`lib/chat/tools/package-builder.ts`)

1. **Input Validation** — Zod schema validates each `PackageBuilderInput` before processing.
2. **Cost Calculation** — Builds `lineItems[]`: cruise fare, taxes/fees, gratuities, excursions (per-pax × guest count).
3. **Agent Perks Registry** — Five pre-defined perks (`OBC50`, `OBC100`, `FREE_GRATS`, `UPGRADE_GUARANTEE`, `KIDS_SAIL_FREE`) are applied deterministically by `perkCode`. Each perk generates a negative-value savings line item.
4. **Deposit Tier Rules**:
   - `standard` → $250/pp
   - `promo` → 8.5% of base fare/pp (rounded)
   - `group` → $50/pp flat
5. **Package ID** — `PKG-` + 5-char alphanumeric (e.g., `PKG-PVAVK`), generated via `crypto.randomBytes`.
6. **Odysseus Booking URL** — Deep-link constructed as: `https://bookings.cruisebrothers.com/booking?itinerary={code}&guests={n}&sail={date}&agent=LL`
7. **Output** — Returns `PackageBuilderOutput` with `comparisonMode: true` when >1 package is submitted.

---

## UI Component (`components/chat/PackageCard.tsx`)

- **Single mode**: Renders one `CruisePackage` as a full-width dark card.
- **Comparison mode**: Renders 2–3 cards side-by-side with a "Comparing N Options" header badge.
- **Card sections**:
  - Header: ship name, itinerary code badge, night count badge
  - Meta row: departure port, sail date, guest count
  - Agent Perks badge: green savings banner listing applied perk codes + total savings amount
  - Line-item table: color-coded rows (savings rows render in green with `−` prefix)
  - Price summary footer: subtotal before perks, bold total package price, per-person rate
  - Deposit CTA: heart icon + deposit amount due today
  - Book Now button: links directly to Odysseus booking URL (opens in new tab)
  - Footer: Package ID + "Powered by Cruise Brothers"

---

## Tool Dispatcher Integration (`lib/chat/tool-dispatcher.ts`)

- Added `PackageBuilderPayloadSchema` (Zod) to validate dispatcher input.
- Added `package_builder` switch case that calls `runPackageBuilder` and injects the output into `DisplayDirective.packageCard`.
- Context registration: `fast_booking.package_presentation` (see `prompt-schema.json`).

---

## LLM Invocation Rules (`package-presentation.md`)

The skill file specifies deterministic trigger conditions:
- Invoke `package_builder` when the agent is ready to present 1–3 cruise options.
- Always apply `FREE_GRATS` if gratuity data is available.
- Use `depositTier: "promo"` for any deal sourced from the CB Scraper or Odysseus promos.
- Use `depositTier: "group"` when a group block allocation is involved.
- Pass `comparison_mode: true` when presenting multiple options side-by-side.

---

## Test Harness

**URL**: `http://localhost:3000/tests/package-builder`

- Left panel: editable JSON payload (pre-filled with a 2-package comparison sample).
- Right panel: raw JSON output from the handler.
- Bottom: live `PackageCard` preview — exactly as it will render in Hero Chat.

**Verified working**:
- Two-package comparison rendered side-by-side ✅
- Agent Perks calculated and displayed (OBC50 + FREE_GRATS → $352 saved) ✅
- Deposit tiers applied correctly (standard $500 vs promo $196) ✅
- Book Now → correct Odysseus deep-link with `agent=LL` parameter ✅
- Unique `PKG-XXXXX` IDs generated per package ✅
- 0 TypeScript errors ✅
