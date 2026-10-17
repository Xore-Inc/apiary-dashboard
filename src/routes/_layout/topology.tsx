import { pageSsr } from '#/lib/pageSsr'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Heading, Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute } from '@tanstack/react-router'
import { FlowSankey } from '#/components/charts'
import { Panel } from '#/components/DashboardBlocks'
import { ContainerStateLabel, FeedStateLabel } from '#/components/FeedState'
import { PageFrame } from '#/components/PageFrame'
import { SkeletonBlock, SkeletonPanels } from '#/components/EntityBlocks'
import { SkeletonTable } from '#/components/SkeletonTable'
import { orPending } from '#/lib/pending'
import { Pending } from '#/components/Pending'
import { getTopology } from '#/data/queries'
import type { TopologySensor } from '#/data/types'
import { EntityLink } from '#/components/EntityLink'

export const Route = createFileRoute('/_layout/topology')({
  ssr: pageSsr,
  loader: () => getTopology(),
  component: TopologyPage,
  pendingComponent: TopologyPage,
})

const INGRESS_COLOR = { portbridge: 'blue', traefik: 'purple', 'tunnel-only': 'orange', direct: 'gray', proxy: 'teal' } as const
/** Labels for the ingress kinds whose wire name reads badly as a badge. */
const INGRESS_LABEL: Partial<Record<TopologySensor['ingress'][number], string>> = { proxy: '+PROXY', 'tunnel-only': 'tunnel only' }

const exposureColumns: TableColumn<TopologySensor>[] = [
  { key: 'sensor', header: 'Sensor', width: pixel(160), renderCell: (row) => <EntityLink kind="sensor" id={row.sensor} /> },
  {
    key: 'ingress',
    header: 'Ingress',
    width: proportional(2),
    renderCell: (row) => (
      <VStack gap={1}>
        <HStack gap={1}>
          {row.ingress.map((kind) => (
            <Token key={kind} size="sm" color={INGRESS_COLOR[kind]} label={INGRESS_LABEL[kind] ?? kind} />
          ))}
        </HStack>
        {row.hostnames.length > 0 && <Text type="supporting">{row.hostnames.join(' · ')}</Text>}
      </VStack>
    ),
  },
  {
    key: 'ports',
    header: 'Ports (public → host)',
    width: proportional(2),
    renderCell: (row) =>
      row.ports.length === 0 ? (
        <Text type="supporting">hostname only</Text>
      ) : (
        <HStack gap={1} wrap="wrap">
          {row.ports.map((port) => (
            <Token key={`${port.proto}-${port.public}`} size="sm" label={`${port.public} → ${port.host}/${port.proto}`} />
          ))}
        </HStack>
      ),
  },
  { key: 'rawIndex', header: 'Raw index', width: pixel(168), renderCell: (row) => <Text type="code">{row.rawIndex}</Text> },
  { key: 'feed', header: 'Feed', width: pixel(112), renderCell: (row) => <FeedStateLabel state={row.feed} /> },
]

function TopologyPage() {
  const topology = orPending(Route.useLoaderData())
  const containers = topology?.stacks.reduce((sum, s) => sum + s.containers.length, 0)

  return (
    <PageFrame
      title="Fleet topology"
      description="What exposes what, where a byte flows, and which stack owns which container."
      actions={
        <HStack gap={1.5}>
          <Pending width={220}>
            {topology && (
              <>
                <Token size="sm" label={`${topology.sensors.length} sensors`} />
                <Token size="sm" label={`${topology.stacks.length} stacks`} />
                <Token size="sm" label={`${containers} containers`} />
              </>
            )}
          </Pending>
        </HStack>
      }
    >
      <VStack gap={6}>
        <Panel title="How a byte flows">
          <Text color="secondary">Ingress path → sensor → Filebeat → raw index → worker → derived index → the dashboard.</Text>
          {topology ? <FlowSankey flow={topology.flow} height={480} /> : <SkeletonBlock height={480} />}
          <Text type="supporting">
            Every public path crosses the VPS: if it restarts, new attack traffic stops reaching every decoy at once, while
            already-captured logs keep indexing from disk.
          </Text>
        </Panel>

        <Panel title="Exposure">
          <Text color="secondary">Per sensor: the ports an attacker can reach, the path they arrive by, and whether the sensor is still feeding.</Text>
          {topology ? <Table data={topology.sensors} columns={exposureColumns} idKey="sensor" density="compact" /> : <SkeletonTable columns={exposureColumns} rows={10} density="compact" />}
          <Text type="supporting">+PROXY means the upstream sends PROXY protocol v1, so the sensor sees the real client address.</Text>
        </Panel>

        <VStack gap={3}>
          <Heading level={2}>Runtime containers</Heading>
          {!topology && <SkeletonPanels count={4} lines={4} />}
          <Grid columns={{ minWidth: 280, repeat: 'fit' }} gap={4}>
            {topology?.stacks.map((stack) => (
              <Panel key={stack.stack} title={stack.stack}>
                <VStack gap={1.5}>
                  {stack.containers.map((container) => (
                    <ContainerStateLabel key={container.name} name={container.name} state={container.state} exitCode={container.exitCode} />
                  ))}
                </VStack>
              </Panel>
            ))}
          </Grid>
        </VStack>
      </VStack>
    </PageFrame>
  )
}
