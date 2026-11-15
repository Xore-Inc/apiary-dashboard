import { pageSsr } from '#/lib/pageSsr'
import { Grid } from '@astryxdesign/core/Grid'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { MiniTable } from '#/components/DashboardBlocks'
import { usePageQuery } from '#/lib/query'
import { ipProfileQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/sources/$ip')

export const Route = createFileRoute('/_layout/sources/$ip/breakdown')({ ssr: pageSsr, component: SourceBreakdown, pendingComponent: SourceBreakdown })

/** What this address reached and what it tried, as leaderboards. */
function SourceBreakdown() {
  const p = usePageQuery(ipProfileQuery(parent.useParams().ip))
  return (
    <Grid columns={{ minWidth: 300, repeat: 'fit' }} gap={4}>
      <MiniTable title="Credential pairs tried" header="user:password" rows={p?.credentials} entity="credential" />
      <MiniTable title="Commands run" header="Command" rows={p?.commands} entity="command" />
      <MiniTable title="IDS alerts" header="Signature" rows={p?.alerts} entity="signature" />
      <MiniTable title="Sensors contacted" header="Sensor" rows={p?.sensors} entity="sensor" />
      <MiniTable title="Targeted ports" header="Port" rows={p?.ports} entity="port" />
      <MiniTable title="Protocols" header="Protocol" rows={p?.protocols} />
      <MiniTable title="HTTP paths" header="Path" rows={p?.paths} entity="url" />
    </Grid>
  )
}
