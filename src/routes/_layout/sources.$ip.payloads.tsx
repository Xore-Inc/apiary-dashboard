import { pageSsr } from '#/lib/pageSsr'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { MiniTable } from '#/components/DashboardBlocks'
import { usePageQuery } from '#/lib/query'
import { ipProfileQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/sources/$ip')

export const Route = createFileRoute('/_layout/sources/$ip/payloads')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  return <MiniTable title="Payloads delivered" header="SHA-256" rows={usePageQuery(ipProfileQuery(parent.useParams().ip))?.payloads} entity="payload" />
}
