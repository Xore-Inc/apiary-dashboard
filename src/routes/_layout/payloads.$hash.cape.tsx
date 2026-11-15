import { pageSsr } from '#/lib/pageSsr'
import { Text } from '@astryxdesign/core/Text'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { CapeResult } from '#/components/analyzers/CapeResult'
import { usePayloadPage } from '#/data/pageData'

const parent = getRouteApi('/_layout/payloads/$hash')

export const Route = createFileRoute('/_layout/payloads/$hash/cape')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const run = usePayloadPage(parent.useParams().hash)?.cape
    return run ? <CapeResult run={run} /> : <Text type="supporting">CAPE has not detonated this sample.</Text>
  }
