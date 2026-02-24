import { useEffect, useMemo, useState } from 'react'
import type { TypewriterHeadlineProps } from './types'

export function TypewriterHeadline({
  text,
  responseKey,
  isLoading,
  speedMs = 22,
  className,
}: TypewriterHeadlineProps) {
  const [visibleLength, setVisibleLength] = useState(0)

  useEffect(() => {
    setVisibleLength(0)
  }, [responseKey, text])

  useEffect(() => {
    if (!text) {
      return
    }

    if (visibleLength >= text.length) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setVisibleLength((current) => Math.min(current + 1, text.length))
    }, speedMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [text, visibleLength, speedMs])

  const visibleText = useMemo(() => text.slice(0, visibleLength), [text, visibleLength])

  return (
    <div className={className}>
      <h1 key={responseKey}>
        {visibleText}
        <span aria-hidden="true">{visibleLength < text.length ? '|' : ''}</span>
      </h1>

      {isLoading && <p>Thinking...</p>}
    </div>
  )
}
