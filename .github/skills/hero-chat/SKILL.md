---
name: hero-chat
description: Build a cinematic hero section where the primary headline is the live agent response, with text and voice modes sharing one unified conversation session and prompt system.
---

# Hero Chat Skill (Complete Agnostic Blueprint)

Use this skill when you need a hero-first conversational experience where the hero headline is the AI response, text and voice share one session, and prompt governance stays unified across channels.

## Outcome

This pattern gives you:
- A cinematic hero with typewriter assistant headline
- Fast text interaction from a compact hero input
- Optional voice mode handoff from the same surface
- Session continuity across text/voice (`sessionId` stays stable)
- One prompt source of truth (channel-specific addenda only)

## Reference File Structure

```txt
src/
  features/hero-chat/
    types.ts
    apiClient.ts
    session.ts
    HeroChatContainer.tsx
    TypewriterHeadline.tsx
    HeroInputBar.tsx
    UserMessageRail.tsx
    VoiceSurface.tsx
    useHeroChat.ts
  server/
    chatRoute.ts
    ttsRoute.ts
    promptBuilder.ts
```

## 1) Shared Types

```ts
export type Role = 'user' | 'assistant'
export type Channel = 'text' | 'voice'

export type PersonaKey = 'professional' | 'laidback' | 'hustler'
export type VoiceName = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'

export interface ChatMessage {
  id: string
  role: Role
  content: string
  timestamp: number
}

export interface ChatRequest {
  message: string
  sessionId: string
  channel: Channel
  phone?: string
  persona?: PersonaKey
}

export interface ChatResponse {
  reply: string
  sessionId: string
  error?: string
}

export interface HeroChatConfig {
  chatEndpoint: string
  ttsEndpoint: string
  initialHeadline: string
  seededAssistantMessage?: string
}

export interface VoiceSurfaceProps {
  sessionId: string
  persona: PersonaKey
  handoffPrompt?: string
  voiceOverride?: VoiceName
  onEnd: () => void
}
```

## 2) Session Rules (Critical)

1. Create `sessionId` once in `HeroChatContainer`.
2. Use the exact same `sessionId` for all text sends.
3. Pass the same `sessionId` when opening voice mode.
4. Backend history store must key by `sessionId`.
5. Optional handoff prompt only when user history exists.

## 3) Server Contract (Chat)

Your chat route should:
- Accept `message`, `sessionId`, `channel`.
- Seed system prompt once per session.
- Optionally seed assistant opener for hero-web sessions.
- Return `reply` every turn.
- Never return empty string replies (final guard fallback).

Generic pseudo-flow:

```ts
if (!historyFor(sessionId)) {
  history = [systemPrompt]
  if (isHeroWebChat) history.push({ role: 'assistant', content: seededOpening })
}

history.push({ role: 'user', content: message })

const modelReply = await callLLM(history, tools, channel)
const reply = normalizeReply(modelReply) || "I can help—what phone model and repair do you need?"

history.push({ role: 'assistant', content: reply })
return { reply, sessionId }
```

## 4) Hero Chat Hook (Agnostic)

```tsx
import { useMemo, useState } from 'react'
import type { ChatMessage, ChatResponse, HeroChatConfig } from './types'

export function useHeroChat(config: HeroChatConfig) {
  const initialAssistant = config.seededAssistantMessage ?? config.initialHeadline

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'assistant-seed',
      role: 'assistant',
      content: initialAssistant,
      timestamp: Date.now(),
    },
  ])
  const [headline, setHeadline] = useState(config.initialHeadline)
  const [headlineTurn, setHeadlineTurn] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isVoiceMode, setIsVoiceMode] = useState(false)
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)

  const hasUserHistory = useMemo(
    () => messages.some((m) => m.role === 'user'),
    [messages],
  )

  const handoffPrompt = hasUserHistory
    ? 'Continue this active chat in the same session. Do not re-introduce.'
    : undefined

  const sendText = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    setError(null)
    setIsLoading(true)

    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', content: trimmed, timestamp: Date.now() },
    ])

    try {
      const response = await fetch(config.chatEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, sessionId, channel: 'text' }),
      })

      const payload = (await response.json()) as ChatResponse
      if (!response.ok) throw new Error(payload.error || 'Chat request failed')

      const safeReply = payload.reply?.trim() || "I can help—what phone model and repair do you need?"

      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', content: safeReply, timestamp: Date.now() },
      ])
      setHeadline(safeReply)
      setHeadlineTurn((n) => n + 1)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown chat error'
      setError(message)
      setHeadline(`Sorry — ${message}`)
      setHeadlineTurn((n) => n + 1)
    } finally {
      setIsLoading(false)
    }
  }

  return {
    messages,
    headline,
    headlineTurn,
    isLoading,
    error,
    isVoiceMode,
    sessionId,
    handoffPrompt,
    setIsVoiceMode,
    sendText,
  }
}
```

## 5) HeroChatContainer (Agnostic)

```tsx
import { TypewriterHeadline } from './TypewriterHeadline'
import { HeroInputBar } from './HeroInputBar'
import { UserMessageRail } from './UserMessageRail'
import { VoiceSurface } from './VoiceSurface'
import { useHeroChat } from './useHeroChat'

export function HeroChatContainer() {
  const chat = useHeroChat({
    chatEndpoint: '/api/chat',
    ttsEndpoint: '/api/tts',
    initialHeadline: 'Welcome, need your phone repaired fast?',
    seededAssistantMessage: 'Welcome, need your phone repaired fast?',
  })

  if (chat.isVoiceMode) {
    return (
      <VoiceSurface
        sessionId={chat.sessionId}
        persona="professional"
        handoffPrompt={chat.handoffPrompt}
        onEnd={() => chat.setIsVoiceMode(false)}
      />
    )
  }

  return (
    <section className="hero-root">
      <TypewriterHeadline
        text={chat.headline}
        responseKey={chat.headlineTurn}
        isLoading={chat.isLoading}
      />
      <UserMessageRail
        messages={chat.messages.filter((m) => m.role === 'user')}
      />
      <HeroInputBar
        isLoading={chat.isLoading}
        onSend={chat.sendText}
        onMicClick={() => chat.setIsVoiceMode(true)}
      />
    </section>
  )
}
```

## 6) Typewriter Headline Requirements

- Re-run animation every assistant turn, even for repeated text.
- Use a dedicated `responseKey`, not just `text`, for animation keying.
- Guard empty text.

```tsx
export function TypewriterHeadline({ text, responseKey }: { text: string; responseKey: number }) {
  return <h1 key={String(responseKey)}>{text}</h1>
}
```

## 7) Voice Carryover Pattern

When user clicks mic:
1. Verify microphone permission.
2. Enter voice mode.
3. Keep same `sessionId`.
4. Send `handoffPrompt` on first voice turn if user history exists.

## 8) Realtime API Compatibility

You can use Realtime for voice and keep unified governance if:
- Prompt builder remains centralized server-side.
- Voice relay loads prompt from same config endpoint as text path.
- Session identity is shared (or mapped) across text and realtime voice threads.
- Channel-specific behavior is additive only (no divergent business rules).

## 9) Anti-Patterns to Avoid

- New session id per mode switch.
- Separate prompt stacks for text and voice.
- Silent empty replies from backend.
- UI relying only on `text` equality to trigger headline animation.
- Storing only UI history while backend loses session context.

## 10) Definition of Done Checklist

- [ ] Hero loads with seeded assistant opener
- [ ] First user text turn reaches chat backend
- [ ] Assistant headline updates every turn
- [ ] Mic click launches voice mode
- [ ] Voice mode uses same `sessionId`
- [ ] Returning from voice preserves hero message state
- [ ] Prompt source is shared across text and voice
- [ ] Empty model output is normalized with fallback reply
