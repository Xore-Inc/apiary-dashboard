import { pageSsr } from '#/lib/pageSsr'
import { createFileRoute } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import { SessionsTable } from '#/components/EntityBlocks'
import { ensure, usePageQuery } from '#/lib/query'
import { sourceSessionsQuery } from '#/data/resources'


export const Route = createFileRoute('/_layout/sources/$ip/sessions')({
  ssr: pageSsr,
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ params, deps, context }) => ensure(context, sourceSessionsQuery(params.ip, deps.range)),
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  return (
    <Panel title="Sessions in range">
      <SessionsTable sessions={usePageQuery(sourceSessionsQuery(Route.useParams().ip, Route.useLoaderDeps().range))} />
    </Panel>
  )
}
