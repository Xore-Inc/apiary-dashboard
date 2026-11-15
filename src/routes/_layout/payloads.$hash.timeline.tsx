import { pageSsr } from '#/lib/pageSsr'
import { createFileRoute } from '@tanstack/react-router'
import { Timeline } from '#/components/EntityBlocks'
import { ensure, usePageQuery } from '#/lib/query'
import { entityTimelineQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/payloads/$hash/timeline')({
  ssr: pageSsr,
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ params, deps, context }) => ensure(context, entityTimelineQuery('payload', params.hash, deps.range)),
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  return <Timeline items={usePageQuery(entityTimelineQuery('payload', Route.useParams().hash, Route.useLoaderDeps().range))} />
}
