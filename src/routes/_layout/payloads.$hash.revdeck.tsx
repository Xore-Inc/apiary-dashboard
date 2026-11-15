import { pageSsr } from '#/lib/pageSsr'
import { Text } from '@astryxdesign/core/Text'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { RevDeckResult } from '#/components/analyzers/RevDeckResult'
import { usePayloadPage } from '#/data/pageData'

const parent = getRouteApi('/_layout/payloads/$hash')

export const Route = createFileRoute('/_layout/payloads/$hash/revdeck')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const run = usePayloadPage(parent.useParams().hash)?.revdeck
    return run ? <RevDeckResult run={run} /> : <Text type="supporting">RevDeck has not analyzed this sample.</Text>
  }
