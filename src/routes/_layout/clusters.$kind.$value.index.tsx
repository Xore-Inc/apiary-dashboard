import { pageSsr } from '#/lib/pageSsr'
import { GroupOverview } from '#/components/EntityBlocks'
import { VStack } from '@astryxdesign/core/Stack'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { RelatedPanel } from '#/components/Related'
import { startQuery, usePageQuery } from '#/lib/query'
import { clusterQuery, relatedQuery } from '#/data/resources'
import { Deferred } from '#/components/Deferred'

const parent = getRouteApi('/_layout/clusters/$kind/$value')

export const Route = createFileRoute('/_layout/clusters/$kind/$value/')({
  ssr: pageSsr,
  // The slow read starts here and the page renders without waiting for it.
  loader: ({ params, context }) => startQuery(context, relatedQuery('cluster', `${params.kind}:${params.value}`)),
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const c = usePageQuery(clusterQuery(parent.useParams().kind, parent.useParams().value))
    const { kind, value } = parent.useParams()
    return (
      <VStack gap={4}>
        <GroupOverview group={c?.group} base={`/clusters/${kind}/${encodeURIComponent(value)}`} sourcesTab="members" eventsTab="events" />
        <Deferred query={relatedQuery('cluster', `${Route.useParams().kind}:${Route.useParams().value}`)}>{(groups) => <RelatedPanel center={value} groups={groups} />}</Deferred>
      </VStack>
    )
  }
