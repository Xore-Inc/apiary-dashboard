import { pageSsr } from '#/lib/pageSsr'
import { startQuery } from '#/lib/query'
import { entityTimelineQuery } from '#/data/resources'
import { createFileRoute } from '@tanstack/react-router'
import { Timeline } from '#/components/EntityBlocks'
import { Deferred } from '#/components/Deferred'

export const Route = createFileRoute('/_layout/asn/$asn/timeline')({
  ssr: pageSsr,
  loaderDeps: ({ search }) => ({ range: search.range }),
  // The slow read starts here and the page renders without waiting for it.
  loader: ({ params, deps, context }) => startQuery(context, entityTimelineQuery('asn', params.asn, deps.range)),
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  const { asn } = Route.useParams()
  const { range } = Route.useLoaderDeps()
  return <Deferred query={entityTimelineQuery('asn', asn, range)}>{(items) => <Timeline items={items} />}</Deferred>
}
