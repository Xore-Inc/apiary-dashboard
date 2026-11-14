// The sandbox guest's screen, view only, through noVNC (dash#305), as the
// old dashboard's sandbox.vnc page showed it. The browser connects straight
// to the operator-configured bridge WebSocket; nothing here can type, click
// or paste into the VM: the client is view-only, and the bridge itself drops
// keyboard, pointer and clipboard messages whatever a browser sends.
//
// noVNC is loaded inside an effect: its own chunk, only on this page. The
// div it draws into is never one React renders children into.
import { useEffect, useRef, useState } from 'react'
import type RFB from '@novnc/novnc'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/Stack'
import { canvasWorks, domResolver, TOKENS } from '#/lib/chartTheme'

type State = 'connecting' | 'connected' | 'disconnected' | 'error'

const MESSAGES: Record<State, string> = {
  connecting: 'Connecting to the read-only bridge…',
  connected: 'Connected, view only.',
  disconnected: 'Disconnected.',
  error: 'The bridge refused the connection.',
}

export function VncViewer({ bridge, label }: { bridge: string; label: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<State>('connecting')
  const [message, setMessage] = useState(MESSAGES.connecting)

  useEffect(() => {
    const box = boxRef.current
    if (!box || !canvasWorks()) return
    const life = { disposed: false }
    let rfb: RFB | null = null
    setState('connecting')
    setMessage(MESSAGES.connecting)
    void (async () => {
      const { default: Client } = await import('@novnc/novnc')
      if (life.disposed) return
      try {
        rfb = new Client(box, bridge, { shared: true })
      } catch (e) {
        setState('error')
        setMessage(`Could not open the bridge: ${e instanceof Error ? e.message : String(e)}`)
        return
      }
      rfb.viewOnly = true
      rfb.focusOnClick = false
      rfb.scaleViewport = true
      rfb.background = domResolver(box)(TOKENS.muted)
      rfb.addEventListener('connect', () => {
        setState('connected')
        setMessage(MESSAGES.connected)
      })
      rfb.addEventListener('disconnect', (event) => {
        const clean = (event as CustomEvent<{ clean?: boolean } | null>).detail?.clean
        setState('disconnected')
        setMessage(clean ? MESSAGES.disconnected : 'Connection lost: the detonation may have finished, or the bridge is unreachable.')
      })
      rfb.addEventListener('credentialsrequired', () => {
        setState('error')
        setMessage('This bridge asks for credentials, which a view-only console does not send.')
      })
      rfb.addEventListener('securityfailure', (event) => {
        setState('error')
        setMessage(`Security handshake failed: ${(event as CustomEvent<{ reason?: string } | null>).detail?.reason || 'no reason given'}.`)
      })
    })()
    return () => {
      life.disposed = true
      rfb?.disconnect()
    }
  }, [bridge])

  return (
    <VStack gap={2}>
      <Text type="supporting" role="status">
        {message}
      </Text>
      <div style={{ position: 'relative', height: 540, borderRadius: 8, overflow: 'hidden', backgroundColor: 'var(--color-background-muted)' }}>
        <div ref={boxRef} role="img" aria-label={label} data-vnc-state={state} style={{ position: 'absolute', inset: 0 }} />
      </div>
    </VStack>
  )
}
