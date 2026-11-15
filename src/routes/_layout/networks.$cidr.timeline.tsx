import { pageSsr } from '#/lib/pageSsr'
import { createFileRoute } from '@tanstack/react-router'
import { Timeline } from '#/components/EntityBlocks'
import { ensure, usePageQuery } from '#/lib/query'
import { entityTimelineQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/networks/$cidr/timeline')({
  ssr: pageSsr,
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ params, deps, context }) => ensure(context, entityTimelineQuery('network', params.cidr, deps.range)),
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  return <Timeline items={usePageQuery(entityTimelineQuery('network', Route.useParams().cidr, Route.useLoaderDeps().range))} />
}
