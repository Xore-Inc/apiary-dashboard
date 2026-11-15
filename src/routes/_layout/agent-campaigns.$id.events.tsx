import { pageSsr } from '#/lib/pageSsr'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { EventsPanel } from '#/components/DetailBlocks'
import { usePageQuery } from '#/lib/query'
import { agentCampaignQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/agent-campaigns/$id')

export const Route = createFileRoute('/_layout/agent-campaigns/$id/events')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  return (
    <EventsPanel
      title="Sensor events in this campaign"
      events={usePageQuery(agentCampaignQuery(parent.useParams().id))?.events}
      showSource
      empty="The events sit in agent-sensor indices; open them from the evidence timeline."
    />
  )
}
