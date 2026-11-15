import { pageSsr } from '#/lib/pageSsr'
import { SkeletonPanels, SourcesTable } from '#/components/EntityBlocks'
import { VStack } from '@astryxdesign/core/Stack'
import { AttackerGraph } from '#/components/AttackerGraph'
import { Panel } from '#/components/DashboardBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { usePageQuery } from '#/lib/query'
import { identityQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/identities/$id')

export const Route = createFileRoute('/_layout/identities/$id/members')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const d = usePageQuery(identityQuery(parent.useParams().id))
    return (
      <VStack gap={4}>
        <Panel title="The identity and its addresses">
          {d ? <AttackerGraph id={d.identity.id} ips={d.identity.ips} membersHref="#member-addresses" /> : <SkeletonPanels count={1} lines={8} />}
        </Panel>
        <div id="member-addresses">
          <Panel title="Member addresses">
            <SourcesTable sources={d?.group.members} />
          </Panel>
        </div>
      </VStack>
    )
  }
