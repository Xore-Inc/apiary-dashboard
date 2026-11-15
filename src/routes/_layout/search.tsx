import { pageSsr } from '#/lib/pageSsr'
import { ActionLink } from '#/components/ActionLink'
import { textParam } from '#/lib/searchParams'
import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { Link } from '@astryxdesign/core/Link'
import { List, ListItem } from '@astryxdesign/core/List'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { createFileRoute } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import { PageFrame } from '#/components/PageFrame'
import { SkeletonPanels } from '#/components/EntityBlocks'
import { ensure, usePageQuery } from '#/lib/query'
import { searchAllQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/search')({
  ssr: pageSsr,
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: textParam(search.q),
  }),
  loaderDeps: ({ search }) => ({ q: search.q ?? '' }),
  loader: ({ deps, context }) => ensure(context, searchAllQuery(deps.q, 50)),
  component: SearchPage,
  pendingComponent: SearchPage,
})

function SearchPage() {
  const groups = usePageQuery(searchAllQuery(Route.useLoaderDeps().q, 50))
  const { q } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [draft, setDraft] = useState(q ?? '')
  const run = () => void navigate({ search: { q: draft.trim() || undefined } })

  return (
    <PageFrame title="Search" description="Grouped matches across everything the dashboard shows: sources, networks, campaigns, alerts, anomalies, payloads, reports, and more.">
      <VStack gap={5}>
        <HStack gap={2} vAlign="end">
          <StackItem size="fill">
            <TextInput label="Search" isLabelHidden placeholder="IP, session, hash, credential, command…" value={draft} onChange={setDraft} onEnter={run} />
          </StackItem>
          <Button label="Search" onClick={run} />
        </HStack>
        {!q ? (
          <EmptyState icon={<Icon icon={MagnifyingGlassIcon} size="lg" />} title="Search everything" description="Try an IP prefix like 198.51, a username like root, or a family like Mirai." />
        ) : !groups ? (
          <SkeletonPanels count={4} lines={5} />
        ) : groups.length === 0 ? (
          <EmptyState icon={<Icon icon={MagnifyingGlassIcon} size="lg" />} title={`Nothing matched “${q}”`} description="Try a shorter term, or look it up as an indicator." />
        ) : (
          <Grid columns={{ minWidth: 360, repeat: 'fit' }} gap={4}>
            {groups.map((group) => (
              <Panel key={group.id} title={group.title} action={<Token size="sm" label={String(group.total)} />}>
                <List density="compact" hasDividers>
                  {group.items.map((item) => (
                    <ListItem
                      key={`${item.href}-${item.label}`}
                      label={<Link href={item.href}><Text type="code" maxLines={1}>{item.label}</Text></Link>}
                      description={item.detail}
                    />
                  ))}
                </List>
                {group.total > group.items.length && (group.moreHref ? <ActionLink href={group.moreHref}>{`${group.total - group.items.length} more`}</ActionLink> : <Text type="supporting">{group.total - group.items.length} more not shown</Text>)}
              </Panel>
            ))}
          </Grid>
        )}
      </VStack>
    </PageFrame>
  )
}
