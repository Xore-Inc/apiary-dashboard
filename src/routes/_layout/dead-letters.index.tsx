import { pageSsr } from '#/lib/pageSsr'
import { textParam } from '#/lib/searchParams'
import { useState } from 'react'
import { ConfirmDialog } from '#/components/AppDialog'
import { Button } from '@astryxdesign/core/Button'
import { HStack, StackItem } from '@astryxdesign/core/Stack'
import { pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute } from '@tanstack/react-router'
import { RecordList } from '#/components/RecordList'
import { purgeDeadLettersWrite } from '#/data/writes'
import { useDataMutation } from '#/lib/mutation'
import { describeError } from '#/lib/actionError'
import { useIsAdmin } from '#/lib/session'
import { FieldStatus } from '@astryxdesign/core/FieldStatus'
import type { DeadLetter } from '#/data/types'
import { formatDateTime } from '#/lib/format'
import { healthTabs } from '#/lib/navFamilies'
import { ensure, usePageQuery } from '#/lib/query'
import { deadLettersQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/dead-letters/')({
  ssr: pageSsr,
  staticData: { viewTabs: healthTabs },
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: textParam(search.q),
  }),
  loaderDeps: ({ search }) => ({ q: search.q ?? '' }),
  loader: ({ deps, context }) => ensure(context, deadLettersQuery(deps.q)),
  component: DeadLettersPage,
  pendingComponent: DeadLettersPage,
})

const columns: TableColumn<DeadLetter>[] = [
  { key: 'timestamp', header: 'Time', width: pixel(184), renderCell: (row) => <Text type="supporting">{formatDateTime(row.timestamp)}</Text> },
  { key: 'source', header: 'Source', width: pixel(104), renderCell: (row) => <Token size="sm" label={row.source} /> },
  { key: 'reason', header: 'Reason', width: proportional(4), renderCell: (row) => <Text type="code" maxLines={1}>{row.reason}</Text> },
]

function DeadLettersPage() {
  const rows = usePageQuery(deadLettersQuery(Route.useLoaderDeps().q))
  const { q } = Route.useSearch()
  const navigate = Route.useNavigate()
  const purge = useDataMutation(purgeDeadLettersWrite())
  const [draft, setDraft] = useState(q ?? '')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const isAdmin = useIsAdmin()

  return (
    <>
      <RecordList
        title="Ingest dead letters"
        description="Documents Elasticsearch rejected, with their original error and field shape for remediation. An empty list is the healthy state."
        actions={
          <HStack gap={2} vAlign="center">
            {error && <FieldStatus type="error" variant="detached" message={error} />}
            {isAdmin && <Button label={rows ? `Purge ${rows.length} shown` : 'Purge shown'} size="sm" variant="destructive" isDisabled={!rows?.length} onClick={() => setConfirmOpen(true)} />}
          </HStack>
        }
        toolbar={
          <HStack gap={2} vAlign="end">
            <StackItem size="fill">
              <TextInput label="Query" isLabelHidden placeholder="Optional query, e.g. mapper_parsing_exception" value={draft} onChange={setDraft} onEnter={() => void navigate({ search: { q: draft.trim() || undefined } })} />
            </StackItem>
            <Button label="Filter" variant="secondary" onClick={() => void navigate({ search: { q: draft.trim() || undefined } })} />
          </HStack>
        }
        rows={rows}
        columns={columns}
        getId={(row) => row.id}
        getHref={(row) => `/dead-letters/${encodeURIComponent(row.id)}`}
        emptyState={{ title: 'No dead letters', description: 'Every document was accepted. This is the healthy state.' }}
      />
      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Purge ${rows?.length ?? 0} dead letters?`}
        description={q ? `Deletes only the documents matching “${q}”. This cannot be undone.` : 'No query is set, so this deletes every dead letter. This cannot be undone.'}
        actionLabel="Purge"
        isActionLoading={busy}
        onAction={async () => {
          setBusy(true)
          setError(undefined)
          try {
            // The query, not the rows: the backend purges the `q` scope its
            // own list searched, which is what the dialog describes.
            await purge.mutateAsync([q ?? ''])
          } catch (e) {
            setError(describeError(e))
          } finally {
            setBusy(false)
            setConfirmOpen(false)
          }
        }}
      />
    </>
  )
}
