import { pageSsr } from '#/lib/pageSsr'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { EventsPanel } from '#/components/DetailBlocks'
import { usePageQuery } from '#/lib/query'
import { llmAnalysisQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/llm-analysis/$id')

export const Route = createFileRoute('/_layout/llm-analysis/$id/evidence')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  return (
    <EventsPanel
      title="The events the model read"
      events={usePageQuery(llmAnalysisQuery(parent.useParams().id))?.events}
      showSource
      empty="This analysis aggregates many sources; it has no single set of events."
    />
  )
}
