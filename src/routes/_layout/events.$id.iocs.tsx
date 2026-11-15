import { pageSsr } from '#/lib/pageSsr'
import { SkeletonPanels, ValueList } from '#/components/EntityBlocks'
import { Grid } from '@astryxdesign/core/Grid'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { usePageQuery } from '#/lib/query'
import { eventDetailQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/events/$id')

export const Route = createFileRoute('/_layout/events/$id/iocs')({ ssr: pageSsr, component: EventIocs, pendingComponent: EventIocs })

/** Every value in this event you can pivot on. */
function EventIocs() {
  const loaded = usePageQuery(eventDetailQuery(parent.useParams().id))
  if (!loaded) return <SkeletonPanels count={4} lines={3} />
  const event = loaded.event
  const hashes = loaded.hashes
  const opt = (v?: string) => (v ? [v] : [])
  return (
    <Grid columns={{ minWidth: 280, repeat: 'fit' }} gap={4}>
      <ValueList title="Source IP" kind="source" values={[event.srcIp]} />
      <ValueList title="Autonomous system" kind="asn" values={opt(event.asn)} />
      <ValueList title="Country" kind="country" values={opt(event.country)} />
      <ValueList title="Username" kind="username" values={opt(event.username)} />
      <ValueList title="Password" kind="password" values={opt(event.password)} />
      <ValueList title="Command" kind="command" values={opt(event.command)} />
      <ValueList title="Hashes" kind="payload" values={hashes} />
    </Grid>
  )
}
