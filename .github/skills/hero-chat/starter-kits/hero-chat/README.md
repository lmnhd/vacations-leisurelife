# Hero Chat Starter Kit

A framework-agnostic React/TypeScript scaffold for a Hero-first AI chat UI with text+voice session carryover.

## Included
- `src/types.ts`: shared interfaces
- `src/apiClient.ts`: chat API client
- `src/session.ts`: stable session ID utility
- `src/useHeroChat.ts`: stateful hook
- `src/HeroChatContainer.tsx`: top-level orchestration component
- `src/TypewriterHeadline.tsx`: hero headline renderer
- `src/HeroInputBar.tsx`: text + mic input bar
- `src/UserMessageRail.tsx`: compact user-history rail
- `src/VoiceSurface.tsx`: voice-mode placeholder shell

## Integration Notes
1. Replace `chatEndpoint` with your real route.
2. Replace `VoiceSurface` internals with your live speech pipeline.
3. Keep `sessionId` stable across text and voice.
4. Ensure backend stores conversation history by `sessionId`.

## Prompt Governance
Keep one prompt source of truth on server:
- Shared core prompt logic
- Channel addenda for text vs voice style only
- No separate UI-specific prompt forks
