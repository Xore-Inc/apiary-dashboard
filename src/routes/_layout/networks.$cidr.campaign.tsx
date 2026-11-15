import { pageSsr } from '#/lib/pageSsr'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Panel } from '#/components/DashboardBlocks'
import { EntityLink } from '#/components/EntityLink'
import { formatNumber } from '#/lib/format'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { usePageQuery } from '#/lib/query'
import { networkQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/networks/$cidr')

export const Route = createFileRoute('/_layout/networks/$cidr/campaign')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const n = usePageQuery(networkQuery(parent.useParams().cidr))
    return n?.campaign ? (
      <Panel title="Detected campaign">
        <VStack gap={2}>
          <EntityLink kind="campaign" id={n.campaign.cidr}>{`Open campaign ${n.campaign.cidr} · score ${n.campaign.score}`}</EntityLink>
          <Text color="secondary">{n.campaign.explanation}</Text>
          <Text type="supporting">
            {formatNumber(n.campaign.events)} events from {formatNumber(n.campaign.uniqueIps)} addresses across {n.campaign.sensors.length} sensors.
          </Text>
        </VStack>
      </Panel>
    ) : (
      <Text type="supporting">This prefix is not part of a detected campaign.</Text>
    )
  }
