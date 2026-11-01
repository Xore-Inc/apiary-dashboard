import { pageSsr } from '#/lib/pageSsr'
import { refreshWhenSettled } from '#/lib/refreshWhenSettled'
import { Banner } from '@astryxdesign/core/Banner'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Link } from '@astryxdesign/core/Link'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Heading, Text } from '@astryxdesign/core/Text'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Panel, StatTile } from '#/components/DashboardBlocks'
import { FeedStateLabel } from '#/components/FeedState'
import { PageFrame } from '#/components/PageFrame'
import { Pending } from '#/components/Pending'
import { SkeletonTable } from '#/components/SkeletonTable'
import { orPending } from '#/lib/pending'
import { getSourceHealth } from '#/data/queries'
import type { SensorFeed, SourceHealth } from '#/data/types'
import { formatDateTime, formatNumber } from '#/lib/format'
import { EntityLink } from '#/components/EntityLink'
import { useCallback, useEffect } from 'react'
import { HEALTH_CHANGED } from '#/data/incidents'
import { useLiveInterval } from '#/lib/live'
import { usePreferences } from '#/lib/prefs'
import { healthTabs } from '#/lib/navFamilies'

export const Route = createFileRoute('/_layout/source-health')({
  ssr: pageSsr,
  staticData: { viewTabs: healthTabs },
  loader: () => getSourceHealth(),
  component: SourceHealthPage,
  pendingComponent: SourceHealthPage,
})

function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86_400)
  const h = Math.floor((seconds % 86_400) / 3_600)
  const m = Math.floor((seconds % 3_600) / 60)
  const s = seconds % 60
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, !d && !h && `${s}s`].filter(Boolean).join(' ')
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`
}

const CLUSTER = { green: 'success', yellow: 'warning', red: 'error' } as const satisfies Record<SourceHealth['clusterStatus'], string>
const PIPELINE = { running: 'success', degraded: 'warning', stopped: 'error' } as const satisfies Record<SourceHealth['pipeline']['state'], string>

const feedColumns: TableColumn<SensorFeed>[] = [
  { key: 'sensor', header: 'Sensor', width: proportional(2), renderCell: (row) => <EntityLink kind="sensor" id={row.sensor} /> },
  { key: 'state', header: 'State', width: pixel(128), renderCell: (row) => <FeedStateLabel state={row.state} /> },
  { key: 'documents', header: 'Documents', width: pixel(112), align: 'end', renderCell: (row) => formatNumber(row.documents) },
  { key: 'lastSeen', header: 'Last event', width: pixel(200), renderCell: (row) => formatDateTime(row.lastSeen) },
]

function SourceHealthPage() {
  const health = orPending(Route.useLoaderData())
  const router = useRouter()
  // Health moves in minutes: re-read it on the live interval, and at once
  // when a simulated incident changes it.
  const refresh = useCallback(() => refreshWhenSettled(router), [router])
  useLiveInterval(refresh, (usePreferences()?.refreshSeconds ?? 30) * 1000)
  useEffect(() => {
    window.addEventListener(HEALTH_CHANGED, refresh)
    return () => window.removeEventListener(HEALTH_CHANGED, refresh)
  }, [refresh])
  const { ingest, yara, runtime, pipeline } = health ?? {}
  const unhealthy = health?.feeds.filter((f) => f.state !== 'fresh').length

  return (
    <PageFrame
      title="Source & pipeline health"
      description="Is every sensor still feeding the pipeline? Freshness per source, ordered by most recent event."
    >
      <VStack gap={6}>
        <Grid columns={{ minWidth: 200, repeat: 'fit' }} gap={4}>
          <StatTile label="Configured feeds" value={health?.feeds.length} caption={unhealthy === undefined ? '' : unhealthy ? `${unhealthy} not fresh` : 'all fresh'} />
          <StatTile label="Indexed documents" value={health?.indexedDocuments} href="/history" />
          <Panel title="Filebeat">
            <HStack gap={2} vAlign="center">
              <Pending>
                {pipeline && (
                  <>
                    <StatusDot variant={PIPELINE[pipeline.state]} label={pipeline.state} />
                    <Text weight="semibold">{pipeline.state}</Text>
                  </>
                )}
              </Pending>
            </HStack>
          </Panel>
          <StatTile label="Dead letters, 24h" value={health?.deadLetters} href="/dead-letters" />
        </Grid>
        {/* Only when there is a discrepancy to explain. */}
        {health && health.unattributed24h > 0 && (
          <Banner
            status="info"
            title={`${formatNumber(health.unattributed24h)} ${health.unattributed24h === 1 ? 'event' : 'events'} in the last 24 hours with no source address`}
            description="They arrived over the WireGuard tunnel with no recoverable client address, so they count in every total above but belong to no source IP: the tunnel peer is our own VPS, not an attacker. The per-sensor counts below will not add up to the totals. Sensors reached over UDP, or on ports without a PROXY-protocol rule, have no way back to the real address."
          />
        )}

        <VStack gap={3}>
          <Heading level={2}>Ingestion pipeline</Heading>
          <Grid columns={{ minWidth: 300, repeat: 'fit' }} gap={4}>
            <Panel title="Ingestion freshness">
              <MetadataList label={{ position: 'start', width: 152 }}>
                <MetadataListItem label="State">
                  <Pending>{ingest && <FeedStateLabel state={ingest.state} />}</Pending>
                </MetadataListItem>
                <MetadataListItem label="Latest indexed event"><Pending>{ingest && formatDateTime(ingest.lastIngest)}</Pending></MetadataListItem>
                <MetadataListItem label="Ingestion age"><Pending>{ingest && formatDuration(ingest.ageSeconds)}</Pending></MetadataListItem>
                <MetadataListItem label="Dead letters, 24h">
                  <Pending>{ingest && <Link href="/dead-letters">{formatNumber(ingest.recentDeadLetters)}</Link>}</Pending>
                </MetadataListItem>
              </MetadataList>
              <Text type="supporting">Delayed means the newest event is over two minutes old; stale means over fifteen.</Text>
            </Panel>
            <Panel title="Pipeline status">
              <MetadataList label={{ position: 'start', width: 152 }}>
                <MetadataListItem label="Filebeat"><Pending>{pipeline?.state}</Pending></MetadataListItem>
                <MetadataListItem label="Acknowledged"><Pending>{pipeline && formatNumber(pipeline.acked)}</Pending></MetadataListItem>
                <MetadataListItem label="Failed / dropped / active">
                  <Pending>{pipeline && `${formatNumber(pipeline.failed)} / ${formatNumber(pipeline.dropped)} / ${formatNumber(pipeline.active)}`}</Pending>
                </MetadataListItem>
                <MetadataListItem label="Decode failures"><Pending>{pipeline && formatNumber(pipeline.decodeFailures)}</Pending></MetadataListItem>
              </MetadataList>
            </Panel>
          </Grid>
        </VStack>

        <VStack gap={3}>
          <Heading level={2}>Platform services</Heading>
          <Grid columns={{ minWidth: 300, repeat: 'fit' }} gap={4}>
            <Panel title="YARA scanner">
              <MetadataList label={{ position: 'start', width: 136 }}>
                <MetadataListItem label="Enabled"><Pending>{yara && (yara.enabled ? 'yes' : 'no')}</Pending></MetadataListItem>
                <MetadataListItem label="Last scan"><Pending>{yara && formatDateTime(yara.lastScan)}</Pending></MetadataListItem>
                <MetadataListItem label="Rules SHA-256">
                  <Pending>{yara && <Text type="code">{`${yara.rulesSha256.slice(0, 16)}…`}</Text>}</Pending>
                </MetadataListItem>
                <MetadataListItem label="Samples scanned"><Pending>{yara && formatNumber(yara.samples)}</Pending></MetadataListItem>
                <MetadataListItem label="Samples matched"><Pending>{yara && formatNumber(yara.matched)}</Pending></MetadataListItem>
                <MetadataListItem label="Errors"><Pending>{yara && formatNumber(yara.errors)}</Pending></MetadataListItem>
              </MetadataList>
            </Panel>
            <Panel title="Backend runtime">
              <MetadataList label={{ position: 'start', width: 136 }}>
                <MetadataListItem label="Uptime"><Pending>{runtime && formatDuration(runtime.uptimeSeconds)}</Pending></MetadataListItem>
                <MetadataListItem label="Resident memory"><Pending>{runtime && formatBytes(runtime.rssBytes)}</Pending></MetadataListItem>
                <MetadataListItem label="Virtual memory"><Pending>{runtime && formatBytes(runtime.vmBytes)}</Pending></MetadataListItem>
                <MetadataListItem label="Elasticsearch">
                  <Pending>
                    {health && (
                      <HStack gap={1.5} vAlign="center">
                        <StatusDot variant={CLUSTER[health.clusterStatus]} label={health.clusterStatus} />
                        <Text>{health.clusterStatus}</Text>
                      </HStack>
                    )}
                  </Pending>
                </MetadataListItem>
              </MetadataList>
            </Panel>
          </Grid>
        </VStack>

        <Panel title="Per-sensor feeds">
          {health ? <Table data={health.feeds} columns={feedColumns} idKey="sensor" density="compact" /> : <SkeletonTable columns={feedColumns} rows={12} density="compact" />}
        </Panel>
      </VStack>
    </PageFrame>
  )
}
