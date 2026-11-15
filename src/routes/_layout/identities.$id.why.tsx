import { pageSsr } from '#/lib/pageSsr'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { FusionRadar } from '#/components/charts'
import { Panel } from '#/components/DashboardBlocks'
import { SharedSignalsTable } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { ensure, usePageQuery } from '#/lib/query'
import { identityFusionQuery, identityQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/identities/$id')

export const Route = createFileRoute('/_layout/identities/$id/why')({
  ssr: pageSsr,
  loader: ({ params, context }) => ensure(context, identityFusionQuery(params.id)),
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const d = usePageQuery(identityQuery(parent.useParams().id))
    const fusion = usePageQuery(identityFusionQuery(parent.useParams().id))
    return (
      <VStack gap={4}>
        <Panel title="Fingerprint fusion: why these addresses merged">
          <Text type="supporting">Per fingerprint family, how many distinct values two or more member addresses share. A family no sensor produced here stays at zero.</Text>
          {fusion && <FusionRadar categories={fusion.categories} values={fusion.values} />}
        </Panel>
        <Panel title="Signals that joined these addresses">
          <SharedSignalsTable signals={d?.shared} />
        </Panel>
      </VStack>
    )
  }
