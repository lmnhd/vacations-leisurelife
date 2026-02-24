import { useEffect } from 'react'
import type { VoiceSurfaceProps } from './types'

export function VoiceSurface({ sessionId, persona, handoffPrompt, onEnd }: VoiceSurfaceProps) {
  useEffect(() => {
    void sessionId
    void persona
    void handoffPrompt
    // Replace this block with your real voice pipeline startup.
    // Required: keep using `sessionId` for all voice chat turns.
  }, [sessionId, persona, handoffPrompt])

  return (
    <section>
      <h2>Voice mode active</h2>
      <p>Session: {sessionId}</p>
      <button type="button" onClick={onEnd}>
        End Voice Chat
      </button>
    </section>
  )
}
