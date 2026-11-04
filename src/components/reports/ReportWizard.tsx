/**
 * Report creation as an inline wizard (Astryx `form-wizard-inline`): every
 * step stays stacked in one column and expands in place, finished steps
 * collapse to a one-line summary of what they settled, and the row is the way
 * back in.
 *
 * Five human steps decide the report: template, content, scope, branding and
 * delivery. Two steps then run themselves: "Check the data" counts what the
 * scope actually matches, and "Render" assembles each section. The last step
 * is human again: it shows the cover and the first page of each section as
 * they will print, then generates the PDF.
 *
 * The data check can fail for real: a scope filter that matches nothing (an
 * address that sent nothing in the window, a sensor name with a typo) halts
 * the chain on that check, and the banner sends the operator back to the
 * Scope step, three rows up and still legible. Re-entering any step resets
 * every automatic result below it, because those were computed from inputs
 * that are now open for editing.
 */
import { ActionLink } from '#/components/ActionLink'
import { useEffect, useMemo, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList'
import { FieldStatus } from '@astryxdesign/core/FieldStatus'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Icon } from '@astryxdesign/core/Icon'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Step, Stepper } from '@astryxdesign/core/Stepper'
import { Switch } from '@astryxdesign/core/Switch'
import { Heading, Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VisuallyHidden } from '@astryxdesign/core/VisuallyHidden'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { CalendarDaysIcon, DocumentTextIcon, FunnelIcon, PaintBrushIcon, Squares2X2Icon } from '@heroicons/react/24/outline'
import { useRouter } from '@tanstack/react-router'
import { generateReportFrom, previewReport } from '#/data/queries'
import type { Facets, GeneratedReport, ReportDefinition, ReportFrequency, ReportPreview, ReportsData } from '#/data/types'
import { formatNumber } from '#/lib/format'
import { isBackendGap } from '#/lib/backendGap'
import type { BackendGap } from '#/lib/backendGap'
import { FilterSelect } from '../FilterSelect'
import { WEEKDAYS, WINDOWS, describeSchedule } from '../details/Report'
import { ReportPreviewPages } from './ReportPreviewPages'
import { useGuardedAction } from '#/lib/useGuardedAction'
import { useIsAdmin } from '#/lib/session'

const STEP_META = [
  { kind: 'human', label: 'Template' },
  { kind: 'human', label: 'Content' },
  { kind: 'human', label: 'Scope' },
  { kind: 'human', label: 'Branding' },
  { kind: 'human', label: 'Delivery' },
  { kind: 'auto', label: 'Check the data' },
  { kind: 'auto', label: 'Render' },
  { kind: 'human', label: 'Review and generate' },
] as const

const SCOPE_STEP = 2
const CHECK_STEP = 5
const RENDER_STEP = 6
const AUTO_STEPS = [CHECK_STEP, RENDER_STEP]

const PRESETS: Array<{ id: string; label: string; schedule: NonNullable<ReportDefinition['schedule']> | null }> = [
  { id: 'demand', label: 'On demand only', schedule: null },
  { id: 'daily', label: 'Every morning', schedule: { frequency: 'daily', hour: 6, minute: 30, weekday: 1, monthDay: 1 } },
  { id: 'weekly', label: 'Weekly, Monday', schedule: { frequency: 'weekly', hour: 6, minute: 0, weekday: 1, monthDay: 1 } },
  { id: 'monthly', label: 'Monthly, the 1st', schedule: { frequency: 'monthly', hour: 7, minute: 0, weekday: 1, monthDay: 1 } },
]
const CLASSIFICATIONS = ['TLP:CLEAR', 'TLP:GREEN', 'TLP:AMBER', 'TLP:AMBER+STRICT', 'TLP:RED']

// One sub-check per tick, then a beat on the last before handing over; the
// tick clears a full Spinner turn so a check never resolves mid-rotation.
const TICK_MS = 800
const SETTLE_MS = 560
// Pulls the nested checks' rail under the parent step's indicator (see the
// template): 24px gutter + 12px to the sub-indicator centre - 8px.
const NESTED_RAIL_PULL = -28

type AutoState = { status: 'idle' | 'passed' | 'failed'; done: number }
const IDLE: AutoState = { status: 'idle', done: 0 }

export function emptyDraft(data: ReportsData, templateId?: string): ReportDefinition {
  const template = data.templates.find((t) => t.id === templateId) ?? data.templates[0]
  return {
    id: '',
    name: '',
    template: template.id,
    theme: 'dark',
    elements: [...template.elements],
    scope: { window: '24h', ip: [], sensor: [], port: [], signature: [] },
    branding: { title: 'APIARY honeypot report', author: '', headerLeft: 'APIARY', headerRight: '', footerLeft: '', classification: 'TLP:AMBER' },
    schedule: null,
    appendixLimit: 120,
    created: '',
  }
}

const plural = (n: number, word: string) => `${formatNumber(n)} ${word}${n === 1 ? '' : 's'}`

/** From this width the preview sits beside the steps and follows every
 * change, rather than waiting for the last step. */
export const REPORT_WIDE = '(min-width: 1600px)'
/** The steps' column beside the preview: a form's width. */
const STEPS_WIDTH = 720

/** The checks each automatic step ticks through. With no preview (the
 * backend has none for an artifact template) the data check cannot count, so it runs only
 * the checks that need no counts, and the render step names its sections
 * without rows. */
export function automaticChecks(
  draft: ReportDefinition,
  preview: ReportPreview | null | undefined,
  elements: ReportsData['elements'],
): Record<number, Array<{ id: string; label: string }>> {
  if (!preview) {
    return {
      [CHECK_STEP]: [
        { id: 'scope', label: 'Checking the scope settings' },
        { id: 'sections', label: `Checking ${plural(draft.elements.length, 'section')} are selected` },
      ],
      [RENDER_STEP]: [
        ...draft.elements.map((id) => ({ id, label: `Rendering ${(elements.find((e) => e.id === id)?.label ?? id).toLowerCase()}` })),
        { id: 'pdf', label: `Assembling the ${draft.theme} PDF with the ${draft.branding.classification} marking` },
      ],
    }
  }
  const scopeChecks = [
    { id: 'window', label: `Counting events in the last ${WINDOWS.find((w) => w.value === draft.scope.window)?.label ?? draft.scope.window}` },
    ...(draft.scope.ip.length ? [{ id: 'ip', label: `Filtering to ${draft.scope.ip.join(', ')}` }] : []),
    ...(draft.scope.sensor.length ? [{ id: 'sensor', label: `Filtering to ${draft.scope.sensor.length === 1 ? 'sensor' : 'sensors'} ${draft.scope.sensor.join(', ')}` }] : []),
    ...(draft.scope.port.length ? [{ id: 'port', label: `Filtering to ${draft.scope.port.length === 1 ? 'port' : 'ports'} ${draft.scope.port.join(', ')}` }] : []),
    ...(draft.scope.signature.length ? [{ id: 'signature', label: `Matching IDS ${draft.scope.signature.length === 1 ? 'signature' : 'signatures'} ${draft.scope.signature.map((x) => `“${x}”`).join(', ')}` }] : []),
    { id: 'sections', label: `Sizing ${plural(draft.elements.length, 'section')}` },
  ]
  return {
    [CHECK_STEP]: scopeChecks,
    [RENDER_STEP]: [
      ...preview.sections.map((s) => ({ id: s.id, label: `Rendering ${s.label.toLowerCase()} · ${plural(s.rows, 'row')}` })),
      { id: 'pdf', label: `Assembling the ${draft.theme} PDF with the ${draft.branding.classification} marking` },
    ],
  }
}

/** A counted facet list, or none while the facets read is unavailable.
 * The pickers that take a typed value still accept one. */
const facetOptions = (facets: Facets | BackendGap, key: keyof Facets): Facets[keyof Facets] => (isBackendGap(facets) ? [] : facets[key])

export function ReportWizard({ data, facets, initial, onRestart }: { data: ReportsData; facets: Facets | BackendGap; initial: ReportDefinition; onRestart: () => void }) {
  const router = useRouter()
  // Generating (and keeping the definition) is an admin's; a viewer can
  // still compose and preview.
  const isAdmin = useIsAdmin()
  const [draft, setDraft] = useState<ReportDefinition>(initial)
  const [active, setActive] = useState(0)
  const [auto, setAuto] = useState<Record<number, AutoState>>({ [CHECK_STEP]: IDLE, [RENDER_STEP]: IDLE })
  // undefined until fetched; null when the backend has no preview (live tier).
  const [preview, setPreview] = useState<ReportPreview | null | undefined>(undefined)
  const [keep, setKeep] = useState(true)
  const [generating, setGenerating] = useState(false)
  const { error, guard } = useGuardedAction()
  const [result, setResult] = useState<{ report: GeneratedReport; definition?: ReportDefinition } | null>(null)
  // The wizard mounts in the browser, so this is the real width from the
  // first paint: the preview never jumps in beside the steps.
  const wide = useMediaQuery(REPORT_WIDE)
  // Beside the steps, the preview follows the draft as it changes.
  const [livePreview, setLivePreview] = useState<ReportPreview | null | undefined>(undefined)

  const update = (patch: Partial<ReportDefinition>) => setDraft((d) => ({ ...d, ...patch }))
  const setScope = (patch: Partial<ReportDefinition['scope']>) => update({ scope: { ...draft.scope, ...patch } })
  const setBranding = (patch: Partial<ReportDefinition['branding']>) => update({ branding: { ...draft.branding, ...patch } })
  const template = data.templates.find((t) => t.id === draft.template) ?? data.templates[0]
  const isDone = active >= STEP_META.length
  const editing = Boolean(initial.id)

  // The data check needs the preview; fetch it when the chain reaches it.
  useEffect(() => {
    if (active !== CHECK_STEP || preview !== undefined) return
    let live = true
    void previewReport(draft).then((p) => live && setPreview(p))
    return () => {
      live = false
    }
  }, [active, draft, preview])

  useEffect(() => {
    if (!wide) return
    let current = true
    const timer = setTimeout(() => {
      previewReport(draft).then(
        (p) => current && setLivePreview(p),
        () => {
          /* the last preview stays until one answers */
        },
      )
    }, 300)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [wide, draft])

  // What each automatic step does, as the checks its body ticks through.
  const checksFor = useMemo(() => automaticChecks(draft, preview, data.elements), [draft, preview, data.elements])

  // The auto-advance chain, one timer at a time. A failing check settles its
  // step as failed and schedules nothing, which is what stops the chain.
  useEffect(() => {
    if (!AUTO_STEPS.includes(active)) return undefined
    const state = auto[active]
    if (state.status !== 'idle') return undefined
    if (active === CHECK_STEP && preview === undefined) return undefined
    const checks = checksFor[active]
    if (state.done >= checks.length) {
      const timer = setTimeout(() => {
        setAuto((s) => ({ ...s, [active]: { ...s[active], status: 'passed' } }))
        setActive((a) => a + 1)
      }, SETTLE_MS)
      return () => clearTimeout(timer)
    }
    const failingIndex = active === CHECK_STEP && preview?.emptyFilter ? checks.findIndex((c) => c.id === preview.emptyFilter!.field) : -1
    const timer = setTimeout(() => {
      setAuto((s) => (state.done === failingIndex ? { ...s, [active]: { ...s[active], status: 'failed' } } : { ...s, [active]: { ...s[active], done: s[active].done + 1 } }))
    }, TICK_MS)
    return () => clearTimeout(timer)
  }, [active, auto, checksFor, preview])

  // Re-entry invalidates every automatic result from there on, and the data
  // preview they were computed from.
  const goToStep = (index: number) => {
    if (result) return
    setActive(index)
    setPreview(undefined)
    setAuto((s) => Object.fromEntries(Object.entries(s).map(([step, state]) => [step, Number(step) >= index ? IDLE : state])))
  }

  const errorsByStep = useMemo<Array<Record<string, string>>>(() => {
    const templateStep: Record<string, string> = {}
    if (!draft.name.trim()) templateStep.name = 'Name the report so it can be found in History and the Library.'
    const content: Record<string, string> = {}
    if (draft.elements.length === 0) content.elements = 'Pick at least one section, or the PDF would only have a cover.'
    const scope: Record<string, string> = {}
    const badIp = draft.scope.ip.find((ip) => !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip))
    if (badIp) scope.ip = `“${badIp}” is not an IPv4 address, e.g. 203.0.113.7.`
    const badPort = draft.scope.port.find((port) => !/^\d{1,5}$/.test(port))
    if (badPort) scope.port = `“${badPort}” is not a port number, e.g. 22.`
    const branding: Record<string, string> = {}
    if (!draft.branding.title.trim()) branding.title = 'The cover needs a title.'
    return [templateStep, content, scope, branding, {}, {}, {}, {}]
  }, [draft])
  // A step's messages wait for its first confirm attempt: an empty name on a
  // fresh form is not yet a mistake.
  const [attempted, setAttempted] = useState<Set<number>>(() => new Set())
  const currentErrors = isDone || !attempted.has(active) ? {} : errorsByStep[active]
  const isStepBroken = (index: number) => index < active && Object.keys(errorsByStep[index]).length > 0

  const confirmStep = async () => {
    setAttempted((s) => new Set(s).add(active))
    if (Object.keys(errorsByStep[active]).length !== 0) return
    if (active === STEP_META.length - 1) {
      setGenerating(true)
      try {
        const generated = await guard(() => generateReportFrom(draft, keep || draft.schedule !== null))
        // A failed generate stays on this step, saying why.
        if (!generated) return
        setResult(generated)
        await router.invalidate()
      } finally {
        setGenerating(false)
      }
    }
    setActive((a) => a + 1)
  }

  const listed = (values: string[], one: string, many: string) => (values.length === 0 ? undefined : values.length === 1 ? `${one} ${values[0]}` : `${values.length} ${many}`)
  const scopeSummary = [listed(draft.scope.ip, 'IP', 'IPs'), listed(draft.scope.sensor, 'sensor', 'sensors'), listed(draft.scope.port, 'port', 'ports'), listed(draft.scope.signature, 'signature', 'signatures')].filter(Boolean)

  // What a collapsed step shows: the result it settled, never a status word.
  const summaryFor = (index: number): string | undefined => {
    if (index >= active) return undefined
    switch (index) {
      case 0:
        return `${draft.name} · ${template.name}`
      case 1:
        return `${plural(draft.elements.length, 'section')} · ${draft.theme} theme · appendix ${draft.appendixLimit} rows`
      case 2:
        return `Last ${WINDOWS.find((w) => w.value === draft.scope.window)?.label ?? draft.scope.window} · ${scopeSummary.length ? scopeSummary.join(', ') : 'all captured activity'}`
      case 3:
        return `“${draft.branding.title}” · ${draft.branding.classification}`
      case 4:
        return describeSchedule(draft.schedule)
      case 5:
        return preview
          ? `${plural(preview.events, 'event')} from ${plural(preview.sources, 'source')} on ${plural(preview.sensors, 'sensor')}`
          : `${template.name} · ${plural(draft.elements.length, 'section')} · last ${WINDOWS.find((w) => w.value === draft.scope.window)?.label ?? draft.scope.window}`
      case 6:
        return preview ? `${plural(preview.pages, 'page')} · ${plural(preview.sections.length, 'section')}` : `${plural(draft.elements.length, 'section')} · ${draft.theme} theme`
      case 7:
        return result ? `Generated “${result.report.title}” · ${Math.round(result.report.sizeBytes / 1024)} KB` : undefined
      default:
        return undefined
    }
  }

  const phaseOf = (index: number) => {
    if (STEP_META[index].kind === 'human') return index < active ? 'passed' : 'pending'
    if (auto[index].status === 'failed') return 'failed'
    if (auto[index].status === 'passed') return 'passed'
    return index === active ? 'running' : 'pending'
  }
  const hasFailure = AUTO_STEPS.some((step) => auto[step].status === 'failed')

  const fieldStatus = (key: string) => (currentErrors[key] ? { type: 'error' as const, message: currentErrors[key] } : undefined)

  /** What the report is: as the preview counts it, or from the draft alone. */
  const draftSummary = (counted: ReportPreview | null) => (
      <Card variant="muted" padding={4}>
        <MetadataList orientation="vertical">
          <MetadataListItem label="Report" icon={<Icon icon={DocumentTextIcon} size="sm" />}>
            {[draft.name.trim(), template.name].filter(Boolean).join(' · ')}
          </MetadataListItem>
          <MetadataListItem label="Content" icon={<Icon icon={Squares2X2Icon} size="sm" />}>
            {counted
              ? `${counted.sections.map((s) => s.label).join(', ')} · ${plural(counted.pages, 'page')}`
              : draft.elements.map((id) => data.elements.find((e) => e.id === id)?.label ?? id).join(', ') || 'No sections'}
          </MetadataListItem>
          <MetadataListItem label="Scope" icon={<Icon icon={FunnelIcon} size="sm" />}>
            {counted
              ? `${plural(counted.events, 'event')}, ${plural(counted.sources, 'source')}, ${plural(counted.sessions, 'session')}`
              : `Last ${WINDOWS.find((w) => w.value === draft.scope.window)?.label ?? draft.scope.window} · ${scopeSummary.length ? scopeSummary.join(', ') : 'all captured activity'}`}
          </MetadataListItem>
          <MetadataListItem label="Branding" icon={<Icon icon={PaintBrushIcon} size="sm" />}>
            {`“${draft.branding.title}” · ${draft.branding.classification} · ${draft.theme}`}
          </MetadataListItem>
          <MetadataListItem label="Delivery" icon={<Icon icon={CalendarDaysIcon} size="sm" />}>
            {describeSchedule(draft.schedule)}
          </MetadataListItem>
        </MetadataList>
      </Card>
  )

  /** The confirm row every expanded human step ends with. */
  const stepActions = (label: string, index: number) => {
    const count = Object.keys(currentErrors).length
    return (
      <HStack gap={2} vAlign="center" wrap="wrap">
        {/* Generating is an admin's call: viewers compose and preview. */}
        {(index < STEP_META.length - 1 || isAdmin) && <Button label={label} variant="primary" isLoading={generating} onClick={() => void confirmStep()} />}
        {index > 0 && <Button label="Back" variant="ghost" onClick={() => goToStep(index - 1)} />}
        {count > 0 && <FieldStatus type="error" variant="detached" message={count === 1 ? 'One problem above needs fixing first.' : `${count} problems above need fixing first.`} />}
        {error && index === STEP_META.length - 1 && <FieldStatus type="error" variant="detached" message={error} />}
      </HStack>
    )
  }

  /** The body of an automatic step: its checks, ticking through. */
  const autoBody = (index: number) => {
    const checks = checksFor[index]
    const state = auto[index]
    const failed = state.status === 'failed'
    return (
      <VStack gap={4}>
        {index === CHECK_STEP && preview === undefined ? (
          <HStack gap={2} vAlign="center">
            <Spinner size="sm" />
            <Text type="supporting">Querying the captured data…</Text>
          </HStack>
        ) : (
          <Stepper
            activeStep={state.done}
            orientation="vertical"
            density="compact"
            indicatorPosition="on-track"
            label={`${STEP_META[index].label} checks`}
            style={{ marginInlineStart: NESTED_RAIL_PULL }}
          >
            {checks.map((check, i) => {
              const isPast = i < state.done
              const isCurrent = i === state.done
              return (
                <Step
                  key={check.id}
                  step={i}
                  label={check.label}
                  status={isPast ? 'success' : isCurrent && failed ? 'error' : undefined}
                  indicator={isCurrent && failed ? <Icon icon="error" size="sm" /> : isCurrent ? <Spinner size="sm" shade="inherit" /> : 'auto'}
                />
              )
            })}
          </Stepper>
        )}
        {index === CHECK_STEP && preview === null && <Text type="supporting" color="secondary">Counts are not available before the report is generated.</Text>}
        {failed && preview?.emptyFilter && (
          <Banner
            status="error"
            title="Nothing to report in this scope"
            description={`${preview.emptyFilter.message} Widen the window or clear the filter.`}
            endContent={<Button label="Back to the scope" variant="secondary" size="sm" onClick={() => goToStep(SCOPE_STEP)} />}
          />
        )}
      </VStack>
    )
  }

  const steps = (
    <VStack gap={6}>
      <VisuallyHidden as="div" aria-live="polite">
        {isDone ? 'Report generated.' : STEP_META[active].kind === 'auto' ? `${STEP_META[active].label}: ${phaseOf(active) === 'failed' ? 'failed' : 'running'}` : ''}
      </VisuallyHidden>

      <Stepper activeStep={active} orientation="vertical" label="Report creation progress" density="compact" onStepClick={goToStep}>
        {STEP_META.map((meta, index) => {
          const phase = phaseOf(index)
          const summary = summaryFor(index)
          return (
            <Step
              key={meta.label}
              step={index}
              label={meta.label}
              status={phase === 'failed' || isStepBroken(index) ? 'error' : phase === 'passed' ? 'success' : undefined}
              indicator={phase === 'running' ? <Spinner size="sm" shade="inherit" /> : phase === 'failed' ? <Icon icon="error" size="sm" /> : 'auto'}
              isDisabled={index > active || result !== null}
              endContent={
                summary ? (
                  <StackItem size="fill">
                    <HStack gap={3} vAlign="center" hAlign="end">
                      <StackItem size="fill">
                        <Text type="supporting" color="secondary" justify="end" maxLines={1}>
                          {summary}
                        </Text>
                      </StackItem>
                      {!result && (
                        <Text type="supporting" color="accent" weight="medium" textWrap="nowrap">
                          {meta.kind === 'auto' ? 'Run again' : 'Edit'}
                        </Text>
                      )}
                    </HStack>
                  </StackItem>
                ) : undefined
              }
            >
              {index === active && (
                <VStack paddingBlockEnd={2}>
                  {index === 0 && (
                    <FormLayout defaultOptionality="optional">
                      <TextInput label="Report name" isRequired value={draft.name} onChange={(name) => update({ name })} placeholder="e.g. Weekly board briefing" status={fieldStatus('name')} />
                      <RadioList
                        label="Template"
                        description="A template picks the sections; you can change them in the next step."
                        value={draft.template}
                        onChange={(id) => update({ template: id, elements: [...(data.templates.find((t) => t.id === id)?.elements ?? [])] })}
                      >
                        {data.templates.map((t) => (
                          <RadioListItem key={t.id} value={t.id} label={t.name} description={t.description} />
                        ))}
                      </RadioList>
                      {stepActions('Continue', index)}
                    </FormLayout>
                  )}

                  {index === 1 && (
                    <FormLayout defaultOptionality="optional">
                      <CheckboxList label="Sections" description={`Preselected by ${template.name}.`} value={draft.elements} onChange={(elements) => update({ elements })} density="compact" status={fieldStatus('elements')}>
                        {data.elements.map((e) => (
                          <CheckboxListItem key={e.id} value={e.id} label={e.label} description={e.description} />
                        ))}
                      </CheckboxList>
                      <SegmentedControl label="PDF theme" value={draft.theme} onChange={(theme) => update({ theme: theme as ReportDefinition['theme'] })}>
                        <SegmentedControlItem value="dark" label="Dark" />
                        <SegmentedControlItem value="light" label="Light" />
                      </SegmentedControl>
                      <NumberInput label="Appendix rows" description="At most this many rows in each appendix table; the PDF says when a table was cut." value={draft.appendixLimit} onChange={(appendixLimit) => update({ appendixLimit: Math.min(1000, Math.max(10, appendixLimit)) })} />
                      {stepActions('Continue', index)}
                    </FormLayout>
                  )}

                  {index === 2 && (
                    <FormLayout defaultOptionality="optional">
                      <Selector label="Observation window" value={draft.scope.window} onChange={(window) => setScope({ window })} options={WINDOWS} description="Scheduled runs always cover the window that just ended." />
                      <FilterSelect label="Source IP" options={facetOptions(facets, 'sources')} value={draft.scope.ip} onChange={(ip) => setScope({ ip })} placeholder="Any address" allowCustom status={fieldStatus('ip')} description="Every address seen, busiest first. You can also type one that is not listed." />
                      <FilterSelect label="Sensor" options={facetOptions(facets, 'sensors')} value={draft.scope.sensor} onChange={(sensor) => setScope({ sensor })} placeholder="Every sensor" />
                      <FilterSelect label="Port" options={facetOptions(facets, 'ports')} value={draft.scope.port} onChange={(port) => setScope({ port })} placeholder="Any port" allowCustom status={fieldStatus('port')} />
                      <FilterSelect label="IDS signature" options={facetOptions(facets, 'signatures')} value={draft.scope.signature} onChange={(signature) => setScope({ signature })} placeholder="Any signature" allowCustom description="Pick signatures, or type part of one, e.g. ET SCAN." />
                      {stepActions('Continue', index)}
                    </FormLayout>
                  )}

                  {index === 3 && (
                    <FormLayout defaultOptionality="optional">
                      <TextInput label="Cover title" isRequired value={draft.branding.title} onChange={(title) => setBranding({ title })} status={fieldStatus('title')} />
                      <TextInput label="Author" value={draft.branding.author} onChange={(author) => setBranding({ author })} />
                      <FormLayout direction="horizontal">
                        <TextInput label="Header, left" value={draft.branding.headerLeft} onChange={(headerLeft) => setBranding({ headerLeft })} />
                        <TextInput label="Header, right" value={draft.branding.headerRight} onChange={(headerRight) => setBranding({ headerRight })} />
                      </FormLayout>
                      <TextInput label="Footer, left" value={draft.branding.footerLeft} onChange={(footerLeft) => setBranding({ footerLeft })} />
                      <Selector label="Classification" value={draft.branding.classification} onChange={(classification) => setBranding({ classification })} options={CLASSIFICATIONS} description="Printed on every page, per the Traffic Light Protocol." />
                      {stepActions('Continue', index)}
                    </FormLayout>
                  )}

                  {index === 4 && (
                    <FormLayout defaultOptionality="optional">
                      <RadioList
                        label="When it runs"
                        description="On demand means you generate it by hand from here or the Library."
                        value={PRESETS.find((p) => describeSchedule(p.schedule) === describeSchedule(draft.schedule))?.id ?? 'custom'}
                        onChange={(id) => {
                          const preset = PRESETS.find((p) => p.id === id)
                          update({ schedule: preset?.schedule ? { ...preset.schedule } : id === 'custom' ? { ...PRESETS[1].schedule! } : null })
                        }}
                      >
                        {PRESETS.map((p) => (
                          <RadioListItem key={p.id} value={p.id} label={p.label} description={describeSchedule(p.schedule)} />
                        ))}
                        <RadioListItem value="custom" label="Custom schedule" description="Pick the frequency and time yourself." />
                      </RadioList>
                      {draft.schedule && (
                        <FormLayout direction="horizontal">
                          <Selector
                            label="Frequency"
                            value={draft.schedule.frequency}
                            onChange={(frequency) => update({ schedule: { ...draft.schedule!, frequency: frequency as ReportFrequency } })}
                            options={['daily', 'weekly', 'monthly']}
                          />
                          {draft.schedule.frequency === 'weekly' && (
                            <Selector
                              label="Weekday"
                              value={String(draft.schedule.weekday)}
                              onChange={(weekday) => update({ schedule: { ...draft.schedule!, weekday: Number(weekday) } })}
                              options={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: String(d), label: WEEKDAYS[d] }))}
                            />
                          )}
                          {draft.schedule.frequency === 'monthly' && (
                            <NumberInput label="Day of month" value={draft.schedule.monthDay} onChange={(monthDay) => update({ schedule: { ...draft.schedule!, monthDay: Math.min(28, Math.max(1, monthDay)) } })} />
                          )}
                          <NumberInput label="Hour (UTC)" value={draft.schedule.hour} onChange={(hour) => update({ schedule: { ...draft.schedule!, hour: Math.min(23, Math.max(0, hour)) } })} />
                          <NumberInput label="Minute" value={draft.schedule.minute} onChange={(minute) => update({ schedule: { ...draft.schedule!, minute: Math.min(59, Math.max(0, minute)) } })} />
                        </FormLayout>
                      )}
                      {stepActions('Check the data', index)}
                    </FormLayout>
                  )}

                  {index === 7 && preview !== undefined && (
                    <FormLayout defaultOptionality="optional">
                      {!wide && <ReportPreviewPages draft={draft} preview={preview} templateName={template.name} elements={data.elements} />}
                      {!wide && draftSummary(preview)}
                      <Switch
                        label={editing ? 'Save these changes to the Library definition' : 'Keep as a reusable definition in the Library'}
                        description={draft.schedule ? 'Needed for the schedule to run.' : 'Off makes this a one-off report.'}
                        value={keep || draft.schedule !== null}
                        isDisabled={draft.schedule !== null}
                        onChange={setKeep}
                        labelPosition="start"
                        labelSpacing="spread"
                      />
                      {stepActions('Generate report', index)}
                    </FormLayout>
                  )}

                  {meta.kind === 'auto' && autoBody(index)}
                </VStack>
              )}
            </Step>
          )
        })}
      </Stepper>

      {hasFailure && <Text type="supporting" color="secondary">Paused at the failed check above. Fix what it found and the remaining steps pick up from there.</Text>}

      {result && (
        <Banner
          status="success"
          title="Report generated"
          description={result.definition ? `Saved to the Library as “${result.definition.name}”${draft.schedule ? `, runs ${describeSchedule(draft.schedule)}` : ''}.` : 'A one-off report; nothing was saved to the Library.'}
          endContent={
            <HStack gap={3} vAlign="center">
              <ActionLink href={`/reports/generated/${result.report.id}`}>Open the report</ActionLink>
              <ActionLink href="/reports/history">History</ActionLink>
              <Button label="Create another" size="sm" variant="secondary" onClick={onRestart} />
            </HStack>
          }
        />
      )}
    </VStack>
  )

  if (!wide) return steps
  return (
    <HStack gap={10} vAlign="start">
      <VStack width={STEPS_WIDTH}>{steps}</VStack>
      <StackItem size="fill">
        <VStack gap={4} as="section" aria-label="Preview">
          <VStack gap={1}>
            <Heading level={2}>Preview</Heading>
            <Text color="secondary">
              {livePreview === null
                ? 'The cover and each section in the order they will print. It follows every change.'
                : 'The cover and the first page of each section, with the rows this scope matches. It follows every change.'}
            </Text>
          </VStack>
          {livePreview !== undefined ? (
            <>
              <ReportPreviewPages draft={draft} preview={livePreview} templateName={template.name} elements={data.elements} />
              {draftSummary(livePreview)}
            </>
          ) : (
            <Skeleton height={448} />
          )}
        </VStack>
      </StackItem>
    </HStack>
  )
}
