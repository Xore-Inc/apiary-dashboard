import { pageSsr } from '#/lib/pageSsr'
import { Token } from '@astryxdesign/core/Token'
import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { PayloadOperatorMenu, VERDICT_COLOR } from '#/components/analyzers/PayloadBlocks'
import { EntityFrame } from '#/components/EntityFrame'
import { OpenInMenu } from '#/components/OpenInMenu'
import { PayloadReportButton } from '#/components/analyzers/PayloadReportButton'
import { virusTotalLink } from '#/lib/toolLinks'
import { entityTabs } from '#/components/ViewTabs'
import type { ViewTab } from '#/components/ViewTabs'
import { NotFound } from '#/components/NotFound'
import { loadPayloadPage, usePayloadPage } from '#/data/pageData'
import { formatDateTime, formatNumber } from '#/lib/format'
import { GHIDRA_SECTIONS } from '#/components/analyzers/GhidraResult'
import { SANDBOX_SECTIONS } from '#/components/analyzers/SandboxResult'

const LINUX_SANDBOX = SANDBOX_SECTIONS.filter((s) => s.id !== 'file')

export const Route = createFileRoute('/_layout/payloads/$hash')({
  ssr: pageSsr,
  staticData: { viewTabs: entityTabs({ label: 'Payload views', basePath: (params) => `/payloads/${params.hash}`, tabs: tabsFor }) },
  loader: async ({ params, context }) => {
    const page = await loadPayloadPage(context, params.hash)
    if (!page) throw notFound()
    return page
  },
  notFoundComponent: () => <NotFound title="Payload" description="No captured payload has this hash." />,
  component: PayloadLayout,
  pendingComponent: PayloadLayout,
})

/** One captured file and every analysis of it, in one place (epic #25). */
function PayloadLayout() {
  const loaded = usePayloadPage(Route.useParams().hash)
  // The hash is in the address: the title and the actions need no data.
  const { hash } = Route.useParams()
  const a = loaded?.analysis
  const delivery = loaded?.delivery
  const p = a?.payload

  return (
    <EntityFrame
      kind="Payload"
      title={`${hash.slice(0, 16)}…`}
      description={a && p ? `${a.fileType} · ${p.platform}` : undefined}
      basePath={`/payloads/${hash}`}
      actions={
        <>
          <PayloadReportButton hash={hash} />
          <PayloadOperatorMenu hash={hash} />
          <OpenInMenu links={[virusTotalLink(hash)]} />
        </>
      }
      tokens={
        p && (
          <>
            {p.verdict && <Token size="sm" color={VERDICT_COLOR[p.verdict.label]} label={p.verdict.label} />}
            {p.verdict?.family && <Token size="sm" color="purple" label={p.verdict.family} />}
            {p.sources.map((s) => (
              <Token key={s} size="sm" label={s} />
            ))}
          </>
        )
      }
      facts={[
        { label: 'Size', value: p && `${formatNumber(p.sizeBytes)} bytes` },
        { label: 'First captured', value: p && formatDateTime(p.capturedAt) },
        { label: 'Copies', value: p && formatNumber(p.copies) },
        { label: 'Static risk', value: a && `${a.staticRisk} / 100` },
        { label: 'Delivered by', value: delivery && `${formatNumber(delivery.sources.length)} ${delivery.sources.length === 1 ? 'address' : 'addresses'}` },
      ]}
    >
      <Outlet />
    </EntityFrame>
  )
}

/** The top-bar tabs: static until the loader data arrives, then with counts. */
function tabsFor(loaded: unknown): ViewTab[] {
  if (!loaded) return [{ id: 'overview', label: 'Overview' }, { id: 'static', label: 'Static' }, { id: 'indicators', label: 'Indicators' }, { id: 'sandbox', label: 'Sandbox', sections: LINUX_SANDBOX }, { id: 'ghidra', label: 'Ghidra', sections: GHIDRA_SECTIONS }, { id: 'cape', label: 'CAPE' }, { id: 'revdeck', label: 'RevDeck' }, { id: 'github', label: 'GitHub' }, { id: 'delivered-by', label: 'Delivered by' }, { id: 'sessions', label: 'Sessions' }, { id: 'timeline', label: 'Timeline' }]
  const data = loaded as ReturnType<typeof Route.useLoaderData>
  const { analysis: a, delivery } = data
  return [
    { id: 'overview', label: 'Overview' },
    { id: 'static', label: 'Static' },
    { id: 'indicators', label: 'Indicators', count: a?.iocs.length + a?.yara.length },
    // File forensics reads a Windows PE; other samples have nothing there.
    { id: 'sandbox', label: 'Sandbox', sections: a?.payload.kind === 'PE32' ? SANDBOX_SECTIONS : LINUX_SANDBOX },
    { id: 'ghidra', label: 'Ghidra', sections: GHIDRA_SECTIONS },
    { id: 'cape', label: 'CAPE' },
    { id: 'revdeck', label: 'RevDeck' },
    { id: 'github', label: 'GitHub' },
    { id: 'delivered-by', label: 'Delivered by', count: delivery?.sources.length },
    { id: 'sessions', label: 'Sessions', count: delivery?.sessions.length },
    { id: 'timeline', label: 'Timeline' },
  ]
}
