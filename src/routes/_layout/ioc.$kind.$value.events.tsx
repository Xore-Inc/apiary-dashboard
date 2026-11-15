import { pageSsr } from '#/lib/pageSsr'
import { RangeEvents, SkeletonPanels } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { usePageQuery } from '#/lib/query'
import { iocQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/ioc/$kind/$value')

export const Route = createFileRoute('/_layout/ioc/$kind/$value/events')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  const rec = usePageQuery(iocQuery(parent.useParams().kind, parent.useParams().value))?.events
  return rec ? <RangeEvents events={rec} /> : <SkeletonPanels />
}
