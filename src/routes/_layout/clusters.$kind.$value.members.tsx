import { pageSsr } from '#/lib/pageSsr'
import { Panel } from '#/components/DashboardBlocks'
import { SourcesTable } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { usePageQuery } from '#/lib/query'
import { clusterQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/clusters/$kind/$value')

export const Route = createFileRoute('/_layout/clusters/$kind/$value/members')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const c = usePageQuery(clusterQuery(parent.useParams().kind, parent.useParams().value))
    return (
      <Panel title="Addresses that share it">
        <SourcesTable sources={c?.group.members} />
      </Panel>
    )
  }
