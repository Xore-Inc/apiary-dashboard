import { pageSsr } from '#/lib/pageSsr'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { MetaItem } from '#/components/MetaItem'
import { Grid } from '@astryxdesign/core/Grid'
import { Link } from '@astryxdesign/core/Link'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { RelatedPanel } from '#/components/Related'
import { Panel, StatTile } from '#/components/DashboardBlocks'
import { formatDateTime } from '#/lib/format'
import { ensure, usePageQuery } from '#/lib/query'
import { relatedQuery } from '#/data/resources'
import { usePayloadPage } from '#/data/pageData'

const parent = getRouteApi('/_layout/payloads/$hash')

export const Route = createFileRoute('/_layout/payloads/$hash/')({
  ssr: pageSsr,
  loader: ({ params, context }) => ensure(context, relatedQuery('payload', params.hash)),
  component: PayloadOverview,
  pendingComponent: PayloadOverview,
})

function PayloadOverview() {
  const loaded = usePayloadPage(parent.useParams().hash)
  const a = loaded?.analysis
  const cape = loaded?.cape
  const revdeck = loaded?.revdeck
  const github = loaded?.github
  const p = a?.payload
  // The hash is in the address.
  const { hash } = parent.useParams()
  const base = `/payloads/${hash}`
  const analyses: Array<[string, string, string | null]> = [
    ['Sandbox', 'sandbox', a?.sandbox ? `${a.sandbox.verdict}, risk ${a.sandbox.risk}` : null],
    ['Ghidra', 'ghidra', a?.ghidra ? 'decompiled' : null],
    ['CAPE', 'cape', cape ? `malscore ${cape.malscore}` : null],
    ['RevDeck', 'revdeck', revdeck ? revdeck.verdict : null],
    ['GitHub', 'github', github ? `${github.detections}/${github.engines} engines` : null],
  ]
  return (
    <VStack gap={4}>
      <Text type="code">{hash}</Text>
      <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={4}>
        <StatTile label="Static risk" value={a?.staticRisk} caption="out of 100" href={`${base}/static`} />
        <StatTile label="Packing likelihood" value={a?.packingLikelihood} caption="percent" href={`${base}/static`} />
        <StatTile label="Extracted IOCs" value={a?.iocs.length} href={`${base}/indicators`} />
        <StatTile label="YARA matches" value={a?.yara.length} href={`${base}/indicators`} />
      </Grid>
      <Panel title="Analyses of this sample">
        <HStack gap={4} wrap="wrap">
          {!loaded && <Skeleton width={480} height={14} />}
          {loaded && analyses.map(([label, tab, result]) =>
            result ? (
              <Link key={tab} href={`${base}/${tab}`}>{`${label}: ${result}`}</Link>
            ) : (
              <Text key={tab} type="supporting">{`${label}: not run`}</Text>
            ),
          )}
        </HStack>
      </Panel>
      <Grid columns={{ minWidth: 340, repeat: 'fit' }} gap={4}>
        <Panel title="What this file is">
          <MetadataList label={{ position: 'start', width: 128 }}>
            <MetaItem label="File type">{a?.fileType}</MetaItem>
            <MetaItem label="Platform">{p && (p.platform)}</MetaItem>
            <MetaItem label="MIME">{p && (p.mime)}</MetaItem>
            <MetaItem label="Size">{p && (`${p.sizeBytes.toLocaleString('en-US')} bytes`)}</MetaItem>
            <MetaItem label="Copies captured">{p && (String(p.copies))}</MetaItem>
            <MetaItem label="First captured">{p && (formatDateTime(p.capturedAt))}</MetaItem>
            {a?.entryPoint && <MetadataListItem label="Entry point">{a.entryPoint}</MetadataListItem>}
            {a?.classification && <MetadataListItem label="Script class">{a.classification}</MetadataListItem>}
            <MetaItem label="Analysis path">{p && (p.dynamic ? 'static + dynamic (sandbox route available)' : 'static only')}</MetaItem>
            <MetaItem label="MD5">{a && <Text type="code">{a.hashes.md5}</Text>}</MetaItem>
            <MetaItem label="SHA-1">{a && <Text type="code">{a.hashes.sha1}</Text>}</MetaItem>
            <MetaItem label="ssdeep">{a && <Text type="code">{a.hashes.ssdeep}</Text>}</MetaItem>
          </MetadataList>
        </Panel>
      </Grid>
      <RelatedPanel center={`${hash.slice(0, 16)}…`} groups={usePageQuery(relatedQuery('payload', Route.useParams().hash))} />
    </VStack>
  )
}
