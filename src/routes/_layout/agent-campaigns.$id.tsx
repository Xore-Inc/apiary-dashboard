import { pageSsr } from '#/lib/pageSsr'
import { Pending } from '#/components/Pending'
import { HStack } from '@astryxdesign/core/Stack'
import { Token } from '@astryxdesign/core/Token'
import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { categoryLabel } from '#/components/details/AgentCampaign'
import { EntityFrame } from '#/components/EntityFrame'
import { entityTabs } from '#/components/ViewTabs'
import type { ViewTab } from '#/components/ViewTabs'
import { NotFound } from '#/components/NotFound'
import { SeverityToken } from '#/components/SeverityToken'
import type { ResourceData } from '#/lib/query'
import { formatDateTime, formatNumber } from '#/lib/format'
import { ensure, usePageQuery } from '#/lib/query'
import { agentCampaignQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/agent-campaigns/$id')({
  ssr: pageSsr,
  staticData: { viewTabs: entityTabs({ label: 'Agent campaign views', basePath: (params) => `/agent-campaigns/${encodeURIComponent(params.id)}`, tabs: tabsFor }) },
  loader: async ({ params, context }) => {
    const detail = await ensure(context, agentCampaignQuery(params.id))
    if (!detail) throw notFound()
    return detail
  },
  notFoundComponent: () => (
    <NotFound
      title="Agent campaign"
      description="No agent campaign has this id."
    />
  ),
  component: AgentCampaignLayout,
  pendingComponent: AgentCampaignLayout,
})

function AgentCampaignLayout() {
  const loaded = usePageQuery(agentCampaignQuery(Route.useParams().id))
  const { id } = Route.useParams()
  const c = loaded?.campaign
  return (
    <EntityFrame
      kind="Agent campaign"
      title={<Pending width={320}>{c && c.id}</Pending>}
      basePath={`/agent-campaigns/${encodeURIComponent(id)}`}
      tokens={c && (<HStack gap={1} wrap="wrap">
          <SeverityToken severity={c.severity} />
          {c.categories.map((category) => (
            <Token key={category} size="sm" label={categoryLabel(category)} />
          ))}
        </HStack>)}
      facts={[
        { label: 'Started', value: c && (formatDateTime(c.start))},
        { label: 'Ended', value: c && (formatDateTime(c.end))},
        { label: 'Events', value: c && (formatNumber(c.eventCount))},
        { label: 'Identifiers', value: c && (formatNumber(c.identifiers.length))},
      ]}
    >
      <Outlet />
    </EntityFrame>
  )
}

/** The top-bar tabs: static until the loader data arrives, then with counts. */
function tabsFor(loaded: unknown): ViewTab[] {
  if (!loaded) return [{ id: 'overview', label: 'Overview' }, { id: 'evidence', label: 'Evidence timeline' }, { id: 'rules', label: 'Rules & decode chains' }, { id: 'events', label: 'Events' }]
  const { campaign: c, events } = loaded as NonNullable<ResourceData<typeof agentCampaignQuery>>
  const rules = new Set(c.events.flatMap((e) => e.matchedRules.map((r) => r.rule)))
  return [
    { id: 'overview', label: 'Overview' },
    { id: 'evidence', label: 'Evidence timeline', count: c.events.length },
    { id: 'rules', label: 'Rules & decode chains', count: rules.size },
    { id: 'events', label: 'Events', count: events.length },
  ]
}
