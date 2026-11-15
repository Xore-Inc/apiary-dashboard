import { pageSsr } from '#/lib/pageSsr'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { MiniTable, Panel, StatTile } from '#/components/DashboardBlocks'
import { EntityLink } from '#/components/EntityLink'
import { usePageQuery } from '#/lib/query'
import { replayDetailQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/recordings/$shasum')

export const Route = createFileRoute('/_layout/recordings/$shasum/attacker')({
  ssr: pageSsr,
  component: RecordingAttacker,
  pendingComponent: RecordingAttacker,
})

/** Everything else the address behind this recording did. */
function RecordingAttacker() {
  const loaded = usePageQuery(replayDetailQuery(parent.useParams().shasum))
  const attacker = loaded?.attacker
  if (!attacker)
    return (
      <Panel title="Attacker">
        <Text color="secondary">
          This recording is unattributed: every session that produced it arrived
          over the tunnel without a real client address.
        </Text>
      </Panel>
    )
  return (
    <VStack gap={4}>
      <HStack gap={3} vAlign="center">
        <Text weight="semibold">Source</Text>
        <EntityLink kind="source" id={attacker.ip} />
      </HStack>
      <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={4}>
        <StatTile
          label="Events"
          value={attacker.events}
          href={`/sources/${attacker.ip}/events`}
        />
        <StatTile
          label="Sessions"
          value={attacker.sessions}
          href={`/sources/${attacker.ip}/sessions`}
        />
        <StatTile label="Distinct commands" value={attacker.commands.length} />
      </Grid>
      <Grid columns={{ minWidth: 300, repeat: 'fit' }} gap={4}>
        <MiniTable
          title="Commands"
          header="Command"
          rows={attacker.commands}
          entity="command"
        />
        <MiniTable
          title="Credentials tried"
          header="Pair"
          rows={attacker.credentials}
          entity="credential"
        />
        <MiniTable
          title="Sensors"
          header="Sensor"
          rows={attacker.sensors}
          entity="sensor"
        />
        <MiniTable
          title="Sessions"
          header="Session"
          rows={attacker.sessionIds}
          entity="session"
        />
      </Grid>
    </VStack>
  )
}
