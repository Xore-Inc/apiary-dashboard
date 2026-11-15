import { pageSsr } from '#/lib/pageSsr'
import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { RecordingDownloads } from '#/components/RecordingDownloads'
import { EntityFrame } from '#/components/EntityFrame'
import { entityTabs } from '#/components/ViewTabs'
import type { ViewTab } from '#/components/ViewTabs'
import { EntityLink } from '#/components/EntityLink'
import { NotFound } from '#/components/NotFound'
import { formatDateTime, formatNumber } from '#/lib/format'
import { ensure, usePageQuery } from '#/lib/query'
import { replayDetailQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/recordings/$shasum')({
  ssr: pageSsr,
  staticData: { viewTabs: entityTabs({ label: 'Session recording views', basePath: (params) => `/recordings/${params.shasum}`, tabs: tabsFor }) },
  loader: async ({ params, context }) => {
    const detail = await ensure(context, replayDetailQuery(params.shasum))
    if (!detail) throw notFound()
    return detail
  },
  notFoundComponent: () => (
    <NotFound
      title="Session recording"
      description="No recording found for this id."
    />
  ),
  component: RecordingLayout,
  pendingComponent: RecordingLayout,
})

/** One terminal recording, shared by every session that produced the same
 * bytes, since bot traffic repeats itself. */
function RecordingLayout() {
  const loaded = usePageQuery(replayDetailQuery(Route.useParams().shasum))
  const { shasum } = Route.useParams()
  const replay = loaded?.replay
  const sessions = loaded?.sessions
  const attacker = loaded?.attacker
  return (
    <EntityFrame
      kind="Session recording"
      title={`${shasum.slice(0, 16)}…`}
      basePath={`/recordings/${shasum}`}
      actions={
        <RecordingDownloads shasum={shasum} />
      }
      facts={[
        {
          label: 'Duration',
          value: replay && (`${formatNumber(replay.durationSeconds)} s`),
        },
        { label: 'Sessions', value: sessions && formatNumber(sessions.length) },
        {
          label: 'First closed',
          value: sessions && (sessions[0] ? formatDateTime(sessions[0].when) : '—'),
        },
        {
          label: 'Source',
          value: loaded && (attacker ? <EntityLink kind="source" id={attacker.ip} /> : 'unattributed'),
        },
      ]}
    >
      <Outlet />
    </EntityFrame>
  )
}

/** The top-bar tabs: static until the loader data arrives, then with counts. */
function tabsFor(loaded: unknown): ViewTab[] {
  if (!loaded) return [{ id: 'playback', label: 'Playback' }, { id: 'sessions', label: 'Sessions' }, { id: 'attacker', label: 'Attacker' }]
  const data = loaded as ReturnType<typeof Route.useLoaderData>
  const { sessions } = data
  return [
    { id: 'playback', label: 'Playback' },
    { id: 'sessions', label: 'Sessions', count: sessions?.length },
    { id: 'attacker', label: 'Attacker' },
  ]
}
