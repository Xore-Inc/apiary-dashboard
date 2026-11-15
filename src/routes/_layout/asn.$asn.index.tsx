import { pageSsr } from '#/lib/pageSsr'
import { ensure, usePageQuery } from '#/lib/query'
import { asnQuery, relatedQuery } from '#/data/resources'
import { GroupOverview } from '#/components/EntityBlocks'
import { VStack } from '@astryxdesign/core/Stack'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { RelatedPanel } from '#/components/Related'

const parent = getRouteApi('/_layout/asn/$asn')

export const Route = createFileRoute('/_layout/asn/$asn/')({
  ssr: pageSsr,
  loader: ({ params, context }) => ensure(context.queryClient, relatedQuery('asn', params.asn)),
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const { asn } = parent.useParams()
    const a = usePageQuery(asnQuery(asn))
    return (
      <VStack gap={4}>
        <GroupOverview group={a?.group} base={`/asn/${encodeURIComponent(asn)}`} sourcesTab="sources" eventsTab="events" />
        <RelatedPanel center={asn} groups={usePageQuery(relatedQuery('asn', asn))} />
      </VStack>
    )
  }
