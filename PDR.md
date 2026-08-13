# Project Design Record - Vacations LeisureLife

**Updated**: February 3, 2026
**Framework**: Next.js 14
**Status**: Active development

---

## 1. Project Overview

Vacation booking platform with cruise and destination management capabilities.

**Problem Statement**: [To be Determined or Refined]

**Solution Approach**: [To be Determined or Refined]

---

## 2. Core Objectives

- [ ] Provide seamless booking experience for cruises and vacations
- [ ] Integrate with external APIs for inventory (implies custom cruises/manual booking)
- [ ] Manage customer data securely (Clerk setup)

---

## 3. Technical Stack

| Component | Technology | Notes |
|-----------|-----------|-------|
| Framework | Next.js 14 | |
| Language | TypeScript | |
| Database | Prisma (PostgreSQL likely) | |
| Key Services | OpenAI, Clerk, Stripe | |
| Deployment | TBD | |

---

## 4. Architecture

### High-Level Structure

- `app/`: Next.js App Router
- `components/`: UI Components
- `lib/`: Utilities and Shared Logic
- `prisma/`: Database Schema

### Key Components

- **Booking System**: `Booking/` components
- **Chat**: `components/crisp-chat.tsx`
- **Auth**: Clerk integration `(auth)/`

---

## 5. Data Models

See `prisma/schema.prisma` for definitive source.

---

## 6. Voice Assistant (August 2026)

The canonical voice architecture (public `/voice-assistant` showcase, Booking
Assistant voice mode, and the Twilio/OpenAI Realtime SIP telephone path) is
documented in `.github/DOCS/Implementation/VOICE_ASSISTANT/VOICE_ASSISTANT_CANONICAL_PLAN.md`.
Key rules for future work:

- OpenAI Realtime uses the GA client-secret contract (`/v1/realtime/client_secrets`,
  `/v1/realtime/calls`) with `gpt-realtime-2.1` / `gpt-realtime-2.1-mini` resolved
  through `lib/ai/llm-gateway`. The GPT-4o Realtime preview is deprecated; do not
  restore it.
- All conversations start from a server-validated `ConversationLaunchEnvelope`
  (`lib/conversation/`); public clients never supply prompt text, skill paths,
  tools, or context blobs.
- `Voice_SMS_CHAT.md` and `CHANNEL_UNIFIED_AGENT_RUNBOOK.md` are non-authoritative
  demo material; `PAYMENT_FLOW.md` Plan A is obsolete.
