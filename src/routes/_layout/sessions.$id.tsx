import { pageSsr } from '#/lib/pageSsr'
import { Token } from '@astryxdesign/core/Token'
import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { EntityFrame } from '#/components/EntityFrame'
import { entityTabs } from '#/components/ViewTabs'
import type { ViewTab } from '#/components/ViewTabs'
import { EntityLink } from '#/components/EntityLink'
import { NotFound } from '#/components/NotFound'
import { formatDateTime, formatNumber } from '#/lib/format'
import { ensure, usePageQuery } from '#/lib/query'
import { sessionDetailQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/sessions/$id')({
  ssr: pageSsr,
  staticData: { viewTabs: entityTabs({ label: 'Session views', basePath: (params) => `/sessions/${encodeURIComponent(params.id)}`, tabs: tabsFor }) },
  loader: async ({ params, context }) => {
    const detail = await ensure(context, sessionDetailQuery(params.id))
    if (!detail) throw notFound()
    return detail
  },
  notFoundComponent: () => <NotFound title="Session" description="No events found for this session id in the current window." />,
  component: SessionLayout,
  pendingComponent: SessionLayout,
})

function SessionLayout() {
  const s = usePageQuery(sessionDetailQuery(Route.useParams().id))
  const { id } = Route.useParams()
  const minutes = s ? Math.max(1, Math.round((Date.parse(s.last) - Date.parse(s.first)) / 60_000)) : 0

  return (
    <EntityFrame
      kind="Session"
      title={id}
      basePath={`/sessions/${encodeURIComponent(id)}`}
      tokens={s && (<EntityLink kind="country" id={s.country}>
          <Token size="sm" color="blue" label={s.country} />
        </EntityLink>)}
      facts={[
        { label: 'Source', value: s && (<EntityLink kind="source" id={s.srcIp} />)},
        { label: 'Started', value: s && (formatDateTime(s.first))},
        { label: 'Duration', value: s && (`${formatNumber(minutes)} min`)},
        { label: 'Events', value: s && (formatNumber(s.events.length))},
        { label: 'Sensors', value: s && (s.sensors.map((r) => r.label).join(', '))},
      ]}
    >
      <Outlet />
    </EntityFrame>
  )
}

/** The top-bar tabs: static until the loader data arrives, then with counts. */
function tabsFor(loaded: unknown): ViewTab[] {
  if (!loaded) return [{ id: 'timeline', label: 'Timeline' }, { id: 'commands', label: 'Commands' }, { id: 'credentials', label: 'Credentials' }, { id: 'downloads', label: 'Downloads' }, { id: 'recording', label: 'Recording' }, { id: 'attck', label: 'ATT&CK' }, { id: 'raw', label: 'Raw' }]
  const data = loaded as ReturnType<typeof Route.useLoaderData>
  const s = data
  return [
    { id: 'timeline', label: 'Timeline', count: s?.events.length },
    { id: 'commands', label: 'Commands', count: s?.commands.length },
    { id: 'credentials', label: 'Credentials', count: s?.credentials.length },
    { id: 'downloads', label: 'Downloads', count: s?.payloads.length },
    { id: 'recording', label: 'Recording' },
    { id: 'attck', label: 'ATT&CK', count: s?.techniques.length },
    // A mail sensor's session carries the message it delivered.
    ...(s?.events.some((e: { sensor: string }) => e.sensor === 'mailoney') ? [{ id: 'mail', label: 'Message' }] : []),
    { id: 'raw', label: 'Raw' },
  ]
}
