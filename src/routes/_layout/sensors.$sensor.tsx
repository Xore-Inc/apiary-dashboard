import { pageSsr } from '#/lib/pageSsr'
import { HStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { Outlet, createFileRoute, notFound, useLocation, useNavigate } from '@tanstack/react-router'
import { EntityFrame } from '#/components/EntityFrame'
import { EntityLink } from '#/components/EntityLink'
import { FilterSelect } from '#/components/FilterSelect'
import { entityTabs } from '#/components/ViewTabs'
import type { ViewTab } from '#/components/ViewTabs'
import { NotFound } from '#/components/NotFound'
import { loadSensorPage, useSensorPage } from '#/data/pageData'
import type { SensorStatus } from '#/data/types'
import { formatDateTime, formatNumber } from '#/lib/format'
import { sensorSubtitle } from '#/lib/sensorText'

export const Route = createFileRoute('/_layout/sensors/$sensor')({
  ssr: pageSsr,
  staticData: { viewTabs: entityTabs({ label: 'Sensor views', basePath: (params) => `/sensors/${encodeURIComponent(params.sensor)}`, tabs: tabsFor }) },
  loader: async ({ params, context }) => {
    const page = await loadSensorPage(context, params.sensor)
    if (!page) throw notFound()
    return page
  },
  notFoundComponent: () => <NotFound title="Sensor detail" description="No sensor has this name." />,
  component: SensorLayout,
  pendingComponent: SensorLayout,
})

const STATUS_VARIANT = { online: 'success', degraded: 'warning', offline: 'error' } as const satisfies Record<SensorStatus, string>

/** Jump to another sensor, staying on the same tab. */
function SensorPicker({ current, sensors }: { current: string; sensors: string[] }) {
  const navigate = useNavigate()
  const pathname = useLocation({ select: (location) => location.pathname })
  const tab = pathname.split('/').slice(3).join('/')
  return (
    <FilterSelect
      label="Sensor"
      isLabelHidden
      size="sm"
      width={200}
      mode="single"
      options={sensors.map((s) => ({ value: s }))}
      value={[current]}
      onChange={([value]) => value && void navigate({ href: `/sensors/${encodeURIComponent(value)}${tab ? `/${tab}` : ''}` })}
    />
  )
}

function SensorLayout() {
  const loaded = useSensorPage(Route.useParams().sensor)
  // The sensor's id is in the address: the title and the picker need no data.
  const { sensor: id } = Route.useParams()
  const detail = loaded?.detail
  const sensor = detail?.sensor

  return (
    <EntityFrame
      kind="Sensor"
      title={sensor?.name ?? id}
      description={sensor && sensorSubtitle(sensor)}
      basePath={`/sensors/${encodeURIComponent(id)}`}
      tokens={
        sensor && (
          <HStack gap={1.5} vAlign="center">
            <StatusDot variant={STATUS_VARIANT[sensor.status]} label={sensor.status} />
            <Text>{sensor.status}</Text>
          </HStack>
        )
      }
      actions={<SensorPicker current={id} sensors={loaded?.catalog.map((c) => c.sensor) ?? [id]} />}
      facts={[
        { label: `Events / ${(detail?.window ?? '24 h').replace(' ', '')}`, value: sensor && formatNumber(sensor.eventsLast24h) },
        { label: 'Unique sources', value: detail && formatNumber(detail.uniqueSources) },
        { label: 'First seen', value: detail && formatDateTime(detail.firstSeen) },
        { label: 'Last event', value: sensor && formatDateTime(sensor.lastSeen) },
        { label: 'Decoy', value: sensor && (sensor.persona ? <EntityLink kind="persona" id={sensor.persona.id}>{`${sensor.persona.id} · ${sensor.persona.organization}`}</EntityLink> : 'none') },
        { label: 'Listens on', value: sensor && (sensor.ports.length ? sensor.ports.map((p) => `${p.port}/${p.proto}`).join(', ') : 'no listener') },
      ]}
    >
      <Outlet />
    </EntityFrame>
  )
}

/** The top-bar tabs: static until the loader data arrives, then with counts. */
function tabsFor(loaded: unknown): ViewTab[] {
  if (!loaded) return [{ id: 'overview', label: 'Overview' }, { id: 'events', label: 'Captured' }, { id: 'sources', label: 'Sources' }, { id: 'leaderboards', label: 'Leaderboards' }, { id: 'health', label: 'Health' }, { id: 'exposure', label: 'Exposure' }]
  const data = loaded as ReturnType<typeof Route.useLoaderData>
  const { detail, feed, exposure } = data
  return [
    { id: 'overview', label: 'Overview' },
    { id: 'events', label: 'Captured' },
    { id: 'sources', label: 'Sources', count: detail?.topSources.length },
    { id: 'leaderboards', label: 'Leaderboards', count: detail?.topLists.length },
    { id: 'health', label: feed ? `Health · ${feed.state}` : 'Health' },
    { id: 'exposure', label: 'Exposure', count: exposure?.ports.length },
  ]
}
