import { pageSsr } from '#/lib/pageSsr'
import { GroupOverview } from '#/components/EntityBlocks'
import { VStack } from '@astryxdesign/core/Stack'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { RelatedPanel } from '#/components/Related'
import { ensure, usePageQuery } from '#/lib/query'
import { networkQuery, relatedQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/networks/$cidr')

export const Route = createFileRoute('/_layout/networks/$cidr/')({
  ssr: pageSsr,
  loader: ({ params, context }) => ensure(context, relatedQuery('network', params.cidr)),
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const n = usePageQuery(networkQuery(parent.useParams().cidr))
    const { cidr } = parent.useParams()
    return (
      <VStack gap={4}>
        <GroupOverview group={n?.group} base={`/networks/${encodeURIComponent(cidr)}`} sourcesTab="sources" eventsTab="events" />
        <RelatedPanel center={cidr} groups={usePageQuery(relatedQuery('network', Route.useParams().cidr))} />
      </VStack>
    )
  }
