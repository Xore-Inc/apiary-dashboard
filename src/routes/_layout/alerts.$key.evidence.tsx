import { pageSsr } from '#/lib/pageSsr'
import { Grid } from '@astryxdesign/core/Grid'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import { ValueList } from '#/components/EntityBlocks'
import { usePageQuery } from '#/lib/query'
import { alertDetailQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/alerts/$key')

export const Route = createFileRoute('/_layout/alerts/$key/evidence')({
  ssr: pageSsr,
  component: AlertEvidence,
  pendingComponent: AlertEvidence,
})

/** The addresses and files the alert records name. */
function AlertEvidence() {
  const loaded = usePageQuery(alertDetailQuery(parent.useParams().key))
  const sources = loaded?.sources
  const hashes = loaded?.hashes
  return (
    <Grid columns={{ minWidth: 320, repeat: 'fit' }} gap={4}>
      <ValueList
        title="Source IPs"
        kind="source"
        values={sources}
        empty="No address is named in these alerts."
      />
      <Panel title={hashes ? `File hashes (${hashes.length})` : "File hashes"}>
        {hashes?.length ? (
          <VStack gap={1}>
            {hashes.map((h) => (
              <Text key={h} type="code" maxLines={3} wordBreak="break-all">
                {h}
              </Text>
            ))}
          </VStack>
        ) : (
          <Text type="supporting">No file hash is named in these alerts.</Text>
        )}
      </Panel>
    </Grid>
  )
}
