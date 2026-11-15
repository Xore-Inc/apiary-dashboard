import { pageSsr } from '#/lib/pageSsr'
import { ensure, usePageQuery } from '#/lib/query'
import { entityTimelineQuery } from '#/data/resources'
import { createFileRoute } from '@tanstack/react-router'
import { Timeline } from '#/components/EntityBlocks'

export const Route = createFileRoute('/_layout/asn/$asn/timeline')({
  ssr: pageSsr,
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ params, deps, context }) => ensure(context.queryClient, entityTimelineQuery('asn', params.asn, deps.range)),
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  const { asn } = Route.useParams()
  const { range } = Route.useLoaderDeps()
  return <Timeline items={usePageQuery(entityTimelineQuery('asn', asn, range))} />
}
