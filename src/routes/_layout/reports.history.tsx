import { pageSsr } from '#/lib/pageSsr'
import { useState } from 'react'
import { reportPdfHref } from '#/lib/reportPdf'
import { ConfirmDialog } from '#/components/AppDialog'
import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/Stack'
import { pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute } from '@tanstack/react-router'
import { FilterSelect, listParam, toParam } from '#/components/FilterSelect'
import { RecordList } from '#/components/RecordList'
import { deleteGeneratedReportWrite } from '#/data/writes'
import { useDataMutation } from '#/lib/mutation'
import type { GeneratedReport } from '#/data/types'
import { formatDateTime } from '#/lib/format'
import { useGuardedAction } from '#/lib/useGuardedAction'
import { FieldStatus } from '@astryxdesign/core/FieldStatus'
import { reportTabs } from '#/lib/navFamilies'
import { useIsAdmin } from '#/lib/session'
import { ensure, usePageQuery } from '#/lib/query'
import { reportsQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/reports/history')({
  ssr: pageSsr,
  staticData: { viewTabs: reportTabs },
  validateSearch: (search: Record<string, unknown>): { origin?: string; template?: string } => ({
    origin: toParam(listParam(search.origin).filter((o) => o === 'manual' || o === 'schedule')),
    template: toParam(listParam(search.template)),
  }),
  loader: ({ context }) => ensure(context, reportsQuery()),
  component: HistoryPage,
  pendingComponent: HistoryPage,
})

/** Every PDF generated, newest first; a row opens the report. */
function HistoryPage() {
  const data = usePageQuery(reportsQuery())
  const { origin, template } = Route.useSearch()
  const navigate = Route.useNavigate()
  const origins = listParam(origin)
  const templates = listParam(template)
  const setFilter = (patch: { origin?: string; template?: string }) => void navigate({ search: (prev) => ({ ...prev, ...patch }) })
  const deleteReport = useDataMutation(deleteGeneratedReportWrite())
  const [confirm, setConfirm] = useState<GeneratedReport | null>(null)
  const [busy, setBusy] = useState(false)
  const { error, guard } = useGuardedAction()
  const templateName = (id: string) => data?.templates.find((t) => t.id === id)?.name ?? id
  const definitionName = (id: string) => data?.definitions.find((d) => d.id === id)?.name
  const rows = data?.generated.filter((r) => (!origins.length || origins.includes(r.origin)) && (!templates.length || templates.includes(r.template)))
  const count = (of: (r: GeneratedReport) => string, value: string) => data?.generated.filter((r) => of(r) === value).length

  const isAdmin = useIsAdmin()
  const columns: TableColumn<GeneratedReport>[] = [
    { key: 'createdAt', header: 'Generated', width: pixel(184), renderCell: (row) => <Text type="supporting">{formatDateTime(row.createdAt)}</Text> },
    { key: 'title', header: 'Title', width: proportional(2), renderCell: (row) => <Text weight="semibold">{row.title}</Text> },
    { key: 'template', header: 'Template', width: pixel(168), renderCell: (row) => templateName(row.template) },
    { key: 'definitionId', header: 'From', width: proportional(1), renderCell: (row) => <Text type="supporting">{definitionName(row.definitionId) ?? (row.definitionId ? 'deleted definition' : 'one-off')}</Text> },
    { key: 'origin', header: 'Origin', width: pixel(96), renderCell: (row) => <Token size="sm" label={row.origin} color={row.origin === 'schedule' ? 'blue' : 'gray'} /> },
    { key: 'sizeBytes', header: 'Size', width: pixel(80), align: 'end', renderCell: (row) => `${Math.round(row.sizeBytes / 1024)} KB` },
    {
      key: 'id',
      header: '',
      width: pixel(160),
      renderCell: (row) => (
        <HStack gap={1}>
          <Button label="PDF" size="sm" variant="ghost" tooltip="Open the PDF in a new tab" href={reportPdfHref(row)} target="_blank" rel="noopener noreferrer" />
          {isAdmin && <Button label="Delete" size="sm" variant="ghost" onClick={() => setConfirm(row)} />}
        </HStack>
      ),
    },
  ]

  return (
    <>
      <RecordList
        title="Report history"
        description="Every PDF the studio produced, by hand or on a schedule."
        actions={
          <HStack gap={2} vAlign="center">
            {error && <FieldStatus type="error" variant="detached" message={error} />}
            <Button label="Generate a report" size="sm" href="/reports/generate" />
          </HStack>
        }
        toolbar={
          <HStack gap={2} wrap="wrap">
            <FilterSelect
              label="Origin"
              isLabelHidden
              size="sm"
              width={180}
              placeholder="Manual and scheduled"
              options={[
                { value: 'manual', label: 'Manual', count: count((r) => r.origin, 'manual') },
                { value: 'schedule', label: 'Scheduled', count: count((r) => r.origin, 'schedule') },
              ]}
              value={origins}
              onChange={(values) => setFilter({ origin: toParam(values) })}
            />
            <FilterSelect
              label="Template"
              isLabelHidden
              size="sm"
              width={200}
              placeholder="Any template"
              options={(data?.templates ?? []).map((t) => ({ value: t.id, label: t.name, count: count((r) => r.template, t.id) }))}
              value={templates}
              onChange={(values) => setFilter({ template: toParam(values) })}
            />
          </HStack>
        }
        rows={rows}
        columns={columns}
        getId={(row) => row.id}
        getHref={(row) => `/reports/generated/${row.id}`}
        emptyState={{ title: 'No reports yet', description: 'Generate one, or wait for a scheduled definition to run.' }}
      />
      <ConfirmDialog
        isOpen={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Delete this report?"
        description={`“${confirm?.title ?? ''}” generated ${confirm ? formatDateTime(confirm.createdAt) : ''} will be removed permanently.`}
        actionLabel="Delete"
        isActionLoading={busy}
        onAction={async () => {
          if (!confirm) return
          setBusy(true)
          try {
            await guard(async () => {
              await deleteReport.mutateAsync([confirm.id])
            })
          } finally {
            setBusy(false)
            setConfirm(null)
          }
        }}
      />
    </>
  )
}
