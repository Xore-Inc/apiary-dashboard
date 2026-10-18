import { Link } from '@astryxdesign/core/Link'
import { List, ListItem } from '@astryxdesign/core/List'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Panel } from '#/components/DashboardBlocks'
import type { AgentCampaign, CampaignEvent, MatchedRule } from '#/data/types'
import { formatDateTime, formatNumber, formatTime } from '#/lib/format'

/** `encoded-egress-external` → `Encoded egress external`. */
export function categoryLabel(category: string): string {
  const words = category.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Where the raw sensor document lives: event ids are only unique within
 * their own index, so both are pinned in the history query. Events stored
 * before the index was recorded carry '' and fall back to the id alone. */
export function sourceHref(event: CampaignEvent): string {
  const byId = `_id:"${event.eventId}"`
  return `/history?q=${encodeURIComponent(event.sourceIndex ? `${byId} AND _index:"${event.sourceIndex}"` : byId)}`
}

export function RuleDescription({ rule }: { rule: MatchedRule }) {
  const finalHash = rule.decodeChain.at(-1)?.outputSha256
  return (
    <VStack gap={0.5}>
      <Text type="supporting">
        {rule.trustBoundary} · {rule.reason}
      </Text>
      {finalHash && (
        <Text type="supporting">
          {rule.decodeChain.map((step) => step.transform).join(' → ')} · sha256:
          {finalHash.slice(0, 16)}…
        </Text>
      )}
    </VStack>
  )
}

/** When, how much, and which identifiers tie the campaign together. */
export function AgentCampaignFacts({ campaign }: { campaign: AgentCampaign }) {
  return (
    <Panel title="What was detected">
      <MetadataList label={{ position: 'start', width: 104 }}>
        <MetadataListItem label="Window">{`${formatDateTime(campaign.start)} → ${formatTime(campaign.end)}`}</MetadataListItem>
        <MetadataListItem label="Events">
          {formatNumber(campaign.eventCount)}
        </MetadataListItem>
        <MetadataListItem label="Categories">
          {campaign.categories.map(categoryLabel).join(', ')}
        </MetadataListItem>
        <MetadataListItem label="Identifiers">
          <VStack gap={0.5}>
            {campaign.identifiers.map((identifier) => (
              <Text key={identifier} type="code">
                {identifier}
              </Text>
            ))}
          </VStack>
        </MetadataListItem>
      </MetadataList>
    </Panel>
  )
}

/** Every correlated event, with the rules each one matched. */
export function AgentCampaignEvidence({
  campaign,
}: {
  campaign: AgentCampaign
}) {
  return (
    <Panel title="Evidence timeline">
      <List density="compact" hasDividers>
        {campaign.events.flatMap((event) => {
          const source = <Link href={sourceHref(event)}>source</Link>
          if (event.matchedRules.length === 0) {
            return [
              <ListItem
                key={event.eventId}
                label={formatTime(event.timestamp)}
                description="Correlated into this campaign; no rule matched on its own."
                endContent={source}
              />,
            ]
          }
          return event.matchedRules.map((rule) => (
            <ListItem
              key={`${event.eventId}-${rule.rule}`}
              label={`${formatTime(event.timestamp)} · ${rule.rule}`}
              description={<RuleDescription rule={rule} />}
              endContent={source}
            />
          ))
        })}
      </List>
      {campaign.eventCount > campaign.events.length && (
        <Text type="supporting">
          Showing {campaign.events.length} of{' '}
          {formatNumber(campaign.eventCount)} events.
        </Text>
      )}
    </Panel>
  )
}

/** Each matched rule once, with its full decode chain. */
export function AgentCampaignRules({ campaign }: { campaign: AgentCampaign }) {
  const rules = new Map<string, MatchedRule>()
  for (const event of campaign.events)
    for (const rule of event.matchedRules) rules.set(rule.rule, rule)
  if (rules.size === 0)
    return (
      <Text type="supporting">
        No rule matched on its own; the events were correlated by identifier.
      </Text>
    )
  return (
    <VStack gap={4}>
      {[...rules.values()].map((rule) => (
        <Panel key={rule.rule} title={rule.rule}>
          <Text color="secondary">{`${rule.trustBoundary} · ${rule.reason}`}</Text>
          {rule.decodeChain.length > 0 ? (
            <List density="compact" hasDividers>
              {rule.decodeChain.map((step, i) => (
                <ListItem
                  key={`${step.transform}-${i}`}
                  label={`${i + 1}. ${step.transform}`}
                  description={
                    <Text type="code" maxLines={2} wordBreak="break-all">{`sha256:${step.outputSha256}`}</Text>
                  }
                />
              ))}
            </List>
          ) : (
            <Text type="supporting">
              Matched on the raw input; nothing was decoded.
            </Text>
          )}
        </Panel>
      ))}
    </VStack>
  )
}
