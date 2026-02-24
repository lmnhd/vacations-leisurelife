import type { ChatRequest, ChatResponse } from './types'

export async function postChatMessage(endpoint: string, payload: ChatRequest): Promise<ChatResponse> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = (await response.json()) as ChatResponse

  if (!response.ok) {
    const errorMessage = typeof data.error === 'string' ? data.error : `Chat request failed (${response.status})`
    throw new Error(errorMessage)
  }

  return data
}
