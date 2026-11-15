import { pageSsr } from '#/lib/pageSsr'
import { GroupOverview } from '#/components/EntityBlocks'
import { VStack } from '@astryxdesign/core/Stack'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { RelatedPanel } from '#/components/Related'
import { startQuery, usePageQuery } from '#/lib/query'
import { networkQuery, relatedQuery } from '#/data/resources'
import { Deferred } from '#/components/Deferred'

const parent = getRouteApi('/_layout/networks/$cidr')

export const Route = createFileRoute('/_layout/networks/$cidr/')({
  ssr: pageSsr,
  // The slow read starts here and the page renders without waiting for it.
  loader: ({ params, context }) => startQuery(context, relatedQuery('network', params.cidr)),
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const n = usePageQuery(networkQuery(parent.useParams().cidr))
    const { cidr } = parent.useParams()
    return (
      <VStack gap={4}>
        <GroupOverview group={n?.group} base={`/networks/${encodeURIComponent(cidr)}`} sourcesTab="sources" eventsTab="events" />
        <Deferred query={relatedQuery('network', Route.useParams().cidr)}>{(groups) => <RelatedPanel center={cidr} groups={groups} />}</Deferred>
      </VStack>
    )
  }
