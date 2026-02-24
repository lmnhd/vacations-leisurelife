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
  initialHeadline: string
  seededAssistantMessage?: string
  phone?: string
  persona?: PersonaKey
}

export interface TypewriterHeadlineProps {
  text: string
  responseKey: number
  isLoading: boolean
  speedMs?: number
  className?: string
}

export interface HeroInputBarProps {
  isLoading: boolean
  onSend: (message: string) => Promise<void>
  onMicClick: () => void
}

export interface UserMessageRailProps {
  messages: ChatMessage[]
}

export interface VoiceSurfaceProps {
  sessionId: string
  persona: PersonaKey
  handoffPrompt?: string
  onEnd: () => void
}
