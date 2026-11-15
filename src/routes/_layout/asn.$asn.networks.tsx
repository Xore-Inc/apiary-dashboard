import { pageSsr } from '#/lib/pageSsr'
import { usePageQuery } from '#/lib/query'
import { asnQuery } from '#/data/resources'
import { MiniTable } from '#/components/DashboardBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'

const parent = getRouteApi('/_layout/asn/$asn')

export const Route = createFileRoute('/_layout/asn/$asn/networks')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const a = usePageQuery(asnQuery(parent.useParams().asn))
    return <MiniTable title="Networks (/26) by events" header="Prefix" rows={a?.group.networks} entity="network" />
  }
