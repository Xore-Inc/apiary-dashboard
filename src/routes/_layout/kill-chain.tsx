import { pageSsr } from '#/lib/pageSsr'
import { ActionLink } from '#/components/ActionLink'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { createFileRoute } from '@tanstack/react-router'
import { CampaignTimeline, CoverageHeatmap, FlowSankey } from '#/components/charts'
import { Panel } from '#/components/DashboardBlocks'
import { SkeletonBlock } from '#/components/EntityBlocks'
import { PageFrame } from '#/components/PageFrame'
import { ensure, usePageQuery } from '#/lib/query'
import { killChainQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/kill-chain')({
  ssr: pageSsr,
  loader: ({ context }) => ensure(context, killChainQuery()),
  component: KillChainPage,
  pendingComponent: KillChainPage,
})

function KillChainPage() {
  const data = usePageQuery(killChainQuery())
  return (
    <PageFrame
      title="Kill-chain analytics"
      description="How attackers progress through MITRE ATT&CK tactics. Behavior context only, never actor attribution."
      actions={
        <>
          <ActionLink href="/campaigns">Network campaigns</ActionLink>
          <ActionLink href="/attackers">Attacker identities</ActionLink>
        </>
      }
    >
      <VStack gap={6}>
        <Panel title="Kill-chain flow">
          <Text color="secondary">
            Each attacker session contributes one flow unit between every pair of tactics its traffic touched, in
            kill-chain order.
          </Text>
          {data ? <FlowSankey flow={data.flow} /> : <SkeletonBlock height={360} />}
        </Panel>
        <Panel title="Campaign timeline" action={<ActionLink href="/campaigns">All campaigns</ActionLink>}>
          <Text color="secondary">Current network campaigns, from first to last observed activity.</Text>
          {data ? <CampaignTimeline rows={data.timeline} /> : <SkeletonBlock height={240} />}
        </Panel>
        <Panel title="ATT&CK coverage">
          <Text color="secondary">
            Every technique this deployment has evidence for, grouped by tactic. Darker cells mean more observed
            events, not more severe activity.
          </Text>
          {data ? <CoverageHeatmap tactics={data.tactics} cells={data.coverage} /> : <SkeletonBlock height={420} />}
        </Panel>
      </VStack>
    </PageFrame>
  )
}
