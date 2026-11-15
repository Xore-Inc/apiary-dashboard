import { pageSsr } from '#/lib/pageSsr'
import { Pending } from '#/components/Pending'
import { Token } from '@astryxdesign/core/Token'
import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { EvidenceLink } from '#/components/details/LlmAnalysis'
import { EntityFrame } from '#/components/EntityFrame'
import { entityTabs } from '#/components/ViewTabs'
import type { ViewTab } from '#/components/ViewTabs'
import { NotFound } from '#/components/NotFound'
import { SeverityToken } from '#/components/SeverityToken'
import { formatDateTime } from '#/lib/format'
import { ensure, usePageQuery } from '#/lib/query'
import { llmAnalysisQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/llm-analysis/$id')({
  ssr: pageSsr,
  staticData: { viewTabs: entityTabs({ label: 'LLM analysis views', basePath: (params) => `/llm-analysis/${encodeURIComponent(params.id)}`, tabs: tabsFor }) },
  loader: async ({ params, context }) => {
    const detail = await ensure(context, llmAnalysisQuery(params.id))
    if (!detail) throw notFound()
    return detail
  },
  notFoundComponent: () => (
    <NotFound title="LLM analysis" description="No analysis has this id." />
  ),
  component: LlmLayout,
  pendingComponent: LlmLayout,
})

function LlmLayout() {
  const loaded = usePageQuery(llmAnalysisQuery(Route.useParams().id))
  const { id } = Route.useParams()
  const a = loaded?.analysis
  return (
    <EntityFrame
      kind={a ? `LLM analysis · ${a.docType}` : "LLM analysis"}
      title={<Pending width={320}>{a && a.intent}</Pending>}
      basePath={`/llm-analysis/${encodeURIComponent(id)}`}
      tokens={a && (<>
          <SeverityToken severity={a.severity} />
          <Token label="AI-generated" size="sm" />
        </>)}
      facts={[
        { label: 'Analyzed', value: a && (formatDateTime(a.timestamp))},
        { label: 'Confidence', value: a && (a.confidence ?? '—')},
        { label: 'Evidence', value: a && (<EvidenceLink row={a} />)},
        { label: 'Model', value: a && (a.model)},
      ]}
    >
      <Outlet />
    </EntityFrame>
  )
}

/** The top-bar tabs: static until the loader data arrives, then with counts. */
function tabsFor(loaded: unknown): ViewTab[] {
  if (!loaded) return [{ id: 'summary', label: 'Summary' }, { id: 'evidence', label: 'Evidence' }, { id: 'behaviors', label: 'Behaviors' }, { id: 'raw', label: 'Raw' }]
  const data = loaded as ReturnType<typeof Route.useLoaderData>
  const { analysis: a, events } = data
  return [
    { id: 'summary', label: 'Summary' },
    { id: 'evidence', label: 'Evidence', count: events.length },
    { id: 'behaviors', label: 'Behaviors', count: a?.behaviors.length },
    { id: 'raw', label: 'Raw' },
  ]
}
