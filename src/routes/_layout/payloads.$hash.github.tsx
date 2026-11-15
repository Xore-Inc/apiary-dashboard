import { pageSsr } from '#/lib/pageSsr'
import { Text } from '@astryxdesign/core/Text'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { GithubResult } from '#/components/analyzers/GithubResult'
import { usePayloadPage } from '#/data/pageData'

const parent = getRouteApi('/_layout/payloads/$hash')

export const Route = createFileRoute('/_layout/payloads/$hash/github')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const g = usePayloadPage(parent.useParams().hash)?.github
    return g ? <GithubResult g={g} /> : <Text type="supporting">This sample has not been published to GitHub.</Text>
  }
