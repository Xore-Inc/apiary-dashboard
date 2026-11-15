import { pageSsr } from '#/lib/pageSsr'
import { ActionLink } from '#/components/ActionLink'
import { Grid } from '@astryxdesign/core/Grid'
import { VStack } from '@astryxdesign/core/Stack'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { RelatedPanel } from '#/components/Related'
import { StatTile } from '#/components/DashboardBlocks'
import { EventsPanel } from '#/components/DetailBlocks'
import { startQuery, usePageQuery } from '#/lib/query'
import { iocQuery, relatedQuery } from '#/data/resources'
import { Deferred } from '#/components/Deferred'

const parent = getRouteApi('/_layout/ioc/$kind/$value')

export const Route = createFileRoute('/_layout/ioc/$kind/$value/')({
  ssr: pageSsr,
  // The slow read starts here and the page renders without waiting for it.
  loader: ({ params, context }) => startQuery(context, relatedQuery('ioc', `${params.kind}:${params.value}`)),
  component: IocOverview,
  pendingComponent: IocOverview,
})

function IocOverview() {
  const ioc = usePageQuery(iocQuery(parent.useParams().kind, parent.useParams().value))
  const { kind, value } = parent.useParams()
  const base = `/ioc/${kind}/${encodeURIComponent(value)}`
  return (
    <VStack gap={4}>
      <Grid columns={{ minWidth: 170, repeat: 'fit' }} gap={4}>
        <StatTile label="Events" value={ioc?.events.length} href={`${base}/events`} />
        <StatTile label="Source IPs" value={ioc?.group.members.length} href={`${base}/sources`} />
        <StatTile label="Sessions" value={ioc?.sessions.length} href={`${base}/sessions`} />
        <StatTile label="Payloads after it" value={ioc?.payloads.length} href={`${base}/payloads`} />
      </Grid>
      <EventsPanel title="Newest events" events={ioc?.events.slice(0, 5)} showSource action={<ActionLink href={`${base}/events`}>All events</ActionLink>} />
      <Deferred query={relatedQuery('ioc', `${Route.useParams().kind}:${Route.useParams().value}`)}>{(groups) => <RelatedPanel center={value} groups={groups} />}</Deferred>
    </VStack>
  )
}
