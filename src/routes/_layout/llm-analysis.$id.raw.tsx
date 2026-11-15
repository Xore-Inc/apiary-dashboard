import { pageSsr } from '#/lib/pageSsr'
import { JsonBlock } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import { usePageQuery } from '#/lib/query'
import { llmAnalysisQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/llm-analysis/$id')

export const Route = createFileRoute('/_layout/llm-analysis/$id/raw')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  return (
    <Panel title="The stored document">
      <JsonBlock value={usePageQuery(llmAnalysisQuery(parent.useParams().id))?.analysis} />
    </Panel>
  )
}
