import { pageSsr } from '#/lib/pageSsr'
import { SkeletonPanels } from '#/components/EntityBlocks'
import { ActionLink } from '#/components/ActionLink'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import type { FeedState } from '#/data/types'
import { formatDateTime, formatNumber } from '#/lib/format'
import { useSensorPage } from '#/data/pageData'

const parent = getRouteApi('/_layout/sensors/$sensor')

export const Route = createFileRoute('/_layout/sensors/$sensor/health')({ ssr: pageSsr, component: SensorHealth, pendingComponent: SensorHealth })

const FEED_COLOR = { fresh: 'green', delayed: 'orange', stale: 'orange', silent: 'red' } as const satisfies Record<FeedState, string>

function SensorHealth() {
  const loaded = useSensorPage(parent.useParams().sensor)
  if (!loaded) return <SkeletonPanels count={2} />
  const detail = loaded.detail
  const feed = loaded.feed
  return (
    <Panel title="Is its data arriving" action={<ActionLink href="/source-health">Source & pipeline health</ActionLink>}>
      {feed ? (
        <MetadataList label={{ position: 'start', width: 144 }}>
          <MetadataListItem label="Feed">
            <Token size="sm" color={FEED_COLOR[feed.state]} label={feed.state} />
          </MetadataListItem>
          <MetadataListItem label="Indexed documents">{formatNumber(feed.documents)}</MetadataListItem>
          <MetadataListItem label="Last document">{formatDateTime(feed.lastSeen)}</MetadataListItem>
          <MetadataListItem label="Sensor status">{detail.sensor.status}</MetadataListItem>
          <MetadataListItem label="Last event">{formatDateTime(detail.sensor.lastSeen)}</MetadataListItem>
        </MetadataList>
      ) : (
        <Text type="supporting">This sensor has no ingest feed of its own.</Text>
      )}
    </Panel>
  )
}
