import { pageSsr } from '#/lib/pageSsr'
import { createFileRoute } from '@tanstack/react-router'
import { Timeline } from '#/components/EntityBlocks'
import { ensure, usePageQuery } from '#/lib/query'
import { sourceTimelineQuery } from '#/data/resources'


export const Route = createFileRoute('/_layout/sources/$ip/timeline')({
  ssr: pageSsr,
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ params, deps, context }) => ensure(context, sourceTimelineQuery(params.ip, deps.range)),
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  return <Timeline items={usePageQuery(sourceTimelineQuery(Route.useParams().ip, Route.useLoaderDeps().range))} />
}
