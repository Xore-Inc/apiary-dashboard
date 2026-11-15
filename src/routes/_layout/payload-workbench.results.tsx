import { pageSsr } from '#/lib/pageSsr'
import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Grid } from '@astryxdesign/core/Grid'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Heading, Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { entityHref } from '#/lib/entities'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { PageFrame } from '#/components/PageFrame'
import { RecordList } from '#/components/RecordList'
import { abortGpuJobWrite } from '#/data/writes'
import { useQueryClient } from '@tanstack/react-query'
import { useDataMutation } from '#/lib/mutation'
import { AnalysisRunDialog } from '#/components/dialogs/AnalysisRunDialog'
import type { AnalysisResult, AnalysisResultsData, AnalyzerTab, GpuJob, ResultVerdict, WorkbenchRun } from '#/data/types'
import { SkeletonTable } from '#/components/SkeletonTable'
import { WorkbenchRuns, queuedMessage } from '#/components/analyzers/WorkbenchRuns'
import { formatDateTime, formatTime } from '#/lib/format'
import { useIsAdmin } from '#/lib/session'
import { useGuardedAction } from '#/lib/useGuardedAction'
import { analysisTabs } from '#/lib/navFamilies'
import { ensure, usePageQuery } from '#/lib/query'
import { analysisResultsQuery } from '#/data/resources'

const TABS: Array<{ id: AnalyzerTab; label: string; description: string }> = [
  { id: 'workbench', label: 'Workbench', description: 'Your analysis runs, each analyzer’s progress and result, and the GPU queue that Ghidra and RevDeck wait in.' },
  { id: 'static', label: 'Static analysis', description: 'What each payload is before it runs: type, platform, entropy and imports, and the verdict they point to.' },
  { id: 'yara', label: 'YARA', description: 'Payloads that matched a rule, and the rules they matched.' },
  { id: 'sandbox', label: 'Sandbox', description: 'Detonations: what each payload did when it ran, and the risk it scored.' },
  { id: 'ghidra', label: 'Ghidra', description: 'Decompiled binaries, summarised: what the code sets out to do.' },
]

type Sort = 'newest' | 'severity' | 'risk'
const VERDICTS: ResultVerdict[] = ['malicious', 'suspicious', 'benign', 'clean']

type ResultsSearch = { tab?: AnalyzerTab; q?: string; verdict?: ResultVerdict; sort?: Sort }

export const Route = createFileRoute('/_layout/payload-workbench/results')({
  ssr: pageSsr,
  staticData: {
    // Shared with the CAPE, GitHub and RevDeck lists and the sandbox's live
    // view, which are tabs of these results in the top bar. The workbench
    // counts runs; an analyzer, its results in the range.
    viewTabs: analysisTabs((id, loaded) => {
      const data = loaded as AnalysisResultsData | undefined
      if (id === 'workbench') return data?.runs.length
      return TABS.some((t) => t.id === id) ? data?.results.filter((r) => r.analyzer === id).length : undefined
    }),
  },
  validateSearch: (search: Record<string, unknown>): ResultsSearch => ({
    tab: TABS.some((t) => t.id === search.tab) ? (search.tab as AnalyzerTab) : undefined,
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    verdict: VERDICTS.includes(search.verdict as ResultVerdict) ? (search.verdict as ResultVerdict) : undefined,
    sort: search.sort === 'severity' || search.sort === 'risk' ? search.sort : undefined,
  }),
  // Results follow the app-wide range, like every other list.
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ deps, context }) => ensure(context, analysisResultsQuery(deps.range)),
  component: AnalysisResultsPage,
  pendingComponent: AnalysisResultsPage,
})

const VERDICT_COLOR = { malicious: 'red', suspicious: 'orange', benign: 'green', clean: 'green' } as const
const SEVERITY: Record<ResultVerdict, number> = { malicious: 0, suspicious: 1, benign: 2, clean: 2 }

const verdictToken = (verdict: ResultVerdict | undefined) => (verdict ? <Token size="sm" color={VERDICT_COLOR[verdict]} label={verdict} /> : '—')
/** Risk in the sandbox verdict's bands, so the eye finds the high scores
 * before reading them. */
const riskColor = (risk: number) => (risk > 70 ? 'red' : risk > 40 ? 'orange' : 'default')

const time: TableColumn<AnalysisResult> = { key: 'at', header: 'Time', width: pixel(184), renderCell: (row) => <Text type="supporting">{formatDateTime(row.at)}</Text> }
const verdict: TableColumn<AnalysisResult> = { key: 'verdict', header: 'Verdict', width: pixel(112), renderCell: (row) => verdictToken(row.verdict) }
// The payload's own verdict beside the analyzer's: where they differ is
// where an analyst's judgment is needed.
const payload: TableColumn<AnalysisResult> = { key: 'payloadVerdict', header: 'Payload', width: pixel(112), renderCell: (row) => verdictToken(row.payloadVerdict) }
const file: TableColumn<AnalysisResult> = { key: 'file', header: 'File', width: pixel(168), renderCell: (row) => <Text type="code">{row.file}</Text> }
// On a phone the time rides under the file, so the verdict and summary stay.
const fileAndTime: TableColumn<AnalysisResult> = {
  key: 'file',
  header: 'File',
  width: pixel(136),
  renderCell: (row) => (
    <VStack gap={0.5}>
      <Text type="code">{row.file}</Text>
      <Text type="supporting">{formatDateTime(row.at)}</Text>
    </VStack>
  ),
}
const summary: TableColumn<AnalysisResult> = { key: 'summary', header: 'Summary', width: proportional(3) }
const risk: TableColumn<AnalysisResult> = { key: 'risk', header: 'Risk', width: pixel(80), align: 'end', renderCell: (row) => (row.risk === undefined ? '—' : <Token size="sm" color={riskColor(row.risk)} label={String(row.risk)} />) }
const matches: TableColumn<AnalysisResult> = {
  key: 'matches',
  header: 'Matches',
  width: proportional(3),
  renderCell: (row) => (
    <HStack gap={1} wrap="wrap">
      {(row.matches ?? []).map((rule) => (
        <Token key={rule} size="sm" label={rule} />
      ))}
    </HStack>
  ),
}

type ResultsTab = Exclude<AnalyzerTab, 'workbench'>

const columnsFor = (tab: ResultsTab, compact: boolean): TableColumn<AnalysisResult>[] => {
  if (compact) return [verdict, fileAndTime, ...(tab === 'sandbox' ? [risk] : []), tab === 'yara' ? matches : summary]
  switch (tab) {
    case 'yara':
      return [time, verdict, payload, file, matches]
    case 'sandbox':
      return [time, verdict, payload, file, risk, { key: 'platform', header: 'Platform', width: pixel(120) }, summary]
    default:
      return [time, verdict, payload, file, summary]
  }
}

/** Each result opens its analyzer's tab on the payload page. */
const RESULT_TAB: Record<ResultsTab, string> = { static: '/static', yara: '/indicators', sandbox: '/sandbox', ghidra: '/ghidra' }

function resultHref(row: AnalysisResult): string {
  return `${entityHref('payload', row.hash) ?? '/payloads'}${RESULT_TAB[row.analyzer as ResultsTab]}`
}

function GpuQueue({ jobs }: { jobs: GpuJob[] | undefined }) {
  const abort = useDataMutation(abortGpuJobWrite())
  const [busy, setBusy] = useState<string | null>(null)
  const isAdmin = useIsAdmin()
  const { error, guard, clearError } = useGuardedAction()
  const columns: TableColumn<GpuJob>[] = [
    { key: 'requestedAt', header: 'Requested', width: pixel(96), renderCell: (row) => <Text type="supporting">{formatTime(row.requestedAt)}</Text> },
    { key: 'jobType', header: 'Type', width: pixel(136) },
    { key: 'model', header: 'Model', width: proportional(2), renderCell: (row) => <Text type="code">{row.model}</Text> },
    { key: 'status', header: 'Status', width: pixel(104), renderCell: (row) => <Token size="sm" label={row.status} color={row.status === 'failed' ? 'red' : row.status === 'running' ? 'blue' : 'gray'} /> },
    { key: 'attempts', header: 'Attempts', width: pixel(80), align: 'end' },
    { key: 'vramMib', header: 'VRAM', width: pixel(88), align: 'end', renderCell: (row) => `${(row.vramMib / 1024).toFixed(1)} GB` },
    {
      key: 'finishedAt',
      header: 'Ran',
      width: proportional(2),
      renderCell: (row) => <Text type="supporting">{row.error ?? (row.finishedAt ? `finished ${formatTime(row.finishedAt)}` : row.startedAt ? `since ${formatTime(row.startedAt)}` : 'waiting')}</Text>,
    },
    {
      key: 'jobId',
      header: '',
      width: pixel(96),
      renderCell: (row) =>
        row.status === 'queued' && isAdmin ? (
          <Button
            label={`Abort ${row.jobType} ${row.jobId}`}
            size="sm"
            variant="secondary"
            isLoading={busy === row.jobId}
            onClick={async () => {
              setBusy(row.jobId)
              try {
                await guard(() => abort.mutateAsync([row.jobId]))
              } finally {
                setBusy(null)
              }
            }}
          >
            Abort
          </Button>
        ) : null,
    },
  ]
  return (
    <VStack gap={3}>
      <VStack gap={1}>
        <Heading level={2}>GPU queue</Heading>
        <Text type="supporting">Ghidra summaries and RevDeck wait here for the GPU. Only queued jobs can be aborted; a generation already running finishes.</Text>
      </VStack>
      {error && <Banner status="error" title="Not aborted" description={error} isDismissable onDismiss={clearError} />}
      {jobs ? <Table data={jobs} columns={columns} idKey="jobId" density="compact" /> : <SkeletonTable columns={columns} rows={4} density="compact" />}
    </VStack>
  )
}

function NewRunAction({ onQueued }: { onQueued: (run: { run: WorkbenchRun; reused: boolean }) => void }) {
  const isAdmin = useIsAdmin()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  if (!isAdmin) return null
  return (
    <>
      <Button label="New analysis run" size="sm" onClick={() => setCreating(true)} />
      <AnalysisRunDialog
        isOpen={creating}
        onOpenChange={setCreating}
        onQueued={(run) => {
          onQueued(run)
          void queryClient.invalidateQueries({ queryKey: analysisResultsQuery.key })
        }}
      />
    </>
  )
}

/** The workbench: a job console, not a list of results. The runs and the
 * queue they wait in, side by side where both fit (the queue's table needs
 * about 900 px); stacked below that. The view renders in the browser, so
 * the width is known before it paints. */
function WorkbenchView({ data }: { data: AnalysisResultsData | undefined }) {
  const [queued, setQueued] = useState<{ run: WorkbenchRun; reused: boolean } | null>(null)
  const sideBySide = useMediaQuery('(min-width: 1800px)')
  return (
    <PageFrame title="Analysis results" description={TABS[0].description} actions={<NewRunAction onQueued={setQueued} />}>
      <VStack gap={6}>
        {queued && <Banner status={queued.reused ? 'info' : 'success'} {...queuedMessage(queued)} isDismissable onDismiss={() => setQueued(null)} />}
        <Grid columns={sideBySide ? 2 : 1} gap={8} align="start">
          <VStack gap={3}>
            <Heading level={2}>My recent runs</Heading>
            <WorkbenchRuns runs={data?.runs} />
          </VStack>
          <GpuQueue jobs={data?.gpuQueue} />
        </Grid>
      </VStack>
    </PageFrame>
  )
}

function ResultsView({ tab, data }: { tab: ResultsTab; data: AnalysisResultsData | undefined }) {
  const isAdmin = useIsAdmin()
  const navigate = useNavigate()
  const { q = '', verdict: only, sort = 'newest' } = Route.useSearch()
  const compact = useMediaQuery('(max-width: 640px)')
  const [queued, setQueued] = useState<{ run: WorkbenchRun; reused: boolean } | null>(null)
  const meta = TABS.find((t) => t.id === tab)!
  const set = (patch: Partial<ResultsSearch>) => void navigate({ to: '.', search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }), replace: true })

  const needle = q.trim().toLowerCase()
  const filtering = Boolean(needle || only)
  const rank = (r: AnalysisResult) => (r.verdict ? SEVERITY[r.verdict] : VERDICTS.length)
  const rows = data?.results
    .filter((r) => r.analyzer === tab && (!only || r.verdict === only) && (!needle || [r.file, r.hash, r.summary, ...(r.matches ?? []), r.platform ?? ''].some((v) => v.toLowerCase().includes(needle))))
    .sort((a, b) => (sort === 'severity' ? rank(a) - rank(b) : sort === 'risk' ? (b.risk ?? -1) - (a.risk ?? -1) : 0) || Date.parse(b.at) - Date.parse(a.at))

  return (
    <RecordList
      title="Analysis results"
      description={meta.description}
      actions={<NewRunAction onQueued={setQueued} />}
      summary={queued ? <Banner status={queued.reused ? 'info' : 'success'} {...queuedMessage(queued)} isDismissable onDismiss={() => setQueued(null)} /> : undefined}
      toolbar={
        <HStack gap={2} wrap="wrap" vAlign="center">
          <TextInput label="Filter results" isLabelHidden size="sm" width={280} placeholder={`Filter ${meta.label} by file, hash or ${tab === 'yara' ? 'rule' : 'summary'}`} value={q} onChange={(value) => set({ q: value || undefined })} />
          <Selector
            label="Verdict"
            isLabelHidden
            size="sm"
            value={only ?? 'all'}
            onChange={(value) => set({ verdict: value === 'all' ? undefined : (value as ResultVerdict) })}
            options={[{ value: 'all', label: 'All verdicts' }, ...VERDICTS.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))]}
          />
          <Selector
            label="Sort"
            isLabelHidden
            size="sm"
            value={sort === 'risk' && tab !== 'sandbox' ? 'newest' : sort}
            onChange={(value) => set({ sort: value === 'newest' ? undefined : (value as Sort) })}
            options={[{ value: 'newest', label: 'Newest first' }, { value: 'severity', label: 'Most severe first' }, ...(tab === 'sandbox' ? [{ value: 'risk', label: 'Highest risk first' }] : [])]}
          />
        </HStack>
      }
      rows={rows}
      columns={columnsFor(tab, compact)}
      getHref={resultHref}
      getId={(row) => row.id}
      emptyState={
        filtering
          ? { title: 'Nothing matches these filters', description: 'Clear the filter text, or pick All verdicts, to see every result in this time range.' }
          : { title: `No ${meta.label} results in this time range`, description: isAdmin ? 'Widen the time range, or launch a New analysis run.' : 'Widen the time range. Operators launch analysis runs; their results appear here.' }
      }
    />
  )
}

function AnalysisResultsPage() {
  const data = usePageQuery(analysisResultsQuery(Route.useLoaderDeps().range))
  const { tab = 'workbench' } = Route.useSearch()
  return tab === 'workbench' ? <WorkbenchView data={data} /> : <ResultsView tab={tab} data={data} />
}
