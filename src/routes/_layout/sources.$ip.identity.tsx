import { pageSsr } from '#/lib/pageSsr'
import { Grid } from '@astryxdesign/core/Grid'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import { EntityLink } from '#/components/EntityLink'
import { ValueList } from '#/components/EntityBlocks'
import { formatDateTime, formatNumber } from '#/lib/format'
import { ensure, usePageQuery } from '#/lib/query'
import { sourceIdentityQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/sources/$ip/identity')({
  ssr: pageSsr,
  loader: ({ params, context }) => ensure(context, sourceIdentityQuery(params.ip)),
  component: SourceIdentityTab,
  pendingComponent: SourceIdentityTab,
})

function SourceIdentityTab() {
  const identity = usePageQuery(sourceIdentityQuery(Route.useParams().ip))
  if (!identity)
    return <Text type="supporting">This address has not been linked to an attacker identity. Identities join addresses that share fingerprints, payloads or credentials.</Text>
  return (
    <VStack gap={4}>
      <Panel title="Attacker identity">
        <MetadataList orientation="horizontal" columns="multi">
          <MetadataListItem label="Identity">
            <EntityLink kind="identity" id={identity.id} />
          </MetadataListItem>
          <MetadataListItem label="Events">{formatNumber(identity.events)}</MetadataListItem>
          <MetadataListItem label="First seen">{formatDateTime(identity.first)}</MetadataListItem>
          <MetadataListItem label="Last seen">{formatDateTime(identity.last)}</MetadataListItem>
        </MetadataList>
        {identity.verdicts.length > 0 && (
          <HStack gap={1} wrap="wrap">
            {identity.verdicts.map((v) => (
              <Token key={v} size="sm" color="orange" label={v} />
            ))}
          </HStack>
        )}
        <Text type="supporting">Behavior context only, never actor attribution.</Text>
      </Panel>
      <Grid columns={{ minWidth: 280, repeat: 'fit' }} gap={4}>
        <ValueList title="Addresses" kind="source" values={identity.ips} />
        <ValueList title="Fingerprints" kind="fingerprint" values={identity.fingerprints} />
        <ValueList title="Payloads" kind="payload" values={identity.payloads} />
        <ValueList title="Credentials" kind="credential" values={identity.credentials} />
        <ValueList title="Sensors" kind="sensor" values={identity.sensors} />
      </Grid>
    </VStack>
  )
}
