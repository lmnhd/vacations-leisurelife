import { useMemo, useState } from 'react'
import { postChatMessage } from './apiClient'
import { createStableSessionId } from './session'
import type { ChatMessage, HeroChatConfig, PersonaKey } from './types'

interface UseHeroChatResult {
  messages: ChatMessage[]
  headline: string
  headlineTurn: number
  isLoading: boolean
  error: string | null
  isVoiceMode: boolean
  sessionId: string
  persona: PersonaKey
  handoffPrompt?: string
  setIsVoiceMode: (nextValue: boolean) => void
  sendText: (message: string) => Promise<void>
}

export function useHeroChat(config: HeroChatConfig): UseHeroChatResult {
  const persona = config.persona ?? 'professional'
  const initialAssistantMessage = config.seededAssistantMessage ?? config.initialHeadline

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'assistant-seed',
      role: 'assistant',
      content: initialAssistantMessage,
      timestamp: Date.now(),
    },
  ])
  const [headline, setHeadline] = useState(config.initialHeadline)
  const [headlineTurn, setHeadlineTurn] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isVoiceMode, setIsVoiceMode] = useState(false)
  const [sessionId] = useState(() => createStableSessionId('hero'))

  const hasUserHistory = useMemo(
    () => messages.some((message) => message.role === 'user'),
    [messages],
  )

  const handoffPrompt = hasUserHistory
    ? 'Continue this active chat in the same session. Do not restart context. Keep response brief and helpful.'
    : undefined

  const sendText = async (message: string): Promise<void> => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage || isLoading) {
      return
    }

    setError(null)
    setIsLoading(true)

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmedMessage,
      timestamp: Date.now(),
    }

    setMessages((previous) => [...previous, userMessage])

    try {
      const data = await postChatMessage(config.chatEndpoint, {
        message: trimmedMessage,
        sessionId,
        channel: 'text',
        phone: config.phone,
        persona,
      })

      const safeReply = typeof data.reply === 'string' && data.reply.trim().length > 0
        ? data.reply
        : "I'm here — what phone model and repair do you need?"

      const assistantMessage: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: safeReply,
        timestamp: Date.now(),
      }

      setMessages((previous) => [...previous, assistantMessage])
      setHeadline(safeReply)
      setHeadlineTurn((previous) => previous + 1)
    } catch (unknownError) {
      const errorMessage = unknownError instanceof Error ? unknownError.message : 'Unknown chat error'
      setError(errorMessage)
      const fallbackHeadline = `Sorry — ${errorMessage}`
      setHeadline(fallbackHeadline)
      setHeadlineTurn((previous) => previous + 1)
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
    persona,
    handoffPrompt,
    setIsVoiceMode,
    sendText,
  }
}
