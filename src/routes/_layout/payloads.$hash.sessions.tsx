import { pageSsr } from '#/lib/pageSsr'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import { SessionsTable } from '#/components/EntityBlocks'
import { usePayloadPage } from '#/data/pageData'

const parent = getRouteApi('/_layout/payloads/$hash')

export const Route = createFileRoute('/_layout/payloads/$hash/sessions')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  return (
    <Panel title="Sessions that downloaded it">
      <SessionsTable sessions={usePayloadPage(parent.useParams().hash)?.delivery.sessions} />
    </Panel>
  )
}
