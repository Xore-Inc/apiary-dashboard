import { pageSsr } from '#/lib/pageSsr'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { MiniTable } from '#/components/DashboardBlocks'
import { EventsPanel } from '#/components/DetailBlocks'
import { VStack } from '@astryxdesign/core/Stack'
import { usePayloadPage } from '#/data/pageData'

const parent = getRouteApi('/_layout/payloads/$hash')

export const Route = createFileRoute('/_layout/payloads/$hash/delivered-by')({ ssr: pageSsr, component: PayloadDelivery, pendingComponent: PayloadDelivery })

function PayloadDelivery() {
  const loaded = usePayloadPage(parent.useParams().hash)
  const delivery = loaded?.delivery
  return (
    <VStack gap={4}>
      <MiniTable title="Addresses that fetched it" header="Source IP" rows={delivery?.sources} entity="source" />
      <EventsPanel title="Download events" events={delivery?.events} showSource empty="No download event references this hash; it was captured another way." />
    </VStack>
  )
}
