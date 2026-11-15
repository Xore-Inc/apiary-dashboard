import { pageSsr } from '#/lib/pageSsr'
import { Pending } from '#/components/Pending'
import { useState } from 'react'
import { ConfirmDialog } from '#/components/AppDialog'
import { Button } from '@astryxdesign/core/Button'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { TimeLines } from '#/components/charts'
import { Panel, StatTile, MiniTable, windowTitle } from '#/components/DashboardBlocks'
import { RecordList } from '#/components/RecordList'
import { SeverityToken } from '#/components/SeverityToken'
import { acknowledgeAllAnomalies } from '#/data/queries'
import { DISPOSITIONS } from '#/data/types'
import type { AnomalyStatus, MlAnomaly, ModelHealth, Severity } from '#/data/types'
import { formatClock, formatNumber, formatTime } from '#/lib/format'
import { EntityLink } from '#/components/EntityLink'
import { StatusToken, statusLabel } from '#/components/details/Anomaly'
import { FilterSelect, listParam, toParam } from '#/components/FilterSelect'
import type { FilterOption } from '#/components/FilterSelect'
import { PageFrame } from '#/components/PageFrame'
import { searchTabs } from '#/components/ViewTabs'
import { useGuardedAction } from '#/lib/useGuardedAction'
import { FieldStatus } from '@astryxdesign/core/FieldStatus'
import { ZoneHeader } from '#/components/ZoneHeader'
import { useIsAdmin } from '#/lib/session'
import { ensure, usePageQuery } from '#/lib/query'
import { mlAnomaliesQuery } from '#/data/resources'

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low']
const STATUSES: AnomalyStatus[] = ['open', 'acknowledged', ...DISPOSITIONS]

/** Filters are comma lists (?severity=high,critical) matching any value. */
type Search = { view?: 'models'; severity?: string; eventType?: string; status?: string }

export const Route = createFileRoute('/_layout/ml-anomalies/')({
  ssr: pageSsr,
  staticData: {
    viewTabs: searchTabs({
      label: 'ML anomaly views',
      param: 'view',
      tabs: (loaded) => [
        { id: 'anomalies', label: 'Anomalies', count: (loaded as { anomalies: unknown[] } | undefined)?.anomalies.length },
        { id: 'models', label: 'Model health' },
      ],
    }),
  },
  validateSearch: (search: Record<string, unknown>): Search => ({
    view: search.view === 'models' ? 'models' : undefined,
    severity: toParam(listParam(search.severity).filter((v) => SEVERITIES.includes(v as Severity))),
    eventType: toParam(listParam(search.eventType)),
    status: toParam(listParam(search.status).filter((v) => STATUSES.includes(v as AnomalyStatus))),
  }),
  loader: ({ context }) => ensure(context, mlAnomaliesQuery()),
  component: MlAnomaliesPage,
  pendingComponent: MlAnomaliesPage,
})

const columns: TableColumn<MlAnomaly>[] = [
  {
    key: 'timestamp',
    header: <ZoneHeader label="Time" />,
    width: pixel(112),
    renderCell: (row) => (
      <HStack gap={1.5} vAlign="center">
        <Text type="supporting">{formatClock(row.timestamp)}</Text>
        {row.folded > 1 && <Token label={`×${row.folded}`} size="sm" />}
      </HStack>
    ),
  },
  { key: 'severity', header: 'Severity', width: pixel(96), renderCell: (row) => <SeverityToken severity={row.severity} /> },
  { key: 'compositeScore', header: 'Score', width: pixel(64), align: 'end', renderCell: (row) => row.compositeScore.toFixed(2) },
  {
    key: 'srcIp',
    header: 'Source',
    width: pixel(152),
    renderCell: (row) =>
      row.srcIp ? (
        <HStack gap={1.5} vAlign="center">
          <EntityLink kind="source" id={row.srcIp} />
          <Text type="supporting">{row.country}</Text>
        </HStack>
      ) : (
        <Text type="supporting">unattributed</Text>
      ),
  },
  {
    key: 'modelScores',
    header: 'Model scores',
    width: pixel(176),
    renderCell: (row) => (
      <Text type="supporting">
        iso {row.modelScores.isolationForest.toFixed(2)} · lstm {row.modelScores.lstmAe.toFixed(2)} · hbos{' '}
        {row.modelScores.hbos.toFixed(2)}
      </Text>
    ),
  },
  { key: 'explanation', header: 'Explanation', width: proportional(2) },
  { key: 'status', header: 'Status', width: pixel(136), renderCell: (row) => <StatusToken status={row.status} /> },
]

const healthColumns: TableColumn<ModelHealth>[] = [
  { key: 'model', header: 'Model', width: pixel(152), renderCell: (row) => <Text type="code">{row.model}</Text> },
  {
    key: 'accepted',
    header: 'Last retrain',
    width: pixel(184),
    renderCell: (row) => (
      <HStack gap={1.5} vAlign="center">
        <StatusDot variant={row.accepted ? 'success' : 'warning'} label={row.accepted ? 'accepted' : 'rejected'} />
        <Text>{row.accepted ? 'accepted' : 'rejected'}</Text>
        <Text type="supporting">{formatTime(row.timestamp)}</Text>
      </HStack>
    ),
  },
  {
    key: 'anomalyRateNew',
    header: 'Anomaly rate',
    width: pixel(140),
    renderCell: (row) =>
      `${(row.anomalyRatePrevious * 100).toFixed(1)}% → ${(row.anomalyRateNew * 100).toFixed(1)}%`,
  },
  { key: 'trainSamples', header: 'Samples', width: pixel(96), align: 'end', renderCell: (row) => formatNumber(row.trainSamples) },
  { key: 'reason', header: 'Reason', width: proportional(2) },
]

/** How the detectors are doing, apart from the anomaly list itself. */
function ModelHealthView({ data }: { data: ReturnType<typeof Route.useLoaderData> }) {
  return (
    <PageFrame title="ML anomalies" description="How the three detectors score traffic, and whether their latest retrain was accepted.">
      <VStack gap={4}>
        <Panel title="Model health">
          <Table data={data?.modelHealth} columns={healthColumns} idKey="model" density="compact" />
        </Panel>
        <Grid columns={{ minWidth: 380, repeat: 'fit' }} gap={4}>
          <Panel title="Model scores over time">
            <TimeLines
              data={data?.scoreTimeline}
              series={[
                { key: 'isolationForest', label: 'Isolation forest' },
                { key: 'lstmAe', label: 'LSTM autoencoder' },
                { key: 'hbos', label: 'HBOS' },
              ]}
            />
          </Panel>
          <MiniTable title={windowTitle('Top source IPs by anomalies, 24h', data?.breakdownRows)} header="Source IP" rows={data?.topSources} entity="source" />
        </Grid>
      </VStack>
    </PageFrame>
  )
}

function MlAnomaliesPage() {
  const data = usePageQuery(mlAnomaliesQuery())
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { error, guard } = useGuardedAction()
  const [acking, setAcking] = useState(false)

  const anyOf = (list: string | undefined, value: string) => !list || list.split(',').includes(value)
  const rows = data?.anomalies.filter((row) => anyOf(search.severity, row.severity) && anyOf(search.eventType, row.eventType) && anyOf(search.status, row.status))
  const counted = (values: readonly string[], of: (row: MlAnomaly) => string, label = (v: string) => v): FilterOption[] =>
    values.map((value) => ({ value, label: label(value), count: data?.anomalies.filter((row) => of(row) === value).length }))
  const setFilter = (patch: Search) => void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })
  const severityCount = (severity: Severity) => (data ? (data.bySeverity === null ? null : (data.bySeverity.find((row) => row.label === severity)?.count ?? 0)) : undefined)
  const isAdmin = useIsAdmin()

  if (search.view === 'models') return <ModelHealthView data={data} />

  return (
    <>
      <RecordList
        title="ML anomalies"
        description="Statistical outliers across sensor traffic: isolation forest, HBOS, and LSTM autoencoder scores combined into one score per event."
        actions={
          <HStack gap={2} vAlign="center">
            {error && <FieldStatus type="error" variant="detached" message={error} />}
            {isAdmin && <Button label="Acknowledge all open" variant="secondary" size="sm" isDisabled={!data?.openBacklog} onClick={() => setConfirmOpen(true)} />}
          </HStack>
        }
        summary={
          <Grid columns={{ minWidth: 160, repeat: 'fit' }} gap={4}>
              <StatTile label="Anomalies, 24h" value={data?.total24h} />
              <StatTile label="Open (all time)" value={data?.openBacklog} href="/ml-anomalies?status=open" />
              {SEVERITIES.map((severity) => (
                <StatTile
                  key={severity}
                  label={severity}
                  value={severityCount(severity)}
                  caption={data?.breakdownRows ? `latest ${formatNumber(data.breakdownRows)} of 24h` : 'last 24h'}
                  href={`/ml-anomalies?severity=${severity}`}
                />
              ))}
          </Grid>
        }
        toolbar={
          <HStack gap={3} wrap="wrap">
            <FilterSelect label="Severity" isLabelHidden size="sm" width={160} placeholder="All severities" options={counted(SEVERITIES, (r) => r.severity)} value={listParam(search.severity)} onChange={(v) => setFilter({ severity: toParam(v) })} />
            <FilterSelect label="Event type" isLabelHidden size="sm" width={200} placeholder="All event types" options={counted(data?.eventTypes ?? [], (r) => r.eventType)} value={listParam(search.eventType)} onChange={(v) => setFilter({ eventType: toParam(v) })} />
            <FilterSelect label="Status" isLabelHidden size="sm" width={180} placeholder="All statuses" options={counted(STATUSES, (r) => r.status, (v) => statusLabel(v as AnomalyStatus))} value={listParam(search.status)} onChange={(v) => setFilter({ status: toParam(v) })} />
            <Text type="supporting">
              <Pending>{data && rows && `${formatNumber(rows.length)} of ${formatNumber(data.anomalies.length)} anomalies`}</Pending>
            </Text>
          </HStack>
        }
        rows={rows}
        columns={columns}
        getId={(row) => row.id}
        getHref={(row) => `/ml-anomalies/${encodeURIComponent(row.id)}`}
        emptyState={{
          title: 'No anomalies match',
          description: 'Clear a filter, or wait for ml-worker to score new traffic.',
        }}
      />
      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Acknowledge all open anomalies?"
        description={`Marks ${formatNumber(data?.openBacklog ?? 0)} open anomalies as seen without a verdict. You can still record a disposition afterwards.`}
        actionLabel="Acknowledge all"
        actionVariant="primary"
        isActionLoading={acking}
        onAction={async () => {
          setAcking(true)
          try {
            await guard(async () => {
              await acknowledgeAllAnomalies()
              await router.invalidate()
            })
          } finally {
            setAcking(false)
            setConfirmOpen(false)
          }
        }}
      />
    </>
  )
}
