import type { UserMessageRailProps } from './types'

export function UserMessageRail({ messages }: UserMessageRailProps) {
  if (messages.length === 0) {
    return <aside>Your messages will appear here.</aside>
  }

  return (
    <aside>
      <h2>Your messages</h2>
      <ul>
        {messages.map((message) => (
          <li key={message.id}>{message.content}</li>
        ))}
      </ul>
    </aside>
  )
}
