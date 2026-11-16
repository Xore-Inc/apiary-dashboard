// The browser end of the live event stream: an EventSource on /api/live.
// Browsers give up on an answer that is not 200 (a backend outage), so a
// failed stream is reopened after a pause.
import type { HoneypotEvent } from './types'

export type StreamCallbacks = { onEvent: (event: HoneypotEvent) => void; onHealth: (healthy: boolean) => void }

const RETRY_MS = 5000

/** Opens the stream; returns the function that closes it. */
export function openLiveStream({ onEvent, onHealth }: StreamCallbacks): () => void {
  // Without the API (a test DOM) there is no stream to open.
  if (typeof EventSource === 'undefined') return () => {}
  let source: EventSource | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let closed = false

  const open = () => {
    source?.close()
    source = new EventSource('/api/live')
    source.onopen = () => onHealth(true)
    source.onmessage = (message: MessageEvent<string>) => onEvent(JSON.parse(message.data) as HoneypotEvent)
    source.onerror = () => {
      onHealth(false)
      // Closed for good (not 200): reopen later ourselves.
      if (source?.readyState === EventSource.CLOSED && !closed) {
        clearTimeout(retry)
        retry = setTimeout(open, RETRY_MS)
      }
    }
  }
  open()

  return () => {
    closed = true
    clearTimeout(retry)
    source?.close()
  }
}
