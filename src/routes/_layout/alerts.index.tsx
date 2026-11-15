import { pageSsr } from '#/lib/pageSsr'
import { useState } from 'react'
import { ConfirmDialog } from '#/components/AppDialog'
import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/Stack'
import { pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute } from '@tanstack/react-router'
import { searchTabs } from '#/components/ViewTabs'
import { RecordList } from '#/components/RecordList'
import { SeverityToken } from '#/components/SeverityToken'
import { alertKeyOf } from '#/data/queries'
import { acknowledgeAllAlertsWrite } from '#/data/writes'
import { useDataMutation } from '#/lib/mutation'
import type { AlertGroup } from '#/data/types'
import { formatNumber, formatTime } from '#/lib/format'
import { AckButton } from '#/components/details/Alert'
import { useGuardedAction } from '#/lib/useGuardedAction'
import { FieldStatus } from '@astryxdesign/core/FieldStatus'
import { ensure, usePageQuery } from '#/lib/query'
import { alertsQuery } from '#/data/resources'

type View = 'new' | 'acknowledged'

export const Route = createFileRoute('/_layout/alerts/')({
  ssr: pageSsr,
  staticData: { viewTabs: searchTabs({ label: 'Alert views', param: 'view', tabs: (loaded) => { const groups = loaded as Array<{ acknowledged: boolean }> | undefined; return [{ id: 'new', label: 'New', count: groups?.filter((g) => !g.acknowledged).length }, { id: 'acknowledged', label: 'Acknowledged', count: groups?.filter((g) => g.acknowledged).length }] } }) },
  validateSearch: (search: Record<string, unknown>): { view?: View } => ({
    view: search.view === 'acknowledged' ? 'acknowledged' : undefined,
  }),
  loader: ({ context }) => ensure(context, alertsQuery()),
  component: AlertsPage,
  // The page itself while its data loads: its own layout, skeleton rows.
  pendingComponent: AlertsPage,
})

const columns: TableColumn<AlertGroup>[] = [
  { key: 'severity', header: 'Severity', width: pixel(96), renderCell: (row) => <SeverityToken severity={row.severity} /> },
  { key: 'kind', header: 'Kind', width: pixel(104), renderCell: (row) => <Token label={row.kind} size="sm" /> },
  {
    key: 'message',
    header: 'Message',
    width: proportional(4),
    renderCell: (row) => (
      <HStack gap={1.5} vAlign="center">
        {row.members.length > 1 && <Token label={`×${row.members.length}`} size="sm" />}
        <Text maxLines={1}>{row.message}</Text>
      </HStack>
    ),
  },
  { key: 'count', header: 'Observed', width: pixel(88), align: 'end', renderCell: (row) => formatNumber(row.count) },
  { key: 'lastSeen', header: 'Last seen', width: pixel(104), renderCell: (row) => <Text type="supporting">{formatTime(row.lastSeen)}</Text> },
  { key: 'acknowledged', header: '', width: pixel(176), renderCell: (row) => <AckButton group={row} /> },
]

function AlertsPage() {
  // Undefined while the route is pending (this component is its own
  // pending state).
  const groups: AlertGroup[] | undefined = usePageQuery(alertsQuery())
  const { view = 'new' } = Route.useSearch()
  const acknowledgeAll = useDataMutation(acknowledgeAllAlertsWrite())
  const [filter, setFilter] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { error, guard } = useGuardedAction()
  const [acking, setAcking] = useState(false)

  const open = groups?.filter((g) => !g.acknowledged)
  const acked = groups?.filter((g) => g.acknowledged)
  const openRecords = open?.reduce((sum, g) => sum + g.members.length, 0) ?? 0
  const needle = filter.trim().toLowerCase()
  const rows = (view === 'new' ? open : acked)?.filter(
    (g) => !needle || g.message.toLowerCase().includes(needle) || g.members.some((m) => m.key.toLowerCase().includes(needle)),
  )

  return (
    <>
      <RecordList
        title="Alerts"
        description="Persistent alert state, cooldowns, and acknowledgments. Acknowledging moves an alert from New to Acknowledged until it is reopened."
        actions={
          <HStack gap={2} vAlign="center">
            {error && <FieldStatus type="error" variant="detached" message={error} />}
            <Button
            label="Acknowledge all"
            size="sm"
            variant="secondary"
            isDisabled={openRecords === 0}
            onClick={() => setConfirmOpen(true)}
            />
          </HStack>
        }
        toolbar={
          <HStack gap={3} vAlign="center" wrap="wrap">
            <TextInput label="Filter alerts" isLabelHidden size="sm" width={260} placeholder="Filter by message or key" value={filter} onChange={setFilter} />
          </HStack>
        }
        rows={rows}
        columns={columns}
        getId={(row) => row.id}
        getHref={(row) => `/alerts/${encodeURIComponent(alertKeyOf(row))}`}
        emptyState={
          view === 'new'
            ? { title: 'No new alerts', description: 'Everything open has been acknowledged.' }
            : { title: 'Nothing acknowledged yet', description: 'Acknowledged alerts collect here until reopened.' }
        }
      />
      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Acknowledge every open alert?"
        description={`Moves ${formatNumber(openRecords)} open alerts to Acknowledged. Each can be reopened individually.`}
        actionLabel="Acknowledge all"
        actionVariant="primary"
        isActionLoading={acking}
        onAction={async () => {
          setAcking(true)
          try {
            await guard(async () => {
              await acknowledgeAll.mutateAsync()
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
