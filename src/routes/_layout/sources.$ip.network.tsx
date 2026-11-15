import { pageSsr } from '#/lib/pageSsr'
import { Grid } from '@astryxdesign/core/Grid'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { createFileRoute } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import { SourcesTable } from '#/components/EntityBlocks'
import { EntityLink } from '#/components/EntityLink'
import { formatNumber } from '#/lib/format'
import { ensure, usePageQuery } from '#/lib/query'
import { sourceNetworkQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/sources/$ip/network')({
  ssr: pageSsr,
  loader: ({ params, context }) => ensure(context, sourceNetworkQuery(params.ip)),
  component: SourceNetworkTab,
  pendingComponent: SourceNetworkTab,
})

function SourceNetworkTab() {
  const net = usePageQuery(sourceNetworkQuery(Route.useParams().ip))
  if (!net) return <Text type="supporting">No network data for this address.</Text>
  return (
    <VStack gap={4}>
      <Grid columns={{ minWidth: 320, repeat: 'fit' }} gap={4}>
        <Panel title="Network">
          <MetadataList>
            <MetadataListItem label="Prefix">
              <EntityLink kind="network" id={net.cidr} />
            </MetadataListItem>
            <MetadataListItem label="Autonomous system">
              {net.asn ? <EntityLink kind="asn" id={net.asn}>{[net.asn, net.org].filter(Boolean).join(' · ')}</EntityLink> : (net.org || '—')}
            </MetadataListItem>
            <MetadataListItem label="Country">
              {net.country ? <EntityLink kind="country" id={net.country} /> : '—'}
            </MetadataListItem>
          </MetadataList>
        </Panel>
        <Panel title="Campaign">
          {net.campaign ? (
            <VStack gap={2}>
              <EntityLink kind="campaign" id={net.campaign.cidr}>{`Campaign ${net.campaign.cidr} · score ${net.campaign.score}`}</EntityLink>
              <Text color="secondary">{net.campaign.explanation}</Text>
              <Text type="supporting">
                {formatNumber(net.campaign.events)} events from {formatNumber(net.campaign.uniqueIps)} addresses across {net.campaign.sensors.length} sensors.
              </Text>
            </VStack>
          ) : (
            <Text type="supporting">This prefix is not part of a detected campaign.</Text>
          )}
        </Panel>
      </Grid>
      <Panel title={`Neighbours in ${net.cidr} (${net.neighbours.length})`}>
        <SourcesTable sources={net.neighbours} empty="No other address in this prefix reached a sensor." />
      </Panel>
    </VStack>
  )
}
