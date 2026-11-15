import { pageSsr } from '#/lib/pageSsr'
import { Text } from '@astryxdesign/core/Text'
import { createFileRoute } from '@tanstack/react-router'
import { GHIDRA_SECTIONS, GhidraResult } from '#/components/analyzers/GhidraResult'
import type { GhidraSection } from '#/components/analyzers/GhidraResult'
import { sectionOf } from '#/components/ViewTabs'
import { ensure, usePageQuery } from '#/lib/query'
import { ghidraAnalysisQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/payloads/$hash/ghidra')({
  ssr: pageSsr,
  // ?section= picks overview, code, data, deep dive or raw (the top bar
  // lists them under Ghidra); ?fn= is the function open in Code.
  validateSearch: (search: Record<string, unknown>): { fn?: string; section?: GhidraSection } => ({
    fn: typeof search.fn === 'string' && search.fn ? search.fn : undefined,
    section: GHIDRA_SECTIONS.some((s) => s.id === search.section) && search.section !== 'overview' ? (search.section as GhidraSection) : undefined,
  }),
  loader: ({ params, context }) => ensure(context, ghidraAnalysisQuery(params.hash)),
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const g = usePageQuery(ghidraAnalysisQuery(Route.useParams().hash))
    const { fn, section } = Route.useSearch()
    return g ? <GhidraResult g={g} fn={fn} section={sectionOf(GHIDRA_SECTIONS, section) as GhidraSection} /> : <Text type="supporting">No Ghidra decompilation. Shell scripts are not decompiled.</Text>
  }
