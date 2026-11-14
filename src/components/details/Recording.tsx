// A Cowrie session recording, played back in a real terminal emulator
// (xterm, as the old dashboard's tty-replay page did; dash#305): the
// recording's own timed frames when it carries its ttylog, its transcript a
// line at a time otherwise. Escape sequences, colours and cursor movement
// render as the attacker's terminal showed them. The terminal never takes
// input. The whole transcript stays one disclosure away, as text.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FitAddon } from '@xterm/addon-fit'
import type { Terminal } from '@xterm/xterm'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Slider } from '@astryxdesign/core/Slider'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { Replay } from '#/data/types'
import { TOKENS, canvasWorks, domResolver, onThemeChange } from '#/lib/chartTheme'
import { formatNumber } from '#/lib/format'
import { usePreferences } from '#/lib/prefs'
import { framesFor, gapMs, plainTranscript } from '#/lib/ttylog'

const TERMINAL_HEIGHT = 360

/** The terminal's colours from the theme: the muted surface, primary text. */
function terminalTheme(host: HTMLElement) {
  const c = domResolver(host)
  return { background: c(TOKENS.muted), foreground: c(TOKENS.text), cursor: c(TOKENS.text), selectionBackground: c('var(--color-data-ink, var(--color-data-categorical-blue))') }
}

export function Player({ replay }: { replay: Replay }) {
  const frames = useMemo(() => framesFor(replay), [replay])
  const transcript = useMemo(() => plainTranscript(replay.transcript), [replay.transcript])
  const total = frames.length
  const reduced = usePreferences()?.motion === 'on'
  const hostRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const indexRef = useRef(0)
  const speedRef = useRef(1)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState('1')
  speedRef.current = Number(speed)

  // The terminal: created once per recording, fitted to its card, recoloured
  // when the theme changes.
  useEffect(() => {
    const box = boxRef.current
    const host = hostRef.current
    if (!box || !host || !canvasWorks()) return
    const life = { disposed: false }
    let fit: FitAddon | null = null
    let observer: ResizeObserver | null = null
    let unsubscribe = () => {}
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit'), import('@xterm/xterm/css/xterm.css')])
      if (life.disposed) return
      const term = new Terminal({
        convertEol: true,
        disableStdin: true,
        cursorBlink: false,
        cursorStyle: 'block',
        fontFamily: getComputedStyle(host).getPropertyValue('--font-family-code').trim() || 'monospace',
        fontSize: 13,
        scrollback: 5000,
        theme: terminalTheme(host),
      })
      fit = new FitAddon()
      term.loadAddon(fit)
      term.open(box)
      fit.fit()
      termRef.current = term
      observer = new ResizeObserver(() => fit?.fit())
      observer.observe(box)
      unsubscribe = onThemeChange(() => (term.options.theme = terminalTheme(host)))
      indexRef.current = 0
      setIndex(0)
    })()
    return () => {
      life.disposed = true
      if (timer.current) clearTimeout(timer.current)
      observer?.disconnect()
      unsubscribe()
      termRef.current?.dispose()
      termRef.current = null
    }
  }, [frames])

  /** Redraws the terminal as it stood after `target` frames. */
  const seek = useCallback(
    (target: number) => {
      const term = termRef.current
      indexRef.current = target
      setIndex(target)
      if (!term) return
      term.reset()
      for (let i = 0; i < target; i++) term.write(frames[i].data)
    },
    [frames],
  )

  // Playback: each frame at its recorded time (idle gaps capped), or, with
  // reduced motion, the whole rest at once.
  useEffect(() => {
    if (!playing) return
    const step = () => {
      const term = termRef.current
      const i = indexRef.current
      if (!term || i >= total) return setPlaying(false)
      if (reduced) {
        for (let j = i; j < total; j++) term.write(frames[j].data)
        indexRef.current = total
        setIndex(total)
        return setPlaying(false)
      }
      term.write(frames[i].data)
      indexRef.current = i + 1
      setIndex(i + 1)
      if (i + 1 >= total) return setPlaying(false)
      timer.current = setTimeout(step, gapMs(frames, i + 1, speedRef.current))
    }
    step()
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [playing, frames, total, reduced])

  const elapsed = index > 0 ? frames[Math.min(index, total) - 1].at : 0
  const duration = total ? frames[total - 1].at : replay.durationSeconds
  const label = playing ? 'Pause' : index >= total && total > 0 ? 'Replay' : index > 0 ? 'Resume' : 'Play'

  return (
    <VStack gap={3}>
      <Card variant="muted" padding={2}>
        <div ref={hostRef} style={{ height: TERMINAL_HEIGHT }}>
          <div ref={boxRef} role="img" aria-label={`Terminal playback of recording ${replay.shasum.slice(0, 12)}`} style={{ height: '100%' }} />
        </div>
      </Card>
      <HStack gap={3} vAlign="center" wrap="wrap">
        <Button
          label={label}
          isDisabled={total === 0}
          onClick={() => {
            if (playing) return setPlaying(false)
            if (index >= total) seek(0)
            setPlaying(true)
          }}
        />
        <Button
          label="Restart"
          variant="secondary"
          onClick={() => {
            setPlaying(false)
            seek(0)
          }}
        />
        <StackItem size="fill">
          <Slider
            label="Seek"
            min={0}
            max={Math.max(1, total)}
            value={index}
            onChange={(value: number) => {
              setPlaying(false)
              seek(value)
            }}
            formatValue={(value) => `${(value > 0 ? frames[Math.min(value, total) - 1].at : 0).toFixed(1)}s`}
          />
        </StackItem>
        <SegmentedControl label="Playback speed" size="sm" value={speed} onChange={setSpeed}>
          <SegmentedControlItem value="0.5" label="0.5×" />
          <SegmentedControlItem value="1" label="1×" />
          <SegmentedControlItem value="2" label="2×" />
          <SegmentedControlItem value="4" label="4×" />
        </SegmentedControl>
      </HStack>
      <Text type="supporting">
        {elapsed.toFixed(1)}s of {duration.toFixed(1)}s terminal time · frame {formatNumber(index)} of {formatNumber(total)}
        {replay.ttylog ? '' : ' (no timing recorded: one line per step)'}. Idle stretches play in at most 3 s.
      </Text>
      <details>
        <summary>
          <Text type="supporting">Full transcript, as text</Text>
        </summary>
        <Card variant="muted" padding={3}>
          <VStack gap={0} isScrollable style={{ maxHeight: 360 }}>
            {transcript.split('\n').map((line, i) => (
              <Text key={i} type="code" textWrap="nowrap">
                {line || ' '}
              </Text>
            ))}
          </VStack>
        </Card>
      </details>
    </VStack>
  )
}
