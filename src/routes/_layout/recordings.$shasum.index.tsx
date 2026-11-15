import { pageSsr } from '#/lib/pageSsr'
import { SkeletonPanels } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { Player } from '#/components/details/Recording'
import { usePageQuery } from '#/lib/query'
import { replayDetailQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/recordings/$shasum')

export const Route = createFileRoute('/_layout/recordings/$shasum/')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  const rec = usePageQuery(replayDetailQuery(parent.useParams().shasum))?.replay
  return rec ? <Player replay={rec} /> : <SkeletonPanels />
}
