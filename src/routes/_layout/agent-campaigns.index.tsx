import { pageSsr } from '#/lib/pageSsr'
import { Pending } from '#/components/Pending'
import { Banner } from '@astryxdesign/core/Banner'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute } from '@tanstack/react-router'
import { SkeletonTiles, StatTile } from '#/components/DashboardBlocks'
import { RecordList } from '#/components/RecordList'
import { SeverityToken } from '#/components/SeverityToken'
import type { AgentCampaign } from '#/data/types'
import { formatNumber, formatTime } from '#/lib/format'
import { categoryLabel } from '#/components/details/AgentCampaign'
import { entityHref } from '#/lib/entities'
import { ensure, usePageQuery } from '#/lib/query'
import { agentCampaignsQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/agent-campaigns/')({
  ssr: pageSsr,
  validateSearch: (search: Record<string, unknown>): { category?: string } => ({
    category: typeof search.category === 'string' && search.category ? search.category : undefined,
  }),
  loader: ({ context }) => ensure(context, agentCampaignsQuery()),
  component: AgentCampaignsPage,
  pendingComponent: AgentCampaignsPage,
})

const columns: TableColumn<AgentCampaign>[] = [
  { key: 'timestamp', header: 'Detected', width: pixel(96), renderCell: (row) => <Text type="supporting">{formatTime(row.timestamp)}</Text> },
  { key: 'severity', header: 'Severity', width: pixel(96), renderCell: (row) => <SeverityToken severity={row.severity} /> },
  { key: 'id', header: 'Campaign', width: pixel(136), renderCell: (row) => <Text type="code">{row.id}</Text> },
  {
    key: 'categories',
    header: 'Categories',
    width: proportional(3),
    renderCell: (row) => (
      <HStack gap={1} wrap="wrap">
        {row.categories.map((category) => (
          <Token key={category} label={categoryLabel(category)} size="sm" href={`/agent-campaigns?category=${category}`} />
        ))}
      </HStack>
    ),
  },
  { key: 'eventCount', header: 'Events', width: pixel(88), align: 'end', renderCell: (row) => formatNumber(row.eventCount) },
]

function AgentCampaignsPage() {
  const campaigns = usePageQuery(agentCampaignsQuery())
  const { category } = Route.useSearch()

  const counts = new Map<string, number>()
  for (const campaign of campaigns ?? []) {
    for (const cat of campaign.categories) counts.set(cat, (counts.get(cat) ?? 0) + 1)
  }
  const tiles = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const rows = category ? campaigns?.filter((campaign) => campaign.categories.includes(category)) : campaigns

  return (
    <RecordList
      title="Agent campaigns"
      description="Correlated AI-agent intrusion activity: encoded egress, tool-use fingerprints, and cross-sensor automation patterns."
      actions={
        <>
          <Text type="supporting">
            <Pending>{campaigns && rows && `${category ? `${rows.length} of ${campaigns.length}` : campaigns.length} campaigns`}</Pending>
          </Text>
          {category && (
            <Token label={`category: ${categoryLabel(category)}`} size="sm" color="blue" href="/agent-campaigns" description="Clear the category filter" />
          )}
        </>
      }
      summary={
        <VStack gap={4}>
          <Banner
            status="info"
            title="Deterministic scoring"
            description="Every campaign crossed a named trust boundary through a rule in criticality_rules.py, not a model's judgment call."
          />
          <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={4}>
            {!campaigns && <SkeletonTiles count={4} />}
            {tiles.map(([cat, count]) => (
              <StatTile key={cat} label={categoryLabel(cat)} value={count} caption="campaigns" href={`/agent-campaigns?category=${cat}`} />
            ))}
          </Grid>
        </VStack>
      }
      rows={rows}
      columns={columns}
      getId={(row) => row.id}
      getHref={(row) => entityHref('agent-campaign', row.id)!}
      emptyState={{
        title: category ? 'No campaigns in this category' : 'No agent campaigns yet',
        description: 'agent-intrusion-worker writes a campaign when correlated events cross a trust boundary.',
      }}
    />
  )
}
