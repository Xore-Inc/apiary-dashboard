import { pageSsr } from '#/lib/pageSsr'
import { Grid } from '@astryxdesign/core/Grid'
import { Text } from '@astryxdesign/core/Text'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { MiniTable } from '#/components/DashboardBlocks'
import { useSensorPage } from '#/data/pageData'

const parent = getRouteApi('/_layout/sensors/$sensor')

export const Route = createFileRoute('/_layout/sensors/$sensor/leaderboards')({ ssr: pageSsr, component: SensorLeaderboards, pendingComponent: SensorLeaderboards })

/** This sensor's own leaderboards: the fields that mean something for its protocols. */
function SensorLeaderboards() {
  const loaded = useSensorPage(parent.useParams().sensor)
  const detail = loaded?.detail
  if (detail?.topLists.length === 0) return <Text type="supporting">This sensor type has no leaderboards of its own.</Text>
  // One block per list, each its own titled table (the breakdown pages' block).
  return (
    <Grid columns={{ minWidth: 280, repeat: 'fit' }} gap={4}>
      {detail?.topLists.map((list) => (
        <MiniTable key={list.label} title={list.label.charAt(0).toUpperCase() + list.label.slice(1)} rows={list.rows} isCode />
      ))}
    </Grid>
  )
}
