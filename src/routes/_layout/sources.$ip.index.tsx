import { pageSsr } from '#/lib/pageSsr'
import { ActionLink } from '#/components/ActionLink'
import { Grid } from '@astryxdesign/core/Grid'
import { VStack } from '@astryxdesign/core/Stack'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { RelatedPanel } from '#/components/Related'
import { StatTile } from '#/components/DashboardBlocks'
import { EventsPanel } from '#/components/DetailBlocks'
import { osGuessCaption } from '#/components/EntityBlocks'
import { startQuery, usePageQuery } from '#/lib/query'
import { ipProfileQuery, relatedQuery } from '#/data/resources'
import { Deferred } from '#/components/Deferred'

const parent = getRouteApi('/_layout/sources/$ip')

export const Route = createFileRoute('/_layout/sources/$ip/')({
  ssr: pageSsr,
  // The slow read starts here and the page renders without waiting for it.
  loader: ({ params, context }) => startQuery(context, relatedQuery('source', params.ip)),
  component: SourceOverview,
  pendingComponent: SourceOverview,
})

function SourceOverview() {
  const p = usePageQuery(ipProfileQuery(parent.useParams().ip))
  const { ip } = parent.useParams()
  const base = `/sources/${ip}`
  return (
    <VStack gap={4}>
      <Grid columns={{ minWidth: 170, repeat: 'fit' }} gap={4}>
        <StatTile label="Events" value={p?.source.events} href={`${base}/events`} />
        <StatTile label="Logins" value={p?.source.logins} href={`/events?ip=${ip}&kind=login`} />
        <StatTile label="Sessions" value={p?.source.sessions} href={`${base}/sessions`} />
        <StatTile label="Sensors reached" value={p?.correlation.distinctSensors} href={`${base}/breakdown`} />
        <StatTile label="Tunnel connections" value={p?.correlation.tunnelConnections} caption={p ? osGuessCaption(p.correlation.tunnelOsGuesses) : ''} />
        <StatTile label="ATT&CK techniques" value={p?.techniques.length} href={`${base}/behavior`} />
      </Grid>
      <EventsPanel title="Newest events" events={p?.events.slice(0, 5)} action={<ActionLink href={`${base}/events`}>All events</ActionLink>} />
      <Deferred query={relatedQuery('source', Route.useParams().ip)}>{(groups) => <RelatedPanel center={parent.useParams().ip} groups={groups} />}</Deferred>
    </VStack>
  )
}
