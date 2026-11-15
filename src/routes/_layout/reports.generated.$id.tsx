import { pageSsr } from '#/lib/pageSsr'
import { Pending } from '#/components/Pending'
import { ensure, usePageQuery } from '#/lib/query'
import type { ResourceData } from '#/lib/query'
import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import { EntityFrame } from '#/components/EntityFrame'
import { NotFound } from '#/components/NotFound'
import { reportsQuery } from '#/data/resources'
import { reportPdfHref } from '#/lib/reportPdf'
import { formatDateTime } from '#/lib/format'

/** The report the page is about, with its definition and template, from the reports read. */
const pick = (data: ResourceData<typeof reportsQuery>, id: string) => {
  const report = data.generated.find((g) => g.id === id)
  return report && { report, definition: data.definitions.find((d) => d.id === report.definitionId), template: data.templates.find((t) => t.id === report.template) }
}

export const Route = createFileRoute('/_layout/reports/generated/$id')({
  ssr: pageSsr,
  loader: async ({ params, context }) => {
    const page = pick(await ensure(context, reportsQuery()), params.id)
    if (!page) throw notFound()
    return page
  },
  notFoundComponent: () => (
    <NotFound
      title="Generated report"
      description="No generated report has this id; it may have been deleted."
    />
  ),
  component: GeneratedReportPage,
  pendingComponent: GeneratedReportPage,
})

function GeneratedReportPage() {
  const { id } = Route.useParams()
  const reports = usePageQuery(reportsQuery())
  const loaded = reports && pick(reports, id)
  const r = loaded?.report
  const definition = loaded?.definition
  const template = loaded?.template
  const pdf = reportPdfHref({ id })
  return (
    <EntityFrame
      kind="Generated report"
      title={<Pending width={320}>{r && r.title}</Pending>}
      basePath={`/reports/generated/${encodeURIComponent(id)}`}
      tokens={r && (<Token
          size="sm"
          label={r.origin}
          color={r.origin === 'schedule' ? 'blue' : 'gray'}
        />)}
      facts={[
        { label: 'Created', value: r && (formatDateTime(r.createdAt))},
        { label: 'Template', value: r && (template?.name ?? r.template)},
        { label: 'Size', value: r && (`${Math.round(r.sizeBytes / 1024)} KB`)},
        {
          label: 'Definition',
          value: r && (definition ? (
            <Link href={`/reports/definitions/${definition.id}`}>
              {definition.name}
            </Link>
          ) : r.definitionId ? (
            'deleted'
          ) : (
            'one-off'
          )),
        },
      ]}
    >
      <Panel title="Document" action={<Button label="Open PDF" size="sm" variant="secondary" href={pdf} target="_blank" rel="noopener noreferrer" />}>
        {/* The browser's own PDF viewer; the document is served inline. */}
        <iframe title={`${r?.title ?? "Report"} (PDF)`} src={pdf} style={{ width: '100%', height: 'calc(70dvh / var(--ui-zoom, 1))', border: 0, borderRadius: 8 }} />
      </Panel>
    </EntityFrame>
  )
}
