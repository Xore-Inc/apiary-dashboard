import { pageSsr } from '#/lib/pageSsr'
import { createFileRoute } from '@tanstack/react-router'
import { Timeline } from '#/components/EntityBlocks'
import { startQuery } from '#/lib/query'
import { entityTimelineQuery } from '#/data/resources'
import { Deferred } from '#/components/Deferred'

export const Route = createFileRoute('/_layout/ioc/$kind/$value/timeline')({
  ssr: pageSsr,
  loaderDeps: ({ search }) => ({ range: search.range }),
  // The slow read starts here and the page renders without waiting for it.
  loader: ({ params, deps, context }) => startQuery(context, entityTimelineQuery('ioc', `${params.kind}:${params.value}`, deps.range)),
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  return <Deferred query={entityTimelineQuery('ioc', `${Route.useParams().kind}:${Route.useParams().value}`, Route.useLoaderDeps().range)}>{(items) => <Timeline items={items} />}</Deferred>
}
