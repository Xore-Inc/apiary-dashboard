import { ActionLink } from '#/components/ActionLink'
import { Button } from '@astryxdesign/core/Button'
import { List, ListItem } from '@astryxdesign/core/List'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { HStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { Panel } from '#/components/DashboardBlocks'
import { acknowledgeAlertsWrite } from '#/data/writes'
import { useDataMutation } from '#/lib/mutation'
import type { AlertGroup } from '#/data/types'
import { formatDateTime, formatNumber } from '#/lib/format'
import { useGuardedAction } from '#/lib/useGuardedAction'
import { FieldStatus } from '@astryxdesign/core/FieldStatus'

export function AckButton({ group }: { group: AlertGroup }) {
  // Shown at once (the lists, the detail and the bell), rolled back if the
  // backend refuses (lib/mutation.ts).
  const acknowledge = useDataMutation(acknowledgeAlertsWrite())
  const { error, guard } = useGuardedAction()
  const keys = group.members.map((m) => m.key)
  const button = (
    <Button
      label={
        group.acknowledged
          ? 'Reopen'
          : group.members.length > 1
            ? `Acknowledge ${group.members.length}`
            : 'Acknowledge'
      }
      size="sm"
      variant="secondary"
      isLoading={acknowledge.isPending}
      onClick={() => void guard(() => acknowledge.mutateAsync({ keys, acknowledged: !group.acknowledged }))}
    />
  )
  return error ? (
    <HStack gap={2} vAlign="center">
      {button}
      <FieldStatus type="error" variant="detached" message={error} />
    </HStack>
  ) : (
    button
  )
}

/** What fired, how often, and the way to the events behind it. */
export function AlertOverview({ group }: { group: AlertGroup }) {
  const link = group.members.find((m) => m.link)?.link
  return (
    <Panel title="What fired">
      <Text>{group.message}</Text>
      <MetadataList label={{ position: 'start', width: 96 }}>
        <MetadataListItem label="Observed">
          {formatNumber(group.count)}
        </MetadataListItem>
        <MetadataListItem label="First seen">
          {formatDateTime(group.firstSeen)}
        </MetadataListItem>
        <MetadataListItem label="Last seen">
          {formatDateTime(group.lastSeen)}
        </MetadataListItem>
        {group.members[0].lastNotified && (
          <MetadataListItem label="Notified">
            {formatDateTime(group.members[0].lastNotified)}
          </MetadataListItem>
        )}
      </MetadataList>
      {link && <ActionLink href={link}>Show the events behind this alert</ActionLink>}
    </Panel>
  )
}

/** Every alert record folded into this group. */
export function AlertMembers({ group }: { group: AlertGroup }) {
  return (
    <Panel title={`Members (${group.members.length})`}>
      <List density="compact" hasDividers>
        {group.members.map((member) => (
          <ListItem
            key={member.key}
            label={
              <Text type="code" maxLines={1}>
                {member.message.match(/\b[0-9a-f]{16,}\b/i)?.[0] ?? member.key}
              </Text>
            }
            description={`${formatDateTime(member.firstSeen)} → ${formatDateTime(member.lastSeen)}`}
            endContent={
              <HStack gap={2} vAlign="center">
                <Token
                  size="sm"
                  label={member.acknowledged ? 'acknowledged' : 'new'}
                  color={member.acknowledged ? 'gray' : 'orange'}
                />
                <Text type="supporting">{formatNumber(member.count)}</Text>
              </HStack>
            }
          />
        ))}
      </List>
    </Panel>
  )
}
