import { HeroInputBar } from './HeroInputBar'
import { TypewriterHeadline } from './TypewriterHeadline'
import { UserMessageRail } from './UserMessageRail'
import { VoiceSurface } from './VoiceSurface'
import { useHeroChat } from './useHeroChat'

export function HeroChatContainer() {
  const heroChat = useHeroChat({
    chatEndpoint: '/api/chat',
    initialHeadline: 'Welcome, need your phone repaired fast?',
    seededAssistantMessage: 'Welcome, need your phone repaired fast?',
    phone: 'web-chat',
    persona: 'professional',
  })

  if (heroChat.isVoiceMode) {
    return (
      <VoiceSurface
        sessionId={heroChat.sessionId}
        persona={heroChat.persona}
        handoffPrompt={heroChat.handoffPrompt}
        onEnd={() => heroChat.setIsVoiceMode(false)}
      />
    )
  }

  return (
    <section>
      <TypewriterHeadline
        text={heroChat.headline}
        responseKey={heroChat.headlineTurn}
        isLoading={heroChat.isLoading}
      />

      <UserMessageRail
        messages={heroChat.messages.filter((message) => message.role === 'user')}
      />

      <HeroInputBar
        isLoading={heroChat.isLoading}
        onSend={heroChat.sendText}
        onMicClick={() => heroChat.setIsVoiceMode(true)}
      />

      {heroChat.error && <p>{heroChat.error}</p>}
    </section>
  )
}
