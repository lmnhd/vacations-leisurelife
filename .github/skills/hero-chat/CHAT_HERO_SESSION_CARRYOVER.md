# Chat Hero Session Carryover (Text → Voice)

This document describes how this repo now preserves conversation continuity when switching from the Hero text chat into voice mode.

## What was implemented

- `ChatHero` owns a single stable `sessionId`.
- Text chat calls (`/api/chat`) use that `sessionId`.
- Voice mode launch from hero mic passes the same `sessionId` into `VoiceChat`.
- `VoiceChat` now accepts:
  - `sessionId?: string`
  - `handoffPrompt?: string`
- During voice connect, `VoiceChat` sends either:
  - custom `handoffPrompt` (if chat history exists), or
  - default phone greeting prompt.

## Files changed

- `frontend/src/components/ChatHero.tsx`
  - passes `sessionId` and `handoffPrompt` to `VoiceChat`
- `frontend/src/components/VoiceChat.tsx`
  - accepts `sessionId`/`handoffPrompt`
  - initializes `sessionIdRef` from prop when provided

## Why this keeps context

Backend chat history is keyed by `sessionId`. Reusing the same ID across text and voice means the assistant can access prior turns after handoff, rather than starting a new thread.

## Current voice response path

- Voice user speech -> `/api/chat` (channel `voice`) -> assistant text
- Assistant text -> `/api/tts` -> spoken output

This remains compliant with the unified prompt approach because both text and voice channels flow through the same prompt assembly system in the backend.

## Realtime API compatibility

You can still adopt Realtime API for voice while keeping continuity by:

1. Using shared runtime prompt endpoint (`/api/agent-config/phone`)
2. Attaching the same conversation/session identity metadata
3. Keeping a single policy/prompt source of truth (prompt builder + agent config)

## Limits and notes

- In-memory session storage means continuity exists while server memory is warm.
- If process restarts or memory clears, session continuity resets unless persisted.
- For durable continuity, persist conversation turns to DynamoDB keyed by `sessionId` and rehydrate on request.
