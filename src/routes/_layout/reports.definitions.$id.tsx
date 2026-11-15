import { pageSsr } from '#/lib/pageSsr'
import { SkeletonTable } from '#/components/SkeletonTable'
import { SkeletonLines } from '#/components/EntityBlocks'
import { Pending } from '#/components/Pending'
import { ensure, usePageQuery } from '#/lib/query'
import type { ResourceData } from '#/lib/query'
import { ActionLink } from '#/components/ActionLink'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Link } from '@astryxdesign/core/Link'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import { ReviewStep, describeSchedule } from '#/components/details/Report'
import { EntityFrame } from '#/components/EntityFrame'
import { NotFound } from '#/components/NotFound'
import { reportsQuery } from '#/data/resources'
import type { GeneratedReport } from '#/data/types'
import { formatDateTime } from '#/lib/format'

/** The definition the page is about, with its reports, from the reports read. */
const pick = (data: ResourceData<typeof reportsQuery>, id: string) => {
  const definition = data.definitions.find((d) => d.id === id)
  return definition && { data, definition, generated: data.generated.filter((g) => g.definitionId === id) }
}

export const Route = createFileRoute('/_layout/reports/definitions/$id')({
  ssr: pageSsr,
  loader: async ({ params, context }) => {
    const page = pick(await ensure(context, reportsQuery()), params.id)
    if (!page) throw notFound()
    return page
  },
  notFoundComponent: () => (
    <NotFound
      title="Report definition"
      description="No saved definition has this id."
    />
  ),
  component: DefinitionPage,
  pendingComponent: DefinitionPage,
})

const generatedColumns: TableColumn<GeneratedReport>[] = [
  {
    key: 'createdAt',
    header: 'Created',
    width: pixel(184),
    renderCell: (row) => (
      <Text type="supporting">{formatDateTime(row.createdAt)}</Text>
    ),
  },
  {
    key: 'title',
    header: 'Title',
    width: proportional(2),
    renderCell: (row) => (
      <Link href={`/reports/generated/${row.id}`}>{row.title}</Link>
    ),
  },
  {
    key: 'origin',
    header: 'Origin',
    width: pixel(96),
    renderCell: (row) => (
      <Token
        size="sm"
        label={row.origin}
        color={row.origin === 'schedule' ? 'blue' : 'gray'}
      />
    ),
  },
  {
    key: 'sizeBytes',
    header: 'Size',
    width: pixel(80),
    align: 'end',
    renderCell: (row) => `${Math.round(row.sizeBytes / 1024)} KB`,
  },
]

function DefinitionPage() {
  const { id } = Route.useParams()
  const reports = usePageQuery(reportsQuery())
  const loaded = reports && pick(reports, id)
  const data = loaded?.data
  const d = loaded?.definition
  const generated = loaded?.generated
  return (
    <EntityFrame
      kind="Report definition"
      title={<Pending width={320}>{d && d.name}</Pending>}
      basePath={`/reports/definitions/${encodeURIComponent(id)}`}
      actions={<ActionLink href="/reports/library">Report library</ActionLink>}
      facts={[
        { label: 'Schedule', value: d && describeSchedule(d.schedule) },
        ...(d?.schedule?.nextRunAt ? [{ label: 'Next run', value: formatDateTime(d.schedule.nextRunAt) }] : []),
        ...(d?.schedule?.lastRunAt ? [{ label: 'Last scheduled run', value: formatDateTime(d.schedule.lastRunAt) }] : []),
        { label: 'Created', value: d && formatDateTime(d.created) },
        { label: 'PDFs produced', value: d && (String(generated?.length))},
      ]}
    >
      <VStack gap={4}>
        <Panel title="What it produces">
          {d && data ? <ReviewStep draft={d} data={data} /> : <SkeletonLines count={8} />}
        </Panel>
        <Panel title={generated ? `Generated reports (${generated.length})` : 'Generated reports'}>
          {!generated ? (
            <SkeletonTable columns={generatedColumns} rows={4} density="compact" />
          ) : generated.length ? (
            <Table
              data={generated}
              columns={generatedColumns}
              idKey="id"
              density="compact"
            />
          ) : (
            <Text type="supporting">
              This definition has not produced a PDF yet.
            </Text>
          )}
        </Panel>
      </VStack>
    </EntityFrame>
  )
}
