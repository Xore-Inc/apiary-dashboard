import { pageSsr } from '#/lib/pageSsr'
import { SkeletonPanels } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { LlmSummary } from '#/components/details/LlmAnalysis'
import { usePageQuery } from '#/lib/query'
import { llmAnalysisQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/llm-analysis/$id')

export const Route = createFileRoute('/_layout/llm-analysis/$id/')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  const rec = usePageQuery(llmAnalysisQuery(parent.useParams().id))?.analysis
  return rec ? <LlmSummary row={rec} /> : <SkeletonPanels />
}
