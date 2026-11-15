import { pageSsr } from '#/lib/pageSsr'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { MiniTable } from '#/components/DashboardBlocks'
import { usePageQuery } from '#/lib/query'
import { iocQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/ioc/$kind/$value')

export const Route = createFileRoute('/_layout/ioc/$kind/$value/payloads')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  return <MiniTable title="Payloads downloaded in the same sessions" header="SHA-256" rows={usePageQuery(iocQuery(parent.useParams().kind, parent.useParams().value))?.payloads} entity="payload" />
}
