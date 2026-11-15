import { pageSsr } from '#/lib/pageSsr'
import { Pending } from '#/components/Pending'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { RelatedPanel } from '#/components/Related'
import { Panel } from '#/components/DashboardBlocks'
import { EntityLink } from '#/components/EntityLink'
import { GroupOverview } from '#/components/EntityBlocks'
import { ensure, usePageQuery } from '#/lib/query'
import { campaignQuery, relatedQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/campaigns/$cidr')

export const Route = createFileRoute('/_layout/campaigns/$cidr/')({
  ssr: pageSsr,
  loader: ({ params, context }) => ensure(context, relatedQuery('campaign', params.cidr)),
  component: CampaignOverview,
  pendingComponent: CampaignOverview,
})

function CampaignOverview() {
  const loaded = usePageQuery(campaignQuery(parent.useParams().cidr))
  const c = loaded?.campaign
  const { cidr } = parent.useParams()
  const group = loaded?.group
  return (
    <VStack gap={4}>
      <Panel title="What it did, in order">
        <HStack gap={1} wrap="wrap" vAlign="center">
          {c?.sequence.map((step, i) => (
            <HStack key={`${step}-${i}`} gap={1} vAlign="center">
              {i > 0 && <Text type="supporting">→</Text>}
              <Token size="sm" label={step} />
            </HStack>
          ))}
        </HStack>
        <HStack gap={3} wrap="wrap">
          <Text type="supporting">Providers:</Text>
          {c?.asns.map((asn) => (
            <EntityLink key={asn} kind="asn" id={asn} />
          ))}
          <Text type="supporting"><Pending width={320}>{c && `${c.dstIpsTouched} destinations · ${c.portsTouched} ports · ${c.payloads} payloads · ${c.alerts} alerts`}</Pending></Text>
        </HStack>
      </Panel>
      <GroupOverview group={group} base={`/campaigns/${encodeURIComponent(cidr)}`} sourcesTab="sources" />
      <RelatedPanel center={cidr} groups={usePageQuery(relatedQuery('campaign', Route.useParams().cidr))} />
    </VStack>
  )
}
