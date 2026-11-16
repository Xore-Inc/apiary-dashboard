// "Report a problem": a floating button on every page, backed by a rolling
// record of what led up to the problem (the clicks and pages visited, console
// errors, calls that failed, the last calls made), so a report says how the
// operator got here, not only what they saw. Shown when the admin setting
// allows it. Secrets are stripped before the report is stored; the form
// shows exactly what will be attached.
import { ActionLink } from '#/components/ActionLink'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { FieldStatus } from '@astryxdesign/core/FieldStatus'
import { Icon } from '@astryxdesign/core/Icon'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { AppDialog, AppDialogHeader } from './AppDialog'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { ChatBubbleLeftEllipsisIcon } from '@heroicons/react/24/outline'
import { useRouterState } from '@tanstack/react-router'
import { submitProblemReportWrite } from '#/data/writes'
import { useDataMutation } from '#/lib/mutation'
import { API_CALL } from '#/data/serverFn'
import type { ApiCallRecord } from '#/data/serverFn'
import { describeError } from '#/lib/actionError'

const MAX_TRAIL = 100
const MAX_ERRORS = 30
const MAX_CALLS = 20
const MAX_SNAPSHOT = 200_000

function pushCapped<T>(ring: T[], item: T, max: number) {
  ring.push(item)
  if (ring.length > max) ring.shift()
}

const stamp = () => new Date().toISOString().slice(11, 19)

/** The rolling record, kept from the moment the shell mounts. */
function useCapture(enabled: boolean) {
  const page = useRouterState({ select: (s) => s.location.pathname + s.location.searchStr })
  const trail = useRef<string[]>([])
  const consoleErrors = useRef<string[]>([])
  const failures = useRef<string[]>([])
  const calls = useRef<Array<{ method: string; path: string; status: number }>>([])

  useEffect(() => {
    if (enabled) pushCapped(trail.current, `${stamp()} open ${page}`, MAX_TRAIL)
  }, [enabled, page])

  useEffect(() => {
    if (!enabled) return
    const onClick = (event: MouseEvent) => {
      const el = (event.target as Element | null)?.closest('button, a, [role=button], [role=menuitem], input, select')
      if (!el) return
      const label = el.getAttribute('aria-label') ?? (el.textContent.trim() || null) ?? el.getAttribute('href') ?? el.tagName.toLowerCase()
      pushCapped(trail.current, `${stamp()} click ${el.tagName.toLowerCase()} “${label.slice(0, 80)}”`, MAX_TRAIL)
    }
    const originalError = console.error.bind(console)
    console.error = (...args: unknown[]) => {
      try {
        pushCapped(consoleErrors.current, `${stamp()} ${args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ')}`.slice(0, 2000), MAX_ERRORS)
      } catch {
        /* capture must never break console.error */
      }
      originalError(...args)
    }
    const onError = (event: ErrorEvent) => pushCapped(consoleErrors.current, `${stamp()} uncaught: ${event.message}`, MAX_ERRORS)
    const onRejection = (event: PromiseRejectionEvent) => pushCapped(consoleErrors.current, `${stamp()} unhandled rejection: ${event.reason instanceof Error ? event.reason.message : String(event.reason)}`, MAX_ERRORS)
    const onCall = (event: Event) => {
      const call = (event as CustomEvent<ApiCallRecord>).detail
      pushCapped(calls.current, { method: /^(get|search|preview|resolve|validate|semanticSearch)/.test(call.name) ? 'GET' : 'POST', path: call.name, status: call.status }, MAX_CALLS)
      if (!call.ok) pushCapped(failures.current, `${stamp()} ${call.name} -> ${call.status}${call.error ? ` (${call.error})` : ''}`, MAX_ERRORS)
    }
    document.addEventListener('click', onClick, { capture: true })
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener(API_CALL, onCall)
    return () => {
      document.removeEventListener('click', onClick, { capture: true })
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener(API_CALL, onCall)
      console.error = originalError
    }
  }, [enabled])

  return { page, trail, consoleErrors, failures, calls }
}

/** In the footer, when the admin switch (Dashboard defaults) allows it. */
export function ProblemReportButton({ enabled }: { enabled: boolean }) {
  const capture = useCapture(enabled)
  const fileReport = useDataMutation(submitProblemReportWrite())
  const [open, setOpen] = useState(false)
  const [expected, setExpected] = useState('')
  const [actual, setActual] = useState('')
  const [snapshot, setSnapshot] = useState(true)
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [filed, setFiled] = useState<string>()

  // Following "Open the report" (or any link) leaves the dialog behind.
  useEffect(() => setOpen(false), [capture.page])

  const reset = useCallback(() => {
    setExpected('')
    setActual('')
    setAttempted(false)
    setError(undefined)
    setFiled(undefined)
  }, [])

  if (!enabled) return null

  const submit = async () => {
    setAttempted(true)
    if (!expected.trim()) return
    setBusy(true)
    setError(undefined)
    try {
      const { id } = await fileReport.mutateAsync([{
        page: capture.page,
        expected: expected.trim(),
        actual: actual.trim(),
        actionTrail: [...capture.trail.current],
        consoleErrors: [...capture.consoleErrors.current],
        networkFailures: [...capture.failures.current],
        apiCalls: [...capture.calls.current],
        domSnapshot: snapshot ? document.documentElement.outerHTML.slice(0, MAX_SNAPSHOT) : undefined,
        userAgent: navigator.userAgent,
      }])
      setFiled(id)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  const attached = [
    `the page: ${capture.page}`,
    `${capture.trail.current.length} recent clicks and pages`,
    `${capture.consoleErrors.current.length} console errors`,
    `${capture.failures.current.length} failed calls, and the last ${capture.calls.current.length} calls made`,
    'your browser version',
  ]

  return (
    <>
      <Button
        label="Report a problem"
        variant="ghost"
        isIconOnly
        tooltip="Report a problem"
        icon={<Icon icon={ChatBubbleLeftEllipsisIcon} size="sm" />}
        onClick={() => {
          reset()
          setOpen(true)
        }}
      />
      <AppDialog isOpen={open} onClose={() => setOpen(false)} kind="form" isDirty={!filed && Boolean(expected.trim() || actual.trim())}>
        <Layout
          padding={4}
          header={<AppDialogHeader title="Report a problem" />}
          content={
            <LayoutContent>
              {filed ? (
                <Banner status="success" title="Report filed" description="Thank you. It lands with the operators, with what led up to it attached." endContent={<ActionLink href={`/problem-reports/${filed}`}>Open the report</ActionLink>} />
              ) : (
                <VStack gap={4}>
                  <TextArea
                    label="What did you expect?"
                    isRequired
                    rows={3}
                    value={expected}
                    onChange={setExpected}
                    status={attempted && !expected.trim() ? { type: 'error', message: 'Say what you expected, so the report can be acted on.' } : undefined}
                  />
                  <TextArea label="What happened instead?" rows={3} value={actual} onChange={setActual} />
                  <VStack gap={2}>
                    <Text type="label">Attached automatically</Text>
                    <VStack gap={0.5}>
                      {attached.map((line) => (
                        <Text key={line} type="supporting">
                          {`· ${line}`}
                        </Text>
                      ))}
                    </VStack>
                    <CheckboxInput label="Include a snapshot of this page" description="What was on screen, as HTML. Credentials, tokens and cookies are removed from everything before it is stored." value={snapshot} onChange={setSnapshot} />
                  </VStack>
                </VStack>
              )}
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} vAlign="center">
                {error && <FieldStatus type="error" variant="detached" message={error} />}
                <StackItem size="fill" />
                {filed ? (
                  <Button label="Close" onClick={() => setOpen(false)} />
                ) : (
                  <>
                    <Button label="Cancel" variant="secondary" onClick={() => setOpen(false)} />
                    <Button label="Send report" isLoading={busy} onClick={() => void submit()} />
                  </>
                )}
              </HStack>
            </LayoutFooter>
          }
        />
      </AppDialog>
    </>
  )
}
