import { pageSsr } from '#/lib/pageSsr'
import { ActionLink } from '#/components/ActionLink'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import { useSensorPage } from '#/data/pageData'

const parent = getRouteApi('/_layout/sensors/$sensor')

export const Route = createFileRoute('/_layout/sensors/$sensor/exposure')({ ssr: pageSsr, component: SensorExposure, pendingComponent: SensorExposure })

/** How the internet reaches this sensor: ingress path, names, and ports. */
function SensorExposure() {
  const loaded = useSensorPage(parent.useParams().sensor)
  const exposure = loaded?.exposure
  if (!exposure) return <Text type="supporting">This sensor is not in the fleet topology.</Text>
  return (
    <VStack gap={4}>
      <Panel title="How it is reached" action={<ActionLink href="/topology">Fleet topology</ActionLink>}>
        <MetadataList label={{ position: 'start', width: 112 }}>
          <MetadataListItem label="Ingress">
            <HStack gap={1}>
              {exposure.ingress.map((i) => (
                <Token key={i} size="sm" label={i} />
              ))}
            </HStack>
          </MetadataListItem>
          <MetadataListItem label="Hostnames">{exposure.hostnames.length ? exposure.hostnames.join(', ') : '—'}</MetadataListItem>
          <MetadataListItem label="Raw index">
            <Text type="code">{exposure.rawIndex}</Text>
          </MetadataListItem>
        </MetadataList>
      </Panel>
      <Panel title="Published ports">
        <Table
          data={exposure.ports.map((p) => ({ ...p, id: `${p.proto}-${p.public}` }))}
          columns={[
            { key: 'proto', header: 'Proto', width: pixel(72) },
            { key: 'public', header: 'Public port', width: pixel(112), align: 'end' },
            { key: 'host', header: 'Host port', width: pixel(112), align: 'end' },
          ]}
          idKey="id"
          density="compact"
        />
      </Panel>
    </VStack>
  )
}
