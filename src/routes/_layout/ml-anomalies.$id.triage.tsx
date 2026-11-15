import { pageSsr } from '#/lib/pageSsr'
import { SkeletonPanels } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { AnomalyTriage } from '#/components/details/Anomaly'
import { usePageQuery } from '#/lib/query'
import { anomalyQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/ml-anomalies/$id')

export const Route = createFileRoute('/_layout/ml-anomalies/$id/triage')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  const rec = usePageQuery(anomalyQuery(parent.useParams().id))?.anomaly
  return rec ? <AnomalyTriage anomaly={rec} /> : <SkeletonPanels />
}
