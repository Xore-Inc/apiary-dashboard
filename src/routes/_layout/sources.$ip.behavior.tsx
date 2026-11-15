import { pageSsr } from '#/lib/pageSsr'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { TechniquesPanel } from '#/components/DetailBlocks'
import { usePageQuery } from '#/lib/query'
import { ipProfileQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/sources/$ip')

export const Route = createFileRoute('/_layout/sources/$ip/behavior')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  return (
    <VStack gap={2}>
      <TechniquesPanel techniques={usePageQuery(ipProfileQuery(parent.useParams().ip))?.techniques} />
      <Text type="supporting">Behavior context only, never actor attribution.</Text>
    </VStack>
  )
}
