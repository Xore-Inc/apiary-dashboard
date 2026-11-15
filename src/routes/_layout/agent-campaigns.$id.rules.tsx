import { pageSsr } from '#/lib/pageSsr'
import { SkeletonPanels } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { AgentCampaignRules } from '#/components/details/AgentCampaign'
import { usePageQuery } from '#/lib/query'
import { agentCampaignQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/agent-campaigns/$id')

export const Route = createFileRoute('/_layout/agent-campaigns/$id/rules')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  const rec = usePageQuery(agentCampaignQuery(parent.useParams().id))?.campaign
  return rec ? <AgentCampaignRules campaign={rec} /> : <SkeletonPanels />
}
