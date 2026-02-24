import { FormEvent, useState } from 'react'
import type { HeroInputBarProps } from './types'

export function HeroInputBar({ isLoading, onSend, onMicClick }: HeroInputBarProps) {
  const [value, setValue] = useState('')

  const canSend = value.trim().length > 0 && !isLoading

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!canSend) {
      return
    }

    const nextMessage = value.trim()
    setValue('')
    await onSend(nextMessage)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Start typing or click mic to talk"
        disabled={isLoading}
      />

      <button type="button" onClick={onMicClick} disabled={isLoading}>
        Mic
      </button>

      <button type="submit" disabled={!canSend}>
        Send
      </button>
    </form>
  )
}
