import { pageSsr } from '#/lib/pageSsr'
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { PageFrame } from '#/components/PageFrame'
import { SkeletonPanels } from '#/components/EntityBlocks'
import { ensure, usePageQuery } from '#/lib/query'
import { REPORT_WIDE, ReportWizard, emptyDraft } from '#/components/reports/ReportWizard'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { facetsQuery, reportsQuery } from '#/data/resources'
import { reportTabs } from '#/lib/navFamilies'

export const Route = createFileRoute('/_layout/reports/generate')({
  ssr: pageSsr,
  staticData: { viewTabs: reportTabs },
  // ?template= starts from a template, ?from= re-opens a Library definition.
  validateSearch: (search: Record<string, unknown>): { template?: string; from?: string } => ({
    template: typeof search.template === 'string' && search.template ? search.template : undefined,
    from: typeof search.from === 'string' && search.from ? search.from : undefined,
  }),
  // The pickers run without the counted facets until the backend serves
  // them (#3524): facetsQuery answers a gap.
  loader: async ({ context }) => {
    const [data, facets] = await Promise.all([ensure(context, reportsQuery()), ensure(context, facetsQuery())])
    return { data, facets }
  },
  component: GeneratePage,
  pendingComponent: GeneratePage,
})

function GeneratePage() {
  const data = usePageQuery(reportsQuery())
  const facets = usePageQuery(facetsQuery())
  const { template, from } = Route.useSearch()
  // Bumping the key starts a fresh wizard after a report was generated.
  const [run, setRun] = useState(0)
  // Wide: the steps and a live preview fill the page side by side.
  const wide = useMediaQuery(REPORT_WIDE)
  const source = from ? data?.definitions.find((d) => d.id === from) : undefined

  return (
    <PageFrame
      title={source && run === 0 ? `Generate: ${source.name}` : 'Generate a report'}
      description="Decide what the report covers and how it looks; the data is checked and each section rendered before the PDF is made."
      contentWidth={wide ? undefined : 800}
    >
      {data && facets ? (
        <ReportWizard key={`${from ?? template ?? ''}-${run}`} data={data} facets={facets} initial={source && run === 0 ? structuredClone(source) : emptyDraft(data, template)} onRestart={() => setRun((n) => n + 1)} />
      ) : (
        <SkeletonPanels count={1} lines={10} />
      )}
    </PageFrame>
  )
}
