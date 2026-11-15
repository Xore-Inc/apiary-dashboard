import { pageSsr } from '#/lib/pageSsr'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import { SessionsTable } from '#/components/EntityBlocks'
import { usePageQuery } from '#/lib/query'
import { iocQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/ioc/$kind/$value')

export const Route = createFileRoute('/_layout/ioc/$kind/$value/sessions')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  return (
    <Panel title="Sessions it appeared in">
      <SessionsTable sessions={usePageQuery(iocQuery(parent.useParams().kind, parent.useParams().value))?.sessions} />
    </Panel>
  )
}
