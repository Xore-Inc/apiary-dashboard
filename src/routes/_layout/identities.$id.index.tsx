import { pageSsr } from '#/lib/pageSsr'
import { GroupOverview, SkeletonPanels } from '#/components/EntityBlocks'
import { ActionLink } from '#/components/ActionLink'
import { attckUrl } from '#/components/DetailBlocks'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { RelatedPanel } from '#/components/Related'
import { Panel } from '#/components/DashboardBlocks'
import { startQuery, usePageQuery } from '#/lib/query'
import { identityQuery, relatedQuery } from '#/data/resources'
import { Deferred } from '#/components/Deferred'

const parent = getRouteApi('/_layout/identities/$id')

export const Route = createFileRoute('/_layout/identities/$id/')({
  ssr: pageSsr,
  // The slow read starts here and the page renders without waiting for it.
  loader: ({ params, context }) => startQuery(context, relatedQuery('identity', params.id)),
  component: IdentityOverview,
  pendingComponent: IdentityOverview,
})


function IdentityOverview() {
  const loaded = usePageQuery(identityQuery(parent.useParams().id))
  const related = relatedQuery('identity', Route.useParams().id)
  if (!loaded) return <SkeletonPanels count={3} />
  const a = loaded.identity
  const group = loaded.group
  return (
    <VStack gap={4}>
      <Panel title="Identity">
        <MetadataList label={{ position: 'start', width: 112 }}>
          <MetadataListItem label="Entity id">
            <Text type="code">{a.id}</Text>
          </MetadataListItem>
          {a.scan && (
            <MetadataListItem label="Scan shape">
              {a.scan === 'horizontal' ? `horizontal: ${a.destIps} distinct destinations` : `vertical: ${a.portsTouched} ports across ${a.destIps} hosts`}
            </MetadataListItem>
          )}
        </MetadataList>
        {a.techniques.length > 0 && (
          <HStack gap={1} wrap="wrap">
            {a.techniques.map((t) => (
              <Token key={t} size="sm" color="blue" label={t} href={attckUrl(t)} />
            ))}
          </HStack>
        )}
        {a.ips.length > 0 && <ActionLink href={`/recordings?ip=${encodeURIComponent(a.ips[0])}`}>Session recordings</ActionLink>}
      </Panel>
      <GroupOverview group={group} base={`/identities/${a.id}`} sourcesTab="members" />
      <Deferred query={related}>{(groups) => <RelatedPanel center={a.id.slice(0, 8)} groups={groups} />}</Deferred>
    </VStack>
  )
}
