import { pageSsr } from '#/lib/pageSsr'
import { SkeletonPanels } from '#/components/EntityBlocks'
import { orPending } from '#/lib/pending'
import { ActionLink } from '#/components/ActionLink'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { VStack } from '@astryxdesign/core/Stack'
import { Heading, Text } from '@astryxdesign/core/Text'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { ProtocolTimeline } from '#/components/charts'
import { CountTable, Panel } from '#/components/DashboardBlocks'
import { formatDateTime, formatNumber } from '#/lib/format'

const parent = getRouteApi('/_layout/sensors/$sensor')

export const Route = createFileRoute('/_layout/sensors/$sensor/')({ ssr: pageSsr, component: SensorOverview, pendingComponent: SensorOverview })

function SensorOverview() {
  const loaded = orPending(parent.useLoaderData())
  if (!loaded) return <SkeletonPanels count={2} />
  const detail = loaded.detail
  const { sensor } = detail
  return (
    <VStack gap={5}>
      <Panel title="What this sensor did">
        <Text color="secondary">{`${detail.reading.what}. The quantities this sensor exists to produce, not an event count, which says the same thing about every sensor.`}</Text>
        <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={3}>
          {detail.measures.map((m) => (
            <Card key={m.label} variant="muted">
              <VStack gap={1}>
                <Heading level={3}>{formatNumber(m.value)}</Heading>
                <Text type="label" color="secondary">
                  {m.label}
                </Text>
                <Text type="supporting">busiest source: {m.peak}</Text>
              </VStack>
            </Card>
          ))}
        </Grid>
      </Panel>
      <Panel title="Activity" action={<ActionLink href={`/events?sensor=${sensor.id}`}>All events</ActionLink>}>
        <Text type="supporting">{`Events per hour over the last ${detail.window ?? '24 h'}. First seen ${formatDateTime(detail.firstSeen)}.`}</Text>
        <ProtocolTimeline buckets={detail.timeline} />
      </Panel>
      <Panel title="Event types">
        <CountTable header="Type" rows={detail.byType} countHeader="Events" linkTo={(t) => `/events?sensor=${sensor.id}&kind=${t}`} />
      </Panel>
    </VStack>
  )
}
