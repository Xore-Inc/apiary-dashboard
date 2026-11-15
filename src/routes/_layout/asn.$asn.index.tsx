import { pageSsr } from '#/lib/pageSsr'
import { startQuery, usePageQuery } from '#/lib/query'
import { asnQuery, relatedQuery } from '#/data/resources'
import { GroupOverview } from '#/components/EntityBlocks'
import { VStack } from '@astryxdesign/core/Stack'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { RelatedPanel } from '#/components/Related'
import { Deferred } from '#/components/Deferred'

const parent = getRouteApi('/_layout/asn/$asn')

export const Route = createFileRoute('/_layout/asn/$asn/')({
  ssr: pageSsr,
  // The slow read starts here and the page renders without waiting for it.
  loader: ({ params, context }) => startQuery(context, relatedQuery('asn', params.asn)),
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const { asn } = parent.useParams()
    const a = usePageQuery(asnQuery(asn))
    return (
      <VStack gap={4}>
        <GroupOverview group={a?.group} base={`/asn/${encodeURIComponent(asn)}`} sourcesTab="sources" eventsTab="events" />
        <Deferred query={relatedQuery('asn', asn)}>{(groups) => <RelatedPanel center={asn} groups={groups} />}</Deferred>
      </VStack>
    )
  }
