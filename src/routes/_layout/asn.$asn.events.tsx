import { pageSsr } from '#/lib/pageSsr'
import { usePageQuery } from '#/lib/query'
import { asnQuery } from '#/data/resources'
import { RangeEvents } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'

const parent = getRouteApi('/_layout/asn/$asn')

export const Route = createFileRoute('/_layout/asn/$asn/events')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const a = usePageQuery(asnQuery(parent.useParams().asn))
    return <RangeEvents events={a?.group.events} />
  }
