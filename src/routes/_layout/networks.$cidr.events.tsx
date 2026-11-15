import { pageSsr } from '#/lib/pageSsr'
import { ActionLink } from '#/components/ActionLink'
import { RangeEvents } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { usePageQuery } from '#/lib/query'
import { networkQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/networks/$cidr')

export const Route = createFileRoute('/_layout/networks/$cidr/events')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const n = usePageQuery(networkQuery(parent.useParams().cidr))
    const { cidr } = parent.useParams()
    return <RangeEvents events={n?.group.events} action={<ActionLink href={`/events?q=${encodeURIComponent(cidr)}`}>Event explorer</ActionLink>} />
  }
