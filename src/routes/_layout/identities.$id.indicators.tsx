import { pageSsr } from '#/lib/pageSsr'
import { Grid } from '@astryxdesign/core/Grid'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { ValueList } from '#/components/EntityBlocks'
import { usePageQuery } from '#/lib/query'
import { identityQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/identities/$id')

export const Route = createFileRoute('/_layout/identities/$id/indicators')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const a = usePageQuery(identityQuery(parent.useParams().id))?.identity
    return (
      <Grid columns={{ minWidth: 300, repeat: 'fit' }} gap={4}>
        <ValueList title="Fingerprints" kind="fingerprint" values={a?.fingerprints} />
        <ValueList title="Payloads" kind="payload" values={a?.payloads} />
        <ValueList title="Credential pairs" kind="credential" values={a?.credentials} />
        <ValueList title="Sensors" kind="sensor" values={a?.sensors} />
      </Grid>
    )
  }
